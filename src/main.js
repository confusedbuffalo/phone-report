const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { PUBLIC_DIR, COUNTRIES, HISTORY_DIR, usTerritoryCodes } = require('./constants');
const { fetchAdminLevels, fetchOsmDataForDivision } = require('./osm-download');
const { safeName, validateNumbers } = require('./data-processor');
const { generateCountryIndexHtml } = require('./html-country')
const { generateMainIndexHtml } = require('./html-index')
const { generateHtmlReport } = require('./html-report')
const { getTranslations } = require('./i18n');
const { generateSafeEditFile } = require('./osm-safe-edits');

const CLIENT_KEYS = [
    'dataSourcedTemplate',
    'fixInJOSM',
    'fixable',
    'website',
    'fixableNumbersHeader',
    'fixableNumbersDescription',
    'invalidNumbersHeader',
    'invalidNumbersDescription',
    'noInvalidNumbers',
    'pageOf',
    'name',
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
];

const BUILD_TYPE = process.env.BUILD_TYPE;

// A test build will only fetch and process numbers for one subdivision of one division of one country
// (the first found of each, using the countries data file)
const testMode = BUILD_TYPE === 'simplified';

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
 * history analysis.
 * @param {Object} countryStats - The statistics for the country, included groupedDivisionStats.
 */
function saveCountryHistory(countryStats) {
    const historyCountryDir = path.join(HISTORY_DIR, countryStats.slug);
    if (!fs.existsSync(historyCountryDir)) {
        fs.mkdirSync(historyCountryDir, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    const historyFilePath = path.join(historyCountryDir, `${today}.json`);
    fs.writeFileSync(historyFilePath, JSON.stringify(countryStats, null, 2));
}

/**
 * Fetches the list of subdivisions for a given administrative division, handling both
 * dynamic fetching via Overpass API and static lists from the configuration.
 * @param {Object} countryData - The configuration object for the country.
 * @param {string} divisionName - The name of the division.
 * @returns {Promise<Array<Object>>} A promise that resolves to a list of subdivision objects.
 */
async function getSubdivisions(countryData, divisionName) {
    if (countryData.divisions && countryData.subdivisionAdminLevel) {
        const divisionId = countryData.divisions[divisionName];
        return await fetchAdminLevels(divisionId, divisionName, countryData.subdivisionAdminLevel);
    } else if (countryData.divisions) {
        // Single depth divisions, return the divisions (this is the only call to getSubdivisions for such a country)
        console.log(`Using single level of hardcoded divisions for ${countryData.name}...`);
        return Object.entries(countryData.divisions).map(([name, id]) => ({
            name: name,
            id: id
        }));
    } else if (countryData.divisionMap) {
        console.log(`Using hardcoded subdivisions for ${divisionName}...`);
        const divisionMap = countryData.divisionMap[divisionName];
        if (divisionMap) {
            return Object.entries(divisionMap).map(([name, id]) => ({
                name: name,
                id: id
            }));
        }
        return [];
    } else {
        console.error(`Data for ${countryData.name} set up incorrectly, no divisions or divisionMap found`);
        return [];
    }
}

/**
 * Returns the two-letter country code for US territories and possessions.
 * * @param {string} divisionName The full name of the US territory (e.g., "Puerto Rico").
 * @returns {string} The two-letter country code (e.g., "PR"), or 'US' as default.
 */
function getUsCountryCode(divisionName) {
    if (!divisionName) {
        return null;
    }
    return usTerritoryCodes.get(divisionName) || 'US';
}

/**
 * Processes a single subdivision: fetches OSM data, validates numbers, generates the HTML report,
 * and returns statistics.
 * @param {Object} subdivision - The subdivision object (with name and id).
 * @param {Object} countryData - The configuration object for the country.
 * @param {string} rawDivisionName - The unescaped name of the parent division.
 * @param {string} locale - The locale for the report.
 * @param {Object} clientTranslations - The client-side translations.
 * @returns {Promise<Object>} A promise that resolves to a statistics object for the subdivision.
 */
async function processSubdivision(subdivision, countryData, rawDivisionName, locale, clientTranslations) {
    const countryName = countryData.name;
    const elementStream = await fetchOsmDataForDivision(subdivision);
    const tmpFilePath = path.join(os.tmpdir(), `invalid-numbers-${uuidv4()}.json`);
    const countryCode = countryData.countryCode === 'US' ? getUsCountryCode(subdivision.name) : countryData.countryCode;
    const botEnabled = countryData.safeAutoFixBotEnabled;

    const { totalNumbers, invalidCount, autoFixableCount, safeEditCount } = await validateNumbers(elementStream, countryCode, tmpFilePath);

    const siteInvalidCount = botEnabled ? invalidCount - safeEditCount : invalidCount;
    const siteAutoFixableCount = botEnabled ? autoFixableCount - safeEditCount : autoFixableCount;

    const stats = {
        name: subdivision.name,
        divisionSlug: safeName(rawDivisionName),
        slug: safeName(subdivision.name),
        invalidCount: siteInvalidCount,
        autoFixableCount: siteAutoFixableCount,
        safeEditCount: safeEditCount,
        totalNumbers: totalNumbers,
        lastUpdated: new Date().toISOString()
    };

    const countryDir = path.join(PUBLIC_DIR, safeName(countryName));
    const divisionDir = path.join(countryDir, stats.divisionSlug)
    if (!fs.existsSync(divisionDir)) {
        fs.mkdirSync(divisionDir, { recursive: true });
    }

    await generateSafeEditFile(countryName, stats, tmpFilePath)
    await generateHtmlReport(countryName, stats, tmpFilePath, locale, clientTranslations, countryData.safeAutoFixBotEnabled);

    fs.unlinkSync(tmpFilePath); // Clean up the temporary file

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

    const subdivisions = await getSubdivisions(countryData, rawDivisionName);

    if (!subdivisions || subdivisions.length === 0) {
        console.error(`No subdivisions to process for ${divisionName}.`);
        return { divisionStats: [], divisionTotalNumbers: 0, divisionInvalidCount: 0, divisionAutofixableCount: 0 };
    }

    console.log(`Processing phone numbers for ${subdivisions.length} subdivisions in ${divisionName}.`);

    const divisionStats = [];
    let divisionTotalNumbers = 0;
    let divisionInvalidCount = 0;
    let divisionAutofixableCount = 0;
    let divisionSafeEditCount = 0;

    let subdivisionCount = 0;
    for (const subdivision of subdivisions) {
        const stats = await processSubdivision(subdivision, countryData, rawDivisionName, locale, clientTranslations);
        divisionStats.push(stats);
        divisionTotalNumbers += stats.totalNumbers;
        divisionInvalidCount += stats.invalidCount;
        divisionAutofixableCount += stats.autoFixableCount;
        divisionSafeEditCount += stats.safeEditCount;

        subdivisionCount++;
        if (testMode && subdivisionCount >= 1) {
            break;
        }
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

    console.log(`Starting fetching divisions for ${countryName}...`);

    const countryDir = path.join(PUBLIC_DIR, safeName(countryName));
    if (!fs.existsSync(countryDir)) {
        fs.mkdirSync(countryDir, { recursive: true });
    }

    let totalInvalidCount = 0;
    let totalAutofixableCount = 0;
    let totalSafeEditCount = 0;
    let totalTotalNumbers = 0;
    const groupedDivisionStats = {};

    // If no subdivision admin level then use the list of divisions as is, one level deep
    const divisions = (countryData.divisions && !countryData.subdivisionAdminLevel)
        ? { [countryData.name]: countryData.divisions }
        : (countryData.divisions ?? countryData.divisionMap);

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
        if (testMode && divisionCount >= 1) {
            break;
        }
    }

    const countryStats = {
        name: countryName,
        slug: safeName(countryName),
        locale: locale,
        invalidCount: totalInvalidCount,
        autoFixableCount: totalAutofixableCount,
        safeEditCount: totalSafeEditCount,
        totalNumbers: totalTotalNumbers,
        groupedDivisionStats: groupedDivisionStats,
        botEnabled: countryData.safeAutoFixBotEnabled
    };

    saveCountryHistory(countryStats);

    await generateCountryIndexHtml(countryStats, clientTranslations);

    return countryStats;
}

/**
 * The main function to orchestrate the entire build process for the validation reports.
 */
async function main() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR);
    }

    const CLIENT_DIR = path.join(__dirname, 'client');
    try {
        const filesToCopy = fs.readdirSync(CLIENT_DIR);

        filesToCopy.forEach(file => {
            const source = path.join(CLIENT_DIR, file);
            const destination = path.join(PUBLIC_DIR, file);

            // Only copy files, ignore subdirectories (if any)
            if (fs.statSync(source).isFile()) {
                fs.copyFileSync(source, destination);
            }
        });
        console.log('Successfully copied client directory contents to public');
    } catch (err) {
        console.error('Error copying files:', err);
    }

    const VENDOR_DIR = path.join(PUBLIC_DIR, 'vendor')
    if (!fs.existsSync(VENDOR_DIR)) {
        fs.mkdirSync(VENDOR_DIR);
    }

    fs.copyFileSync(
        path.join(__dirname, '..', 'node_modules', 'osm-api', 'dist', 'index.min.js'),
        path.join(PUBLIC_DIR, 'vendor', 'osm-api.min.js')
    );

    fs.copyFileSync(
        path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js'),
        path.join(PUBLIC_DIR, 'vendor', 'chart.js')
    );

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

    await generateMainIndexHtml(allCountryStats, defaultLocale, clientDefaultTranslations);

    console.log('Full build process completed successfully.');
}

main();
