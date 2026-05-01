const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline')
const { access } = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const { PUBLIC_DIR, COUNTRIES, HISTORY_DIR, OSM_DIR, NAMES_BUILD_DIR } = require('./constants');
const { splitPbf, getOsmTimestamp, downloadPbf, filterPbfPhone, filterPbfName } = require('./osm-download');
const { safeName, validateNumbers } = require('./data-processor');
const { generateCountryIndexHtml } = require('./html-country')
const { generateMainIndexHtml } = require('./html-index')
const { generateHtmlReport } = require('./html-report')
const { getTranslations } = require('./i18n');
const { generateSafeEditFile } = require('./osm-safe-edits');
const { validateNames } = require('./names-processor');

const BUILD_TYPE = process.env.BUILD_TYPE;
// A test build will only fetch and process numbers for one subdivision of one division of one country
// (the first found of each, using the countries data file)
const testMode = BUILD_TYPE === 'simplified';

const CLIENT_KEYS = [
    'dataSourcedTemplate',
    'fixInJOSM',
    'fixable',
    'website',
    'fixableNumbersHeader',
    'fixableNumbersDescription',
    'invalidNumbersHeader',
    'invalidNumbersDescription',
    'foreignNumbersHeader',
    'foreignNumbersDescription',
    'noInvalidNumbers',
    'pageOf',
    'name',
    'date',
    'suggestedFix',
    'invalidNumber',
    'next',
    'previous',
    'sortBy',
    "login",
    "logout",
    "discard",
    "keep",
    "close",
    "cancel",
    "upload",
    "restoreUnsavedEdits",
    "uploadChanges",
    "restoreChanges",
    "applyFix",
    "enterComment",
    "noChangesSubmitted",
    "changesetCreated",
    "notLoggedIn",
    "save",
    "openNote",
    "createNoteFor",
    "noteIsClose",
    "noteCreated",
    "hasInvalidSingular",
    "hasInvalidPlural",
    "phoneNumber",
];


/**
 * Filters the full translations object to include only keys needed by the client.
 * @param {Object} fullTranslations - The complete dictionary for a locale.
 * @returns {Object} A lightweight dictionary containing only client-side keys.
 */
function filterClientTranslations(fullTranslations) {
    const clientTranslations = {};
    for (const key of CLIENT_KEYS) {
        // Only include the key if it exists in the source dictionary
        if (fullTranslations[key] !== undefined) {
            clientTranslations[key] = fullTranslations[key];
        }
    }
    return clientTranslations;
}

/**
 * Saves the full history for the country to a JSON file to be backed up and used for
 * history analysis, falling back to previous history for any divisions that failed to fetch.
 * @param {Object} originalCountryStats - The statistics for the country, included groupedDivisionStats.
 */
function saveCountryHistory(originalCountryStats) {
    const countryStats = structuredClone(originalCountryStats);

    const historyCountryDir = path.join(HISTORY_DIR, countryStats.slug);
    if (!fs.existsSync(historyCountryDir)) {
        fs.mkdirSync(historyCountryDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const historyFilePath = path.join(historyCountryDir, `${today}.json`);

    const allDivisions = Object.values(countryStats.groupedDivisionStats).flat();
    const needsFallback = allDivisions.some(div => div.totalNumbers === 0);

    if (needsFallback) {
        const files = fs.readdirSync(historyCountryDir)
            .filter(f => f.endsWith('.json') && f !== `${today}.json`)
            .sort((a, b) => b.localeCompare(a));

        if (files.length > 0) {
            try {
                const lastHistoryPath = path.join(historyCountryDir, files[0]);
                const lastHistory = JSON.parse(fs.readFileSync(lastHistoryPath, 'utf8'));

                const historyMap = new Map();
                Object.values(lastHistory.groupedDivisionStats).flat().forEach(div => {
                    const compositeKey = `${div.divisionSlug}|${div.slug}`;
                    historyMap.set(compositeKey, div);
                });

                for (const groupName in countryStats.groupedDivisionStats) {
                    countryStats.groupedDivisionStats[groupName] = countryStats.groupedDivisionStats[groupName].map(div => {
                        const compositeKey = `${div.divisionSlug}|${div.slug}`;
                        if (div.totalNumbers === 0 && historyMap.has(compositeKey)) {
                            console.log(`Falling back to previous history for ${div.name}`);
                            return { ...historyMap.get(compositeKey) };
                        }
                        return div;
                    });
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
    let totalNumbers = 0;

    Object.values(countryStats.groupedDivisionStats).flat().forEach(div => {
        totalInvalid += (div.invalidCount || 0);
        totalAutoFixable += (div.autoFixableCount || 0);
        totalSafeEdit += (div.safeEditCount || 0);
        totalNumbers += (div.totalNumbers || 0);
    });

    countryStats.invalidCount = totalInvalid;
    countryStats.autoFixableCount = totalAutoFixable;
    countryStats.safeEditCount = totalSafeEdit;
    countryStats.totalNumbers = totalNumbers;

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
                ...(value.pbfUrl && { pbfUrl: value.pbfUrl })
            };
        }
        // Fallback for standard number-only format
        return {
            name: name,
            id: value,
            countryCode: countryData.countryCode
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

    // Track unique combinations of type + id
    const seenElements = new Set();

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        // Remove record separator
        const cleanLine = line.replace(/^\x1e/, '').trim();

        if (cleanLine) {
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
 * Processes a single subdivision for phone numbers: processes OSM data, validates numbers,
 * generates the HTML report and returns statistics.
 * @param {Object} subdivision - The subdivision object (with name and id).
 * @param {Object} countryData - The configuration object for the country.
 * @param {string} rawDivisionName - The unescaped name of the parent division.
 * @param {string} locale - The locale for the report.
 * @param {Object} clientTranslations - The client-side translations.
 * @returns {Promise<Object>} A promise that resolves to a statistics object for the subdivision.
 */
async function processSubdivisionPhones(subdivision, countryData, rawDivisionName, locale, clientTranslations) {
    const countryName = countryData.name;

    const geojsonPath = path.join(OSM_DIR, 'phone', `${subdivision.id}.geojsonseq`);
    try {
        await access(geojsonPath);
    } catch (error) {
        console.error(`Error: File not found at ${geojsonPath}`);
    }

    const elementStream = createGeoJsonElementStream(geojsonPath);

    const tmpFilePath = path.join(os.tmpdir(), `invalid-numbers-${uuidv4()}.json`);
    const botEnabled = countryData.safeAutoFixBotEnabled;

    const { totalNumbers, invalidCount, autoFixableCount, safeEditCount } = await validateNumbers(elementStream, subdivision.countryCode, tmpFilePath);

    fs.unlinkSync(geojsonPath);

    const siteInvalidCount = botEnabled ? invalidCount - safeEditCount : invalidCount;
    const siteAutoFixableCount = botEnabled ? autoFixableCount - safeEditCount : autoFixableCount;

    const parsedTimestamp = parseOsmTimestamp(countryData.timestamp)
    const dataTimestamp = parsedTimestamp ? parsedTimestamp : new Date();

    const stats = {
        name: subdivision.name,
        divisionSlug: safeName(rawDivisionName),
        slug: safeName(subdivision.name),
        invalidCount: siteInvalidCount,
        autoFixableCount: siteAutoFixableCount,
        safeEditCount: safeEditCount,
        totalCount: totalNumbers,
        lastUpdated: dataTimestamp.toISOString()
    };

    const countryDir = path.join(PUBLIC_DIR, safeName(countryName));
    const divisionDir = path.join(countryDir, stats.divisionSlug)
    if (!fs.existsSync(divisionDir)) {
        fs.mkdirSync(divisionDir, { recursive: true });
    }

    await generateSafeEditFile(countryName, stats, tmpFilePath)
    await generateHtmlReport('phone', countryName, stats, tmpFilePath, locale, clientTranslations, countryData.safeAutoFixBotEnabled, dataTimestamp);

    fs.unlinkSync(tmpFilePath);

    return stats;
}

/**
 * Processes a single subdivision for names: processes OSM data, generates the HTML report
 * and returns statistics.
 * @param {Object} subdivision - The subdivision object (with name and id).
 * @param {Object} countryData - The configuration object for the country.
 * @param {string} rawDivisionName - The unescaped name of the parent division.
 * @param {string} locale - The locale for the report.
 * @param {Object} clientTranslations - The client-side translations.
 * @returns {Promise<Object>} A promise that resolves to a statistics object for the subdivision.
 */
async function processSubdivisionNames(subdivision, countryData, rawDivisionName, locale, clientTranslations) {
    const countryName = countryData.name;

    const geojsonPath = path.join(OSM_DIR, 'name', `${subdivision.id}.geojsonseq`);
    try {
        await access(geojsonPath);
    } catch (error) {
        console.error(`Error: File not found at ${geojsonPath}`);
    }

    const elementStream = createGeoJsonElementStream(geojsonPath);

    const tmpFilePath = path.join(os.tmpdir(), `${uuidv4()}.json`);

    const { totalNames, incompleteNames } = await validateNames(elementStream, subdivision.countryCode, tmpFilePath);

    fs.unlinkSync(geojsonPath);

    const parsedTimestamp = parseOsmTimestamp(countryData.timestamp)
    const dataTimestamp = parsedTimestamp ? parsedTimestamp : new Date();

    const stats = {
        name: subdivision.name,
        divisionSlug: safeName(rawDivisionName),
        slug: safeName(subdivision.name),
        invalidCount: incompleteNames,
        totalCount: totalNames,
        lastUpdated: dataTimestamp.toISOString()
    };

    const countryDir = path.join(NAMES_BUILD_DIR, safeName(countryName));
    const divisionDir = path.join(countryDir, stats.divisionSlug)
    if (!fs.existsSync(divisionDir)) {
        fs.mkdirSync(divisionDir, { recursive: true });
    }

    await generateHtmlReport('name', countryName, stats, tmpFilePath, locale, clientTranslations, false, dataTimestamp);

    fs.unlinkSync(tmpFilePath);

    return stats;
}

/**
 * Processes all subdivisions within a single administrative division.
 * @param {string} rawDivisionName - The unescaped name of the division.
 * @param {Object} countryData - The configuration object for the country.
 * @param {string} locale - The locale for the reports.
 * @param {Object} clientTranslations - The client-side translations.
 * @returns {Promise<Object>} A promise resolving to an object with aggregated stats for the division.
 */
async function processDivision(rawDivisionName, countryData, locale, clientTranslations) {
    const divisionName = rawDivisionName;
    console.log(`Processing subdivisions for ${divisionName}...`);

    const subdivisions = getSubdivisions(countryData, rawDivisionName);

    if (!subdivisions || subdivisions.length === 0) {
        console.error(`No subdivisions to process for ${divisionName}.`);
        return { divisionStats: [], divisionTotalNumbers: 0, divisionInvalidCount: 0, divisionAutofixableCount: 0 };
    }

    console.log(`Processing for ${subdivisions.length} subdivisions in ${divisionName}.`);

    const divisionStats = [];
    let divisionTotalNumbers = 0;
    let divisionInvalidCount = 0;
    let divisionAutofixableCount = 0;
    let divisionSafeEditCount = 0;

    let subdivisionCount = 0;
    for (const subdivision of subdivisions) {
        const stats = await processSubdivisionPhones(subdivision, countryData, rawDivisionName, locale, clientTranslations);
        divisionStats.push(stats);
        divisionTotalNumbers += stats.totalNumbers;
        divisionInvalidCount += stats.invalidCount;
        divisionAutofixableCount += stats.autoFixableCount;
        divisionSafeEditCount += stats.safeEditCount;

        const nameStats = await processSubdivisionNames(subdivision, countryData, rawDivisionName, locale, clientTranslations);
        console.log(nameStats);

        subdivisionCount++;
        // if (testMode && subdivisionCount >= 1) {
        //     break;
        // }
    }

    return { divisionStats, divisionTotalNumbers, divisionInvalidCount, divisionAutofixableCount, divisionSafeEditCount };
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
    const clientTranslations = filterClientTranslations(fullTranslations);

    const divisions = countryData.divisions
        ? { [countryData.name]: countryData.divisions }
        : countryData.divisionMap;

    if (countryData.pbfUrl) {
        const tmpPbfFilePath = path.join(process.cwd(), `${uuidv4()}.osm.pbf`);
        const tmpPhonePbfFilePath = path.join(process.cwd(), `filtered-phone-${uuidv4()}.osm.pbf`);
        const tmpNamePbfFilePath = path.join(process.cwd(), `filtered-name-${uuidv4()}.osm.pbf`);

        await downloadPbf(countryData.pbfUrl, tmpPbfFilePath);
        await filterPbfPhone(tmpPbfFilePath, tmpPhonePbfFilePath);
        await filterPbfName(tmpPbfFilePath, tmpNamePbfFilePath);

        fs.rmSync(tmpPbfFilePath, { force: true });

        await splitPbf(tmpPhonePbfFilePath, path.join(OSM_DIR, 'phone'), countryData);
        await splitPbf(tmpNamePbfFilePath, path.join(OSM_DIR, 'name'), countryData);

        [tmpPhonePbfFilePath, tmpNamePbfFilePath].forEach(file => {
            fs.rmSync(file, { force: true });
        });

        const dataTimestamp = await getOsmTimestamp(countryData.pbfUrl);
        countryData.timestamp = dataTimestamp;
    }

    for (const [groupName, groupDivisions] of Object.entries(divisions)) {
        for (const [subName, subData] of Object.entries(groupDivisions)) {
            const pbfUrl = (typeof subData === 'object') ? subData.pbfUrl : null;
            if (pbfUrl) {
                const subPbfFilePath = path.join(process.cwd(), `sub-${uuidv4()}.osm.pbf`);
                const subPhonePbfFilePath = path.join(process.cwd(), `sub-filtered-phone-${uuidv4()}.osm.pbf`);
                const subNamePbfFilePath = path.join(process.cwd(), `sub-filtered-name-${uuidv4()}.osm.pbf`);

                await downloadPbf(countryData.pbfUrl, subPbfFilePath);
                await filterPbfPhone(subPbfFilePath, subPhonePbfFilePath);
                await filterPbfName(subPbfFilePath, subNamePbfFilePath);

                fs.rmSync(subPbfFilePath, { force: true });

                await splitPbf(subPhonePbfFilePath, path.join(OSM_DIR, 'phone'), null, subData);
                await splitPbf(subNamePbfFilePath, path.join(OSM_DIR, 'name'), null, subData);

                [subPhonePbfFilePath, subNamePbfFilePath].forEach(file => {
                    fs.rmSync(file, { force: true });
                });

                // TODO: store this per subdivision
                const dataTimestamp = await getOsmTimestamp(pbfUrl);
                if (!countryData.timestamp) {
                    countryData.timestamp = dataTimestamp;
                }

                if (testMode) {
                    break;
                }
            }
        }
    }

    const countryDir = path.join(PUBLIC_DIR, safeName(countryName));
    if (!fs.existsSync(countryDir)) {
        fs.mkdirSync(countryDir, { recursive: true });
    }

    const namesCountryDir = path.join(NAMES_BUILD_DIR, safeName(countryName));
    if (!fs.existsSync(namesCountryDir)) {
        fs.mkdirSync(namesCountryDir, { recursive: true });
    }

    let totalInvalidCount = 0;
    let totalAutofixableCount = 0;
    let totalSafeEditCount = 0;
    let totalTotalNumbers = 0;
    const groupedDivisionStats = {};

    let divisionCount = 0;
    for (const rawDivisionName in divisions) {
        const {
            divisionStats,
            divisionTotalNumbers,
            divisionInvalidCount,
            divisionAutofixableCount,
            divisionSafeEditCount
        } = await processDivision(rawDivisionName, countryData, locale, clientTranslations);

        const divisionName = rawDivisionName;
        groupedDivisionStats[divisionName] = divisionStats;
        totalInvalidCount += divisionInvalidCount;
        totalAutofixableCount += divisionAutofixableCount;
        totalSafeEditCount += divisionSafeEditCount;
        totalTotalNumbers += divisionTotalNumbers;

        divisionCount++;
        // if (testMode && divisionCount >= 1) {
        //     break;
        // }
    }

    const parsedTimestamp = parseOsmTimestamp(countryData.timestamp)
    const dataTimestamp = parsedTimestamp ? parsedTimestamp : new Date();

    const countryStats = {
        name: countryName,
        slug: safeName(countryName),
        locale: locale,
        invalidCount: totalInvalidCount,
        autoFixableCount: totalAutofixableCount,
        safeEditCount: totalSafeEditCount,
        totalNumbers: totalTotalNumbers,
        groupedDivisionStats: groupedDivisionStats,
        botEnabled: countryData.safeAutoFixBotEnabled,
        timestamp: dataTimestamp
    };

    saveCountryHistory(countryStats);

    await generateCountryIndexHtml('phone', countryStats, clientTranslations);
    await generateCountryIndexHtml('name', countryStats, clientTranslations);

    return countryStats;
}

/**
 * The main function to orchestrate the entire build process for the validation reports.
 */
async function main() {
    const CLIENT_DIR = path.join(__dirname, 'client');
    [PUBLIC_DIR, NAMES_BUILD_DIR].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        try {
            const filesToCopy = fs.readdirSync(CLIENT_DIR);

            filesToCopy.forEach(file => {
                const source = path.join(CLIENT_DIR, file);
                const destination = path.join(dir, file);

                // Only copy files, ignore subdirectories (if any)
                if (fs.statSync(source).isFile()) {
                    fs.copyFileSync(source, destination);
                }
            });
            console.log(`Successfully copied client directory contents to ${dir}`);
        } catch (err) {
            console.error('Error copying files:', err);
        }

        const VENDOR_DIR = path.join(dir, 'vendor')
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
    });

    console.log('Starting full build process...');

    const allCountryStats = [];

    const defaultLocale = 'en-GB';
    const fullDefaultTranslations = getTranslations(defaultLocale);
    const clientDefaultTranslations = filterClientTranslations(fullDefaultTranslations);

    for (const countryKey in COUNTRIES) {
        const countryData = COUNTRIES[countryKey];
        countryData.name = countryKey;
        const stats = await processCountry(countryData);
        allCountryStats.push(stats);

        if (testMode) {
            break;
        }
    }

    await generateMainIndexHtml('phone', allCountryStats, defaultLocale, clientDefaultTranslations);
    await generateMainIndexHtml('name', allCountryStats, defaultLocale, clientDefaultTranslations);

    console.log('Full build process completed successfully.');
}

main();
