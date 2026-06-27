import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import OSM from 'osm-api';
import { pipeline } from 'stream/promises';
import { chain } from 'stream-chain';
import pkgParser from 'stream-json/parser.js';
const { parser } = pkgParser;
import pkgStreamArray from 'stream-json/streamers/stream-array.js';
const { streamArray } = pkgStreamArray;
import { Transform } from 'stream';
import { safeName } from './data-processor.js';
import { SAFE_EDITS_DIR, HOST_URL, AUTO_CHANGESET_TAGS, COUNTRIES, HISTORY_DIR } from './constants.js';
import { getSubdivisionRelativeFilePath } from './html-report.js';
import { fileURLToPath } from 'url';

/**
 * @type {string}
 * @description The authentication token used for authorizing changesets with the OSM API.
 * This is retrieved from the environment variable AUTH_TOKEN.
 */
const BOT_AUTH_TOKEN = process.env.BOT_AUTH_TOKEN;

/**
 * Basic sleep utility to pause between uploads so as not to overload the OSM servers
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const historicalEditsFile = 'historical-edits.json';

/**
 * Executes an OSM API call with a retry mechanism for transient 5xx errors.
 *
 * @param {Function} fn - A function that returns a promise (the OSM API call).
 * @param {number} maxAttempts - Total number of attempts (default 3).
 * @param {number} initialDelay - Initial delay in milliseconds (default 5000).
 * @returns {Promise<any>} The result of the API call.
 * @throws {Error} If all attempts fail or a non-retryable error occurs.
 */
async function withRetry(fn, maxAttempts = 3, initialDelay = 5000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const status = error.cause;

            // Only retry on 5xx errors and if we haven't exhausted attempts
            if (status >= 500 && status < 600 && attempt < maxAttempts) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(
                    `OSM API call failed (status ${status}). Attempt ${attempt}/${maxAttempts}. Retrying in ${delay}ms...`
                );
                await sleep(delay);
            } else {
                // If it's not a 5xx error or we're out of attempts, throw
                throw error;
            }
        }
    }
    throw lastError;
}

/**
 * A custom stream transform that takes a single object chunk and stringifies it
 * with 2-space indentation (pretty-printing).
 * @augments stream.Transform
 */
class StringifyTransform extends Transform {
    constructor(options) {
        // Use object mode for input, standard stream for output (the JSON string)
        super({ objectMode: true, ...options });
    }

    _transform(chunk, encoding, callback) {
        try {
            // Apply JSON.stringify with 2 spaces for pretty printing
            const jsonString = JSON.stringify(chunk, null, 2);
            this.push(jsonString); // Push the complete JSON string
            callback();
        } catch (error) {
            callback(error);
        }
    }
}

/**
 * Reads a temporary JSON file containing potential edits, filters for 'safeEdit: true' items,
 * and writes the filtered edits to a structured JSON file saved by country/subdivision.
 *
 * @param {string} countryName The human-readable name of the country.
 * @param {SubdivisionStats} subdivisionStats The statistics/metadata for the current subdivision.
 * @param {string} tmpFilePath The path to the temporary input file containing all potential edits.
 * @returns {Promise<void>} A promise that resolves when the safe edits file has been written.
 */
export async function generateSafeEditFile(countryName, subdivisionStats, tmpFilePath) {
    const safeCountryName = safeName(countryName);
    const singleLevelDivision =
        safeCountryName === subdivisionStats.divisionSlug || subdivisionStats.divisionSlug === subdivisionStats.slug;
    const subdivisionSlug = singleLevelDivision
        ? subdivisionStats.slug
        : path.join(subdivisionStats.divisionSlug, subdivisionStats.slug);
    const safeCountryDir = path.join(SAFE_EDITS_DIR, safeCountryName);

    await fsp.mkdir(safeCountryDir, { recursive: true });

    if (!singleLevelDivision) {
        const subdivisionDir = path.join(safeCountryDir, subdivisionStats.divisionSlug);
        await fsp.mkdir(subdivisionDir, { recursive: true });
    }

    const dataFilePath = path.join(safeCountryDir, `${subdivisionSlug}.json`);

    const FilterStream = Transform;

    /**
     * A custom stream transform that filters JSON array objects, keeping only those
     * where the property 'safeEdit' is explicitly true, and extracts only the
     * necessary fields. It also counts total original items, suggested edits and safe edits.
     * @augments stream.Transform
     */
    class SafeEditFilter extends FilterStream {
        constructor(options) {
            super({ objectMode: true, ...options });
            this.edits = [];
            this.totalOriginalItems = 0;
            this.totalSuggestedEdits = 0;
            this.totalSafeEdits = 0;
        }

        _transform(chunk, encoding, callback) {
            this.totalOriginalItems++;

            const item = chunk.value;

            if (item && item.autoFixable && !item.isForeignItem) {
                this.totalSuggestedEdits++;
            }
            if (item && item.safeEdit === true && !item.isForeignItem) {
                this.totalSafeEdits++;

                const disassembledItem = {
                    type: item.type,
                    id: item.id,
                    invalidNumbers: item.invalidNumbers,
                    suggestedFixes: item.suggestedFixes,
                };
                this.edits.push(disassembledItem);
            }
            // If false or undefined, do nothing (i.e., filter it out)
            callback();
        }

        _flush(callback) {
            this.push({
                edits: this.edits,
                totalOriginalItems: this.totalOriginalItems,
                totalSuggestedEdits: this.totalSuggestedEdits,
                totalSafeEdits: this.totalSafeEdits,
            });
            callback();
        }
    }

    /**
     * A custom stream transform that wraps the final array of edits, with
     * counts of edits, into the output object structure with metadata.
     * @augments stream.Transform
     */
    class SafeEditWrapper extends FilterStream {
        constructor(country, subdivision, divisionSlug, slug, options) {
            super({ objectMode: true, ...options });
            this.countryName = country;
            this.subdivisionName = subdivision;
            this.divisionSlug = divisionSlug;
            this.subdivisionSlug = slug;
            this.dataPushed = false;
        }

        _transform(chunk, encoding, callback) {
            if (this.dataPushed) {
                // Reject any subsequent chunks if already processed the array
                return callback();
            }

            const { edits, totalOriginalItems, totalSuggestedEdits, totalSafeEdits } = chunk;

            const finalObject = {
                countryName: this.countryName,
                subdivisionName: this.subdivisionName,
                divisionSlug: this.divisionSlug,
                subdivisionSlug: this.subdivisionSlug,
                totalOriginalItems: totalOriginalItems,
                totalSuggestedEdits: totalSuggestedEdits,
                totalSafeEdits: totalSafeEdits,
                edits: edits,
            };

            this.push(finalObject);
            this.dataPushed = true;
            callback();
        }
    }

    const inputStream = fs.createReadStream(tmpFilePath);
    const outputStream = fs.createWriteStream(dataFilePath);

    const chainedStream = chain([
        parser(),
        streamArray(),
        new SafeEditFilter(),
        new SafeEditWrapper(countryName, subdivisionStats.name, subdivisionStats.divisionSlug, subdivisionStats.slug),
        new StringifyTransform(),
    ]);

    try {
        await pipeline(inputStream, chainedStream, outputStream);
        console.debug(`Safe edits output data written to ${dataFilePath}`);
    } catch (err) {
        console.error('An error occurred during safe edits streaming:', err);
        throw err;
    }
}

/**
 * @typedef {Object} OsmEdits
 * @property {number[]} node - Unique numerical IDs for OpenStreetMap nodes.
 * @property {number[]} way - Unique numerical IDs for OpenStreetMap ways.
 * @property {number[]} relation - Unique numerical IDs for OpenStreetMap relations.
 */

/**
 * Updates the historical edits JSON file by appending or overwriting today's edit data.
 * * Reads the existing history file, merges the new data under the current ISO date key
 * (YYYY-MM-DD), formats the output so that arrays stay on a single line for readability
 * and writes it back to disk.
 *
 * @async
 * @param {OsmEdits} todaysEdits - The edit data collected for the current day.
 * @returns {Promise<void>} Resolves when the file has been successfully updated.
 * @throws {Error} Throws an error if reading/writing fails for reasons other than the file not existing.
 */
async function updateHistoricalEdits(todaysEdits) {
    const filePath = path.join(HISTORY_DIR, historicalEditsFile);

    const todayStr = new Date().toISOString().split('T')[0];

    let historyData = {};

    try {
        const fileContent = await fsp.readFile(filePath, 'utf8');
        historyData = JSON.parse(fileContent);
    } catch (error) {
        // If file doesn't exist (ENOENT), ignore and keep historyData as {}
        if (error.code !== 'ENOENT') throw error;
    }

    const existingToday = historyData[todayStr] || { node: [], way: [], relation: [] };

    historyData[todayStr] = {
        node: Array.from(new Set([...(existingToday.node || []), ...(todaysEdits.node || [])])),
        way: Array.from(new Set([...(existingToday.way || []), ...(todaysEdits.way || [])])),
        relation: Array.from(new Set([...(existingToday.relation || []), ...(todaysEdits.relation || [])])),
    };

    await fsp.mkdir(HISTORY_DIR, { recursive: true });

    // Custom JSON formatter to force arrays onto a single line
    const formattedEntries = Object.entries(historyData).map(([date, types]) => {
        return (
            `  "${date}": {\n` +
            `    "node": ${JSON.stringify(types.node || [])},\n` +
            `    "way": ${JSON.stringify(types.way || [])},\n` +
            `    "relation": ${JSON.stringify(types.relation || [])}\n` +
            `  }`
        );
    });

    const formattedJson = `{\n${formattedEntries.join(',\n')}\n}`;

    await fsp.writeFile(filePath, formattedJson, 'utf8');
}

/**
 * Reads historical edit data from a JSON file and aggregates a deduplicated list
 * of OpenStreetMap element IDs (nodes, ways, and relations) from the past month.
 *
 * @async
 * @function getHistoricalEdits
 * @returns {Promise<{node: Set<number>, way: Set<number>, relation: Set<number>}>} An object containing Sets of IDs from the last rolling month.
 * @throws {Error} Throws an error if the file cannot be read, parsed, or if directory operations fail.
 */
async function getHistoricalEdits() {
    const filePath = path.join(HISTORY_DIR, historicalEditsFile);

    let historicalEdits;

    try {
        const fileContent = await fsp.readFile(filePath, 'utf8');
        historicalEdits = JSON.parse(fileContent);
    } catch (error) {
        // If file doesn't exist yet, return empty sets
        if (error.code === 'ENOENT') {
            return { node: new Set(), way: new Set(), relation: new Set() };
        }
        console.error('An error occurred when reading historical edits file:', error);
        throw error;
    }

    try {
        const today = new Date();
        today.setMonth(today.getMonth() - 1);
        const cutoffDateStr = today.toISOString().split('T')[0];

        const nodeSet = new Set();
        const waySet = new Set();
        const relationSet = new Set();

        for (const [date, data] of Object.entries(historicalEdits)) {
            if (date >= cutoffDateStr) {
                if (data.node) data.node.forEach(id => nodeSet.add(id));
                if (data.way) data.way.forEach(id => waySet.add(id));
                if (data.relation) data.relation.forEach(id => relationSet.add(id));
            }
        }

        return {
            node: nodeSet,
            way: waySet,
            relation: relationSet,
        };
    } catch (error) {
        console.error('An error occurred when processing historical edits:', error);
        throw error;
    }
}

/**
 * Determines if an OSM feature has been edited recently by the bot.
 *
 * @param {object} feature - The feature object (node, way, or relation) containing 'type' and 'id'.
 * @param {object} recentHistoricalEdits The object of recent historical edits containing Sets.
 * @returns {boolean} Whether a recent bot edit was made
 */
function hasRecentBotEdit(feature, recentHistoricalEdits) {
    const typeSet = recentHistoricalEdits[feature.type];
    return typeSet ? typeSet.has(feature.id) : false;
}

/**
 * Applies a set of tag edits (key-value pairs) to an OSM feature's 'tags' object.
 * If an edit value is explicitly set to null, the corresponding tag key is deleted
 * from the feature's tags.
 *
 * @param {object} feature - The feature object (node, way, or relation) containing the 'tags' object.
 * @param {object} elementEdits - The object of key-value edits to apply. A value of null indicates a deletion.
 * @param {object} originalValues - The object of key-value original tag values.
 * @param {OsmEdits} recentHistoricalEdits The object of recent historical edits (created by getHistoricalEdits).
 * @returns {boolean} Whether any changes were made
 */
function applyEditsToFeatureTags(feature, elementEdits, originalValues, recentHistoricalEdits) {
    let changed = false;

    // visible is false for deleted objects and unset for normal objects
    const isDeleted = (feature.visible ?? true) === false;

    // If a feature does not have any tags, it has dramatically changed since it was originally fetched
    if (isDeleted || !feature.tags || typeof feature.tags !== 'object') {
        return false;
    }

    if (hasRecentBotEdit(feature, recentHistoricalEdits)) {
        console.log(`Avoiding edit war for ${feature.type}/${feature.id}`);
        return false;
    }

    const tags = feature.tags;

    for (const key in elementEdits) {
        if (Object.hasOwn(elementEdits, key)) {
            const value = elementEdits[key];

            // If any of the target tags have changed, make no changes
            const originalValue = originalValues?.[key];
            if (originalValue !== undefined && tags[key] !== originalValue) {
                return false;
            }

            if (value === null) {
                if (Object.hasOwn(tags, key)) {
                    delete tags[key];
                    changed = true;
                }
            } else if (tags[key] !== value) {
                tags[key] = value;
                changed = true;
            }
        }
    }

    return changed;
}

/**
 * Groups the array elements by 'type' and organizes IDs and suggestedFixes.
 * * @param {Array<Object>} data - The original array of objects.
 * @returns {Object} An object keyed by type (e.g., "node"), containing:
 * - featureIds: An array of IDs for that type.
 * - fixes: A Map<ID, suggestedFixes object>.
 * - invalid: A Map<ID, invalidNumbers object>.
 */
function groupData(data) {
    return data.reduce((acc, item) => {
        const { type, id, suggestedFixes, invalidNumbers } = item;

        if (!acc[type]) {
            acc[type] = {
                featureIds: [],
                fixes: new Map(),
                invalid: new Map(),
            };
        }

        acc[type].featureIds.push(id);
        acc[type].fixes.set(id, suggestedFixes);
        acc[type].invalid.set(id, invalidNumbers);

        return acc;
    }, {});
}

/**
 * Fetches features from the OSM API, applies the suggested edits to their tags,
 * and tracks features that resulted in actual modifications.
 *
 * @param {Object<string, GroupedFixes>} groupedData An object keyed by type, containing IDs, fixes and original invalid values.
 * @param {OsmEdits} recentHistoricalEdits The object of recent historical edits (created by getHistoricalEdits).
 * @returns {Promise<Array<object>>} A promise that resolves to an array of modified feature objects
 * ready for inclusion in an OSM changeset.
 */
async function processFeatures(groupedData, recentHistoricalEdits) {
    let modifications = [];
    const MAX_FEATURES_PER_FETCH = 500;
    for (const type in groupedData) {
        if (Object.hasOwn(groupedData, type)) {
            const { featureIds, fixes, invalid } = groupedData[type];

            if (featureIds.length > 0) {
                const featureIdChunks = [];
                for (let i = 0; i < featureIds.length; i += MAX_FEATURES_PER_FETCH) {
                    featureIdChunks.push(featureIds.slice(i, i + MAX_FEATURES_PER_FETCH));
                }

                let allFeatures = [];
                for (const chunk of featureIdChunks) {
                    const features = await withRetry(() => OSM.getFeatures(type, chunk));
                    allFeatures.push(...features);
                }

                for (const feature of allFeatures) {
                    const featureId = feature.id;
                    const suggestedFixes = fixes.get(featureId);
                    const invalidNumbers = invalid.get(featureId);
                    if (suggestedFixes) {
                        const changed = applyEditsToFeatureTags(
                            feature,
                            suggestedFixes,
                            invalidNumbers,
                            recentHistoricalEdits
                        );
                        if (changed) {
                            modifications.push(feature);
                        } else {
                            console.warn(`No changes applied for ${type}/${featureId}`);
                        }
                    } else {
                        console.warn(`No suggested fixes found for ${type}/${featureId}`);
                    }
                }
            }
        }
    }
    return modifications;
}

/**
 * Reads a safe edits file, groups the edits, processes the features by applying fixes,
 * and uploads the resulting modifications to OSM as a changeset.
 *
 * @param {string} filePath The path to the safe edits JSON file (created by generateSafeEditFile).
 * @param {OsmEdits} recentHistoricalEdits The object of recent historical edits (created by getHistoricalEdits).
 * @returns {Promise<OsmEdits>} A promise that resolves to an object containing the grouped features that were
 * modified and uploaded or empty arrays if skipped.
 */
export async function uploadSafeChanges(filePath, recentHistoricalEdits) {
    const content = await fsp.readFile(filePath, 'utf-8');
    const subdivisionData = JSON.parse(content);

    const edits = subdivisionData.edits;

    const groupedData = groupData(edits);
    const modifications = await processFeatures(groupedData, recentHistoricalEdits);

    const editsMade = { node: [], way: [], relation: [] };

    if (modifications.length > 0) {
        console.log(
            `Uploading ${modifications.length} modifications for ${subdivisionData.subdivisionName} (${subdivisionData.countryName})`
        );

        const relativePagePath = getSubdivisionRelativeFilePath(
            subdivisionData.countryName,
            subdivisionData.divisionSlug,
            subdivisionData.subdivisionSlug
        );
        const pageLink = `${HOST_URL['phone']}${relativePagePath}`;

        const response = await withRetry(() =>
            OSM.uploadChangeset(
                {
                    ...AUTO_CHANGESET_TAGS,
                    ...{
                        comment:
                            `${subdivisionData.subdivisionName} (${subdivisionData.countryName}): ` +
                            AUTO_CHANGESET_TAGS.comment,
                    },
                    ...{ manual_review_needed: pageLink },
                },
                { create: [], modify: modifications, delete: [] }
            )
        );

        const changesetIds = Object.keys(response || {});

        changesetIds.forEach(id => {
            console.log(
                `Changeset ${id} created for ${subdivisionData.subdivisionName} (${subdivisionData.countryName})`
            );
        });

        modifications.reduce((acc, feature) => {
            if (acc[feature.type]) {
                acc[feature.type].push(feature.id);
            }
            return acc;
        }, editsMade);
    }

    return editsMade;
}

/**
 * The main bot routine for automatically processing and uploading 'safe' edits to OpenStreetMap.
 *
 * This asynchronous function performs the following steps:
 * 1. Recursively traverses the {@link SAFE_EDITS_DIR} to collect all generated safe edit JSON files.
 * 2. Sequentially reads the content and metadata of each file (country name, edit counts).
 * 3. Checks the global {@link COUNTRIES} configuration to verify if `safeAutoFixBotEnabled` is set to `true`
 * for the file's corresponding country and that safe edits exist.
 * 4. If enabled, it sequentially executes {@link uploadSafeChanges} for the file and introduces a brief pause.
 * 5. Aggregates and logs a detailed summary of the total files processed, successful uploads and skipped files per country.
 *
 * @async
 * @throws {Error} Throws an error if directory traversal fails or if a file read/JSON parse error occurs.
 * @returns {Promise<void>} A Promise that resolves when all files have been sequentially processed.
 */
async function processSafeEdits() {
    const filesToProcess = [];
    const countryStats = {};

    /**
     * Recursively reads directories and collects file paths.
     * @param {string} directory - The directory to start the search from.
     */
    async function collectSafeEditFiles(directory) {
        const entries = await fsp.readdir(directory, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                await collectSafeEditFiles(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                filesToProcess.push(fullPath);
            }
        }
    }

    // Configure with the auth token
    OSM.configure({ authHeader: `Bearer ${BOT_AUTH_TOKEN}` });

    try {
        const user = await withRetry(() => OSM.getUser('me'));
        console.debug(`Logged in as ${user.display_name}`);
    } catch (error) {
        console.error('Could not identify with OSM API. Aborting execution.');
        throw error;
    }

    try {
        console.debug(`Starting file collection in ${SAFE_EDITS_DIR}...`);
        await collectSafeEditFiles(SAFE_EDITS_DIR);
        console.debug(`Found ${filesToProcess.length} safe edit files.`);

        const recentHistoricalEdits = await getHistoricalEdits();
        const allEditsMade = { node: new Set(), way: new Set(), relation: new Set() };

        for (const filePath of filesToProcess) {
            try {
                const fileContent = await fsp.readFile(filePath, 'utf8');
                const data = JSON.parse(fileContent);

                const countryName = data.countryName;

                if (!countryName) {
                    console.warn(`Skipping file ${filePath}: 'countryName' not found in file.`);
                    continue;
                }

                if (!countryStats[countryName]) {
                    countryStats[countryName] = {
                        totalOriginalItems: 0,
                        totalSuggestedEdits: 0,
                        totalSafeEdits: 0,
                        uploaded: 0,
                        skipped: 0,
                    };
                }

                const stats = countryStats[countryName];
                stats.totalOriginalItems += data.totalOriginalItems || 0;
                stats.totalSuggestedEdits += data.totalSuggestedEdits || 0;
                stats.totalSafeEdits += data.totalSafeEdits || 0;

                const countryConfig = COUNTRIES[countryName];

                if (!countryConfig) {
                    console.warn(`Skipping file ${filePath}: No config found for '${countryName}'.`);
                    stats.skipped++;
                    continue;
                }

                if (countryConfig.safeAutoFixBotEnabled === true && data.totalSafeEdits > 0) {
                    try {
                        const divisionEdits = await uploadSafeChanges(filePath, recentHistoricalEdits);

                        stats.uploaded++;
                        divisionEdits.node.forEach(id => allEditsMade.node.add(id));
                        divisionEdits.way.forEach(id => allEditsMade.way.add(id));
                        divisionEdits.relation.forEach(id => allEditsMade.relation.add(id));

                        await sleep(500);
                    } catch (err) {
                        console.error(`Upload failed for ${filePath}:`, err);
                    }
                } else {
                    stats.skipped++;
                }
            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error.message);
                throw error;
            }
        }

        const finalEditsMade = {
            node: Array.from(allEditsMade.node),
            way: Array.from(allEditsMade.way),
            relation: Array.from(allEditsMade.relation),
        };

        await updateHistoricalEdits(finalEditsMade);

        console.log(`\n--- Country Processing Statistics ---`);
        for (const country in countryStats) {
            const stats = countryStats[country];
            console.log(`\nCountry: ${country}`);
            console.log(`  Invalid items: ${stats.totalOriginalItems}`);
            console.log(`  Suggested Fixes: ${stats.totalSuggestedEdits}`);
            console.log(`  Safe Edits: ${stats.totalSafeEdits}`);
            console.log(`  Files Uploaded (Active Bot): ${stats.uploaded}`);
            console.log(`  Files Skipped (No Edits/No Config/Bot Disabled): ${stats.skipped}`);
        }

        const uploadedCount = Object.values(countryStats).reduce((sum, stats) => sum + stats.uploaded, 0);

        console.log(`\n--- Processing Complete ---`);
        console.log(`Total files processed: ${filesToProcess.length}`);
        console.log(`Successful uploads: ${uploadedCount}`);
    } catch (error) {
        console.error('An error occurred during directory traversal:', error);
        throw error;
    }
}

/**
 * The main function to check for safe edit files and upload the changes to OSM.
 */
async function main() {
    await processSafeEdits();
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    main();
}
