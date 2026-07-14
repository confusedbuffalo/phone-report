if (process.env.NO_DEBUG === 'true') {
    console.debug = () => {};
}

import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import pLimit from 'p-limit';
import { load } from 'js-yaml';
import { access } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { COUNTRIES, OSM_DIR, HISTORY_DIR, IS_TEST_MODE, REPORT_TYPES, BUILD_DIR, COUNT_TYPES } from './constants.js';
import { splitPbf, getOsmTimestamp, downloadPbf, filterPbf, withRetry } from './osm-download.js';
import { safeName } from './data-processor.js';
import { generateCountryIndexHtml } from './html-country.js';
import { generateMainIndexHtml } from './html-index.js';
import { generateHtmlReport } from './html-report.js';
import { getTranslations } from './i18n.js';
import { generateSafeEditFile } from './osm-safe-edits.js';
import { minify } from 'terser';
import { Transform } from 'stream';
import { validateNumbers } from './phone-processor.js';
import { validateNames } from './names-processor.js';
import { validateOpeningHours } from './opening-hours-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_TYPE = process.env.BUILD_TYPE;
// A test build will only fetch and process numbers for one subdivision of one division of one country
// (the first found of each, using the countries data file)
const testMode = BUILD_TYPE === 'simplified';

const VALIDATORS = {
    phone: validateNumbers,
    name: validateNames,
    hours: validateOpeningHours,
};

/**
 * Substitute any missing translations with default locale translation.
 * @param {Object} fullTranslations - The complete dictionary for a locale.
 * @param {Object} fullDefaultTranslations - The complete dictionary for the default locale.
 * @returns {Object} A full dictionary containing all keys.
 */
function createClientTranslations(fullTranslations, fullDefaultTranslations) {
    const clientTranslations = {};
    for (const key of Object.keys(fullDefaultTranslations)) {
        if (fullTranslations[key] !== undefined) {
            clientTranslations[key] = fullTranslations[key];
        } else if (fullDefaultTranslations[key] !== undefined) {
            clientTranslations[key] = fullDefaultTranslations[key];
        }
    }
    return clientTranslations;
}

async function downloadAndParseOfficialLanguages() {
    const url =
        'https://raw.githubusercontent.com/streetcomplete/countrymetadata/refs/heads/master/data/officialLanguages.yml';
    try {
        const response = await withRetry(() => axios.get(url), `Fetch official languages from ${url}`);
        const rawYaml = response.data;
        const dataObject = load(rawYaml);

        return dataObject;
    } catch (error) {
        console.error('Error fetching or parsing YAML:', error);
    }
}

/**
 * Saves the full history for the country to a JSON file to be backed up and used for
 * history analysis, falling back to previous history for any divisions that failed to fetch.
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report to generate history for.
 * @param {Object} originalCountryStats - The statistics for the country, included groupedDivisionStats.
 */
function saveCountryHistory(reportType, originalCountryStats) {
    const countryStats = structuredClone(originalCountryStats);

    const rootDir = path.join(HISTORY_DIR, reportType);

    const historyCountryDir = path.join(rootDir, countryStats.slug);
    if (!fs.existsSync(historyCountryDir)) {
        fs.mkdirSync(historyCountryDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const historyFilePath = path.join(historyCountryDir, `${today}.json`);

    const allDivisions = Object.values(countryStats.groupedDivisionStats).flat();
    const needsFallback = allDivisions.some(div => div.totalCount === 0);

    if (needsFallback) {
        const files = fs
            .readdirSync(historyCountryDir)
            .filter(f => f.endsWith('.json') && f !== `${today}.json`)
            .sort((a, b) => b.localeCompare(a));

        if (files.length > 0) {
            try {
                const lastHistoryPath = path.join(historyCountryDir, files[0]);
                const lastHistory = JSON.parse(fs.readFileSync(lastHistoryPath, 'utf8'));

                const historyMap = new Map();
                Object.values(lastHistory.groupedDivisionStats)
                    .flat()
                    .forEach(div => {
                        const compositeKey = `${div.divisionSlug}|${div.slug}`;
                        historyMap.set(compositeKey, div);
                    });

                for (const groupName in countryStats.groupedDivisionStats) {
                    countryStats.groupedDivisionStats[groupName] = countryStats.groupedDivisionStats[groupName].map(
                        div => {
                            const compositeKey = `${div.divisionSlug}|${div.slug}`;
                            if (div.totalCount === 0 && historyMap.has(compositeKey)) {
                                console.log(`Falling back to previous history for ${div.name}`);
                                return { ...historyMap.get(compositeKey) };
                            }
                            return div;
                        }
                    );
                }
            } catch (err) {
                console.error(`Failed to read history file for fallback: ${err.message}`);
            }
        }
    }

    // Recalculate top-Level totals in case of fallback being used
    let totalInvalid = 0;
    let totalAutoFixable = 0;
    let totalSafeEdit = 0;
    let totalCount = 0;

    Object.values(countryStats.groupedDivisionStats)
        .flat()
        .forEach(div => {
            totalInvalid += div.invalidCount || 0;
            totalAutoFixable += div.autoFixableCount || 0;
            totalSafeEdit += div.safeEditCount || 0;
            totalCount += div.totalCount || 0;
        });

    countryStats.invalidCount = totalInvalid;
    countryStats.autoFixableCount = totalAutoFixable;
    countryStats.safeEditCount = totalSafeEdit;
    countryStats.totalCount = totalCount;

    fs.writeFileSync(historyFilePath, JSON.stringify(countryStats, null, 2));
}

/**
 * Returns the list of subdivisions for a given administrative division from the configuration.
 * @param {Object} countryData - The configuration object for the country.
 * @param {string} divisionName - The name of the division.
 * @returns {Array<Object>} A list of subdivision objects.
 */
function getSubdivisions(countryData, divisionName) {
    // Helper to normalise the entry into a standard object
    const formatSubdivision = ([name, value]) => {
        if (typeof value === 'object' && value !== null) {
            return {
                name: name,
                id: value.relationId,
                countryCode: value.countryCode ?? countryData.countryCode,
                ...(value.pbfUrl && { pbfUrl: value.pbfUrl }),
                ...(value.timestamp && { timestamp: value.timestamp }),
            };
        }
        // Fallback for standard number-only format
        return {
            name: name,
            id: value,
            countryCode: countryData.countryCode,
        };
    };

    if (countryData.divisions) {
        console.debug(`Using single level of hardcoded divisions for ${countryData.name}...`);
        return Object.entries(countryData.divisions).map(formatSubdivision);
    }

    if (countryData.divisionMap) {
        console.debug(`Using hardcoded subdivisions for ${divisionName}...`);
        const subRegions = countryData.divisionMap[divisionName];
        if (subRegions) {
            return Object.entries(subRegions).map(formatSubdivision);
        }
        return [];
    }

    console.error(`Data for ${countryData.name} set up incorrectly, no divisions or divisionMap found`);
    return [];
}

/**
 * Creates an async generator stream of unique JSON objects from a geojsonseq file.
 * Uses a combination of @id and @type to ensure uniqueness across OSM types.
 * @param {string} filePath - Path to the .geojsonseq file.
 */
async function* createGeoJsonElementStream(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const seenElements = new Set();

    // Custom transformer to split by the Record Separator (\x1e)
    const rsSplitter = new Transform({
        readableObjectMode: true,
        transform(chunk, encoding, callback) {
            let data = (this._buffer || '') + chunk.toString();
            const parts = data.split('\x1e');

            // Keep the last partial part in the buffer
            this._buffer = parts.pop();

            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed) this.push(trimmed);
            }
            callback();
        },
        flush(callback) {
            if (this._buffer && this._buffer.trim()) {
                this.push(this._buffer.trim());
            }
            callback();
        },
    });

    const pipeline = fileStream.pipe(rsSplitter);

    for await (const cleanLine of pipeline) {
        try {
            const feature = JSON.parse(cleanLine);
            const props = feature.properties;

            if (props && props['@id'] && props['@type']) {
                // Create a composite key, e.g., "way/10432"
                const compositeKey = `${props['@type']}/${props['@id']}`;

                if (!seenElements.has(compositeKey)) {
                    seenElements.add(compositeKey);
                    yield feature;
                }
            } else {
                // If metadata is missing, yield anyway to avoid data loss
                yield feature;
            }
        } catch (err) {
            console.error('Error parsing JSON line:', err);
            console.log(cleanLine);
        }
    }

    seenElements.clear();
}

/**
 * Converts a timestamp string to a JavaScript Date object.
 * @param {string} timestampStr - The raw timestamp from the metadata file.
 * @returns {Date|null} - A valid Date object or null if parsing fails.
 */
function parseOsmTimestamp(timestampStr) {
    if (!timestampStr) return null;

    const date = new Date(timestampStr);

    // Check if the date is valid
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Processes a single subdivision: processes OSM data, validates tags,
 * generates the HTML report and returns statistics.
 * @param {Object} subdivision - The subdivision object (with name and id).
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report to filter for.
 * @param {Object} countryData - The configuration object for the country.
 * @param {string} rawDivisionName - The unescaped name of the parent division.
 * @param {Object} clientTranslations - The client-side translations.
 * @returns {Promise<Object>} A promise that resolves to a statistics object for the subdivision.
 */
async function processSubdivision(subdivision, reportType, countryData, rawDivisionName, clientTranslations) {
    const countryName = countryData.name;

    const geojsonPath = path.join(OSM_DIR, reportType, `${subdivision.id}.geojsonseq`);
    try {
        await access(geojsonPath);
    } catch {
        console.error(`Error: File not found at ${geojsonPath}`);
        return {};
    }

    const elementStream = createGeoJsonElementStream(geojsonPath);

    const tmpFilePath = path.join(os.tmpdir(), `invalid-items-${uuidv4()}.json`);
    const botEnabled = countryData.safeAutoFixBotEnabled;

    const parsedTimestamp = parseOsmTimestamp(subdivision.timestamp || countryData.timestamp);
    const dataTimestamp = parsedTimestamp ? parsedTimestamp : new Date();

    const baseStats = {
        name: subdivision.name,
        divisionSlug: safeName(rawDivisionName),
        slug: safeName(subdivision.name),
        lastUpdated: dataTimestamp.toISOString(),
    };

    const validate = VALIDATORS[reportType];
    if (!validate) throw new Error(`Unsupported report type: ${reportType}`);

    const countryOption = reportType === 'hours' ? countryData.locale : subdivision.countryCode;

    const validationResult = await validate(elementStream, countryOption, tmpFilePath);

    if (reportType === 'phone' && botEnabled) {
        validationResult.invalidCount -= validationResult.safeEditCount;
        validationResult.autoFixableCount -= validationResult.safeEditCount;
    }

    const dynamicCounts = {};
    COUNT_TYPES[reportType].forEach(countType => {
        dynamicCounts[countType] = validationResult[countType];
    });

    const stats = {
        ...baseStats,
        ...dynamicCounts,
    };

    fs.unlinkSync(geojsonPath);

    const countryDir = path.join(BUILD_DIR, reportType, safeName(countryName));
    const divisionDir = path.join(countryDir, stats.divisionSlug);
    if (!fs.existsSync(divisionDir)) {
        fs.mkdirSync(divisionDir, { recursive: true });
    }

    if (reportType === 'phone') {
        await generateSafeEditFile(countryName, stats, tmpFilePath);
    }
    await generateHtmlReport(
        reportType,
        countryData,
        stats,
        tmpFilePath,
        clientTranslations,
        countryData.safeAutoFixBotEnabled,
        dataTimestamp,
        subdivision.countryCode
    );

    fs.unlinkSync(tmpFilePath);

    return stats;
}

/**
 * Processes all subdivisions within a single administrative division.
 * @param {string} rawDivisionName - The unescaped name of the division.
 * @param {Object} countryData - The configuration object for the country.
 * @param {Object} clientTranslations - The client-side translations.
 * @returns {Promise<Object>} A promise resolving to an object with aggregated stats for the division.
 */
async function processDivision(rawDivisionName, countryData, clientTranslations) {
    const divisionName = rawDivisionName;
    console.debug(`Processing subdivisions for ${divisionName}...`);

    const subdivisions = getSubdivisions(countryData, rawDivisionName);

    if (!subdivisions || subdivisions.length === 0) {
        console.error(`No subdivisions to process for ${divisionName}.`);
        return { divisionStats: [], divisionTotals: {} };
    }

    console.log(`Processing for ${subdivisions.length} subdivisions in ${divisionName}.`);

    const divisionStats = Object.fromEntries(REPORT_TYPES.map(reportType => [reportType, []]));
    const divisionTotals = Object.fromEntries(
        Object.entries(COUNT_TYPES).map(([reportType, countTypes]) => {
            return [reportType, Object.fromEntries(countTypes.map(t => [t, 0]))];
        })
    );

    const tasks = [];
    for (const subdivision of subdivisions) {
        for (const reportType of REPORT_TYPES) {
            tasks.push({ subdivision, reportType });
        }
    }

    const results = await Promise.all(
        tasks.map(async ({ subdivision, reportType }) => {
            const reportStats = await processSubdivision(
                subdivision,
                reportType,
                countryData,
                rawDivisionName,
                clientTranslations
            );
            return { reportType, reportStats };
        })
    );

    for (const { reportType, reportStats } of results.filter(Boolean)) {
        if (Object.keys(reportStats).length > 0) {
            divisionStats[reportType].push(reportStats);

            Object.keys(divisionTotals[reportType]).forEach(countType => {
                divisionTotals[reportType][countType] += reportStats[countType];
            });
        }
    }

    return { divisionStats, divisionTotals };
}

/**
 * Processes all divisions and subdivisions for a single country.
 * @param {Object} countryData - The configuration object for the country.
 * @returns {Promise<Object>} A promise that resolves to the aggregated statistics for the country.
 */
async function processCountry(countryData) {
    const countryName = countryData.name;
    const locale = countryData.locale;

    const fullTranslations = getTranslations(locale);
    const fullDefaultTranslations = getTranslations('en');
    // TODO: serve full translations server-side
    const clientTranslations = createClientTranslations(fullTranslations, fullDefaultTranslations);

    const divisions = countryData.divisions ? { [countryData.name]: countryData.divisions } : countryData.divisionMap;

    if (countryData.pbfUrl) {
        const tmpPbfFilePath = path.join(process.cwd(), `${uuidv4()}.osm.pbf`);

        try {
            await downloadPbf(countryData.pbfUrl, tmpPbfFilePath);

            for (const reportType of REPORT_TYPES) {
                const tmpReportPbfFilePath = path.join(process.cwd(), `filtered-${reportType}-${uuidv4()}.osm.pbf`);
                await filterPbf(tmpPbfFilePath, tmpReportPbfFilePath, reportType);
                await splitPbf(tmpReportPbfFilePath, path.join(OSM_DIR, reportType), countryData);
                fs.rmSync(tmpReportPbfFilePath, { force: true });
            }

            fs.rmSync(tmpPbfFilePath, { force: true });

            const dataTimestamp = await getOsmTimestamp(countryData.pbfUrl);
            countryData.timestamp = dataTimestamp;
        } catch (error) {
            console.error(`Skipping country ${countryName} due to download failure: ${error.message}`);
            fs.rmSync(tmpPbfFilePath, { force: true });
            return null;
        }
    }

    for (const groupDivisions of Object.values(divisions)) {
        for (const [subdivisionName, subData] of Object.entries(groupDivisions)) {
            const pbfUrl = typeof subData === 'object' ? subData.pbfUrl : null;
            if (pbfUrl) {
                const subPbfFilePath = path.join(process.cwd(), `sub-${uuidv4()}.osm.pbf`);

                try {
                    await downloadPbf(pbfUrl, subPbfFilePath);

                    for (const reportType of REPORT_TYPES) {
                        const tmpReportPbfFilePath = path.join(
                            process.cwd(),
                            `sub-filtered-${reportType}-${uuidv4()}.osm.pbf`
                        );
                        await filterPbf(subPbfFilePath, tmpReportPbfFilePath, reportType);
                        await splitPbf(tmpReportPbfFilePath, path.join(OSM_DIR, reportType), null, subData);
                        fs.rmSync(tmpReportPbfFilePath, { force: true });
                    }

                    fs.rmSync(subPbfFilePath, { force: true });

                    const dataTimestamp = await getOsmTimestamp(pbfUrl);
                    subData.timestamp = dataTimestamp;
                    if (!countryData.timestamp) {
                        countryData.timestamp = dataTimestamp;
                    }
                } catch (error) {
                    console.error(`Skipping subdivision ${subdivisionName} due to download failure: ${error.message}`);
                    fs.rmSync(subPbfFilePath, { force: true });
                    // No return here, just skip this subdivision
                }

                if (testMode) {
                    break;
                }
            }
        }
    }

    for (const reportType of REPORT_TYPES) {
        const outputDir = path.join(BUILD_DIR, reportType, safeName(countryName));
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    }

    const groupedDivisionStats = Object.fromEntries(REPORT_TYPES.map(reportType => [reportType, {}]));

    const totals = Object.fromEntries(
        Object.entries(COUNT_TYPES).map(([reportType, countTypes]) => {
            return [reportType, Object.fromEntries(countTypes.map(t => [t, 0]))];
        })
    );

    for (const rawDivisionName in divisions) {
        const { divisionStats, divisionTotals } = await processDivision(
            rawDivisionName,
            countryData,
            clientTranslations
        );

        for (const reportType of REPORT_TYPES) {
            groupedDivisionStats[reportType][rawDivisionName] = divisionStats[reportType];

            Object.keys(totals[reportType]).forEach(countType => {
                totals[reportType][countType] += divisionTotals[reportType][countType];
            });
        }
    }

    const parsedTimestamp = parseOsmTimestamp(countryData.timestamp);
    const dataTimestamp = parsedTimestamp ? parsedTimestamp : new Date();

    const baseCountryStats = {
        name: countryName,
        slug: safeName(countryName),
        locale: locale,
        timestamp: dataTimestamp,
    };

    const countryStats = {};

    for (const reportType of REPORT_TYPES) {
        countryStats[reportType] = {
            ...baseCountryStats,
            groupedDivisionStats: groupedDivisionStats[reportType],
        };
        COUNT_TYPES[reportType].forEach(countType => {
            countryStats[reportType][countType] = totals[reportType][countType];
        });
    }

    if (countryStats.phone) {
        countryStats.phone.botEnabled = countryData.safeAutoFixBotEnabled;
    }

    for (const reportType of REPORT_TYPES) {
        saveCountryHistory(reportType, countryStats[reportType]);
        await generateCountryIndexHtml(reportType, countryStats[reportType]);
    }

    return countryStats;
}

/**
 * Minifies all .js files in the directory, including subdirectories.
 * @param {string} directory - The directory in which to minify.
 */
async function minifyJsFiles(directory) {
    if (IS_TEST_MODE) return;

    const entries = await fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            // Recursive call for subdirectories
            await minifyJsFiles(fullPath);
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
            try {
                const code = await fs.readFileSync(fullPath, 'utf8');

                const result = await minify(code, {
                    compress: true,
                    mangle: true,
                });

                if (result.code) {
                    await fs.writeFileSync(fullPath, result.code);
                }
            } catch (err) {
                console.error(`Failed to minify JS: ${fullPath}`, err);
            }
        }
    }
}

/**
 * The main function to orchestrate the entire build process for the validation reports.
 */
async function main() {
    const CLIENT_DIR = path.join(__dirname, 'client');
    Object.values(REPORT_TYPES).forEach(async reportType => {
        const buildDir = path.join(BUILD_DIR, reportType);
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }
        try {
            const filesToCopy = fs.readdirSync(CLIENT_DIR);

            filesToCopy.forEach(file => {
                const source = path.join(CLIENT_DIR, file);
                const destination = path.join(buildDir, file);

                // Only copy files, ignore subdirectories (if any)
                if (fs.statSync(source).isFile()) {
                    fs.copyFileSync(source, destination);
                }
            });
            console.log(`Successfully copied client directory contents to ${buildDir}`);
        } catch (err) {
            console.error('Error copying files:', err);
        }

        const VENDOR_DIR = path.join(buildDir, 'vendor');
        if (!fs.existsSync(VENDOR_DIR)) {
            fs.mkdirSync(VENDOR_DIR);
        }

        fs.copyFileSync(
            path.join(__dirname, '..', 'node_modules', 'osm-api', 'dist', 'index.min.js'),
            path.join(VENDOR_DIR, 'osm-api.min.js')
        );

        fs.copyFileSync(
            path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js'),
            path.join(VENDOR_DIR, 'chart.js')
        );

        await minifyJsFiles(buildDir);
    });

    const officialLanguages = await downloadAndParseOfficialLanguages();

    console.log('Starting full build process...');

    const allCountryStats = Object.fromEntries(REPORT_TYPES.map(reportType => [reportType, []]));

    const defaultLocale = 'en-GB';
    const fullDefaultTranslations = getTranslations(defaultLocale);
    // TODO: serve the translations server-side
    const clientDefaultTranslations = fullDefaultTranslations;

    const limit = pLimit(3);

    const preparedCountries = Object.entries(COUNTRIES).map(([countryKey, countryData]) => ({
        ...countryData,
        name: countryKey,
        officialLanguages: officialLanguages[countryData.countryCode] ?? officialLanguages.default,
        divisionLanguages: Object.fromEntries(
            Object.entries(officialLanguages).filter(([key]) => key.startsWith(countryData.countryCode))
        ),
    }));

    const targetCountries = testMode ? preparedCountries.slice(0, 1) : preparedCountries;

    const processingPromises = targetCountries.map(countryData => limit(() => processCountry(countryData)));

    const countryStatsResults = (await Promise.all(processingPromises)).filter(Boolean);

    for (const countryStats of countryStatsResults) {
        for (const reportType of REPORT_TYPES) {
            allCountryStats[reportType].push(countryStats[reportType]);
        }
    }

    for (const reportType of REPORT_TYPES) {
        await generateMainIndexHtml(reportType, allCountryStats[reportType], defaultLocale, clientDefaultTranslations);
    }

    console.log('Full build process completed successfully.');
}

main();
