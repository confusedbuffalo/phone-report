const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const OSM = require("osm-api");
const { pipeline } = require('stream/promises');
const { chain } = require('stream-chain');
const { parser } = require('stream-json/Parser');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { Transform } = require('stream');
const { safeName } = require('./data-processor');
const { SAFE_EDITS_DIR, HOST_URL, AUTO_CHANGESET_TAGS, COUNTRIES } = require('./constants');
const { getSubdivisionRelativeFilePath } = require('./html-report');

/**
 * @type {string}
 * @description The authentication token used for authorizing changesets with the OSM API.
 * This is retrieved from the environment variable AUTH_TOKEN.
 */
const BOT_AUTH_TOKEN = process.env.BOT_AUTH_TOKEN;

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
async function generateSafeEditFile(countryName, subdivisionStats, tmpFilePath) {
    const safeCountryName = safeName(countryName);
    const singleLevelDivision = safeCountryName === subdivisionStats.divisionSlug || subdivisionStats.divisionSlug === subdivisionStats.slug;
    const subdivisionSlug = singleLevelDivision ? subdivisionStats.slug : path.join(subdivisionStats.divisionSlug, subdivisionStats.slug);
    const safeCountryDir = path.join(SAFE_EDITS_DIR, safeCountryName);

    await fsp.mkdir(safeCountryDir, { recursive: true });

    if (!singleLevelDivision) {
        const subdivisionDir = path.join(safeCountryDir, subdivisionStats.divisionSlug)
        await fsp.mkdir(subdivisionDir, { recursive: true });
    }

    const dataFilePath = path.join(safeCountryDir, `${subdivisionSlug}.json`);

    const FilterStream = require('stream').Transform;

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

            if (item && item.autoFixable) {
                this.totalSuggestedEdits++;
            }
            if (item && item.safeEdit === true) {
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
                totalSafeEdits: this.totalSafeEdits
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
        new SafeEditWrapper(
            countryName, 
            subdivisionStats.name, 
            subdivisionStats.divisionSlug, 
            subdivisionStats.slug
        ),
        new StringifyTransform()
    ]);

    try {
        await pipeline(
            inputStream,
            chainedStream,
            outputStream
        );
        console.log(`Safe edits output data written to ${dataFilePath}`);
    } catch (err) {
        console.error('An error occurred during safe edits streaming:', err);
        throw err;
    }
}

/**
 * Applies a set of tag edits (key-value pairs) to an OSM feature's 'tags' object.
 * If an edit value is explicitly set to null, the corresponding tag key is deleted
 * from the feature's tags.
 *
 * @param {object} feature - The feature object (node, way, or relation) containing the 'tags' object.
 * @param {object} elementEdits - The object of key-value edits to apply. A value of null indicates a deletion.
 * @returns {boolean} Whether any changes were made
 */
function applyEditsToFeatureTags(feature, elementEdits) {
    let changed = false;

    if (!feature.tags || typeof feature.tags !== 'object') {
        feature.tags = {};
    }

    const tags = feature.tags;

    for (const key in elementEdits) {
        if (Object.hasOwn(elementEdits, key)) {
            const value = elementEdits[key];

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
 */
function groupData(data) {
    return data.reduce((acc, item) => {
        const { type, id, suggestedFixes } = item;
        
        // Initialize the structure for a new type if it doesn't exist
        if (!acc[type]) {
            acc[type] = {
                featureIds: [],
                fixes: new Map() // Using a Map for efficient ID-to-fix lookup
            };
        }
        
        // Add the ID to the array and the suggestedFixes to the map
        acc[type].featureIds.push(id);
        acc[type].fixes.set(id, suggestedFixes);
        
        return acc;
    }, {});
}

/**
 * Fetches features from the OSM API, applies the suggested edits to their tags,
 * and tracks features that resulted in actual modifications.
 *
 * @param {Object<string, GroupedFixes>} groupedData An object keyed by type, containing IDs and fixes.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of modified feature objects
 * ready for inclusion in an OSM changeset.
 */
async function processFeatures(groupedData) {
    let modifications = [];
    for (const type in groupedData) {
        if (groupedData.hasOwnProperty(type)) {
            const { featureIds, fixes } = groupedData[type];

            // Fetch the features from the OSM API
            const features = await OSM.getFeatures(type, featureIds);

            for (const feature of features) {
                const featureId = feature.id;
                const suggestedFixes = fixes.get(featureId);
                const originalTags = { ...feature.tags }

                if (suggestedFixes) {
                    changed = applyEditsToFeatureTags(feature, suggestedFixes);
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
    return modifications;
}

/**
 * Reads a safe edits file, groups the edits, processes the features by applying fixes,
 * and uploads the resulting modifications to OSM as a changeset.
 *
 * @param {string} countryName The human-readable name of the country.
 * @param {SubdivisionStats} subdivisionStats The statistics/metadata for the current subdivision.
 * @param {string} filePath The path to the safe edits JSON file (created by generateSafeEditFile).
 * @returns {Promise<void>} A promise that resolves after the changes have been uploaded or skipped.
 */
async function uploadSafeChanges(filePath) {
    const content = await fsp.readFile(filePath, 'utf-8');
    const subdivisionData = JSON.parse(content);

    const edits = subdivisionData.edits;

    const groupedData = groupData(edits);
    const modifications = await processFeatures(groupedData);

    if (modifications.length > 0) {
        console.log(`Uploading ${modifications.length} modifications for ${subdivisionData.name} (${subdivisionData.countryName})`);

        const relativePagePath = getSubdivisionRelativeFilePath(subdivisionData.countryName, subdivisionData.divisionSlug, subdivisionData.subdivisionSlug)
        const pageLink = `${HOST_URL}/${relativePagePath}`

        const changesetId = await OSM.uploadChangeset(
            {
                ...AUTO_CHANGESET_TAGS,
                ...{ 'comment': `${subdivisionData.name} (${subdivisionData.countryName}): ` + AUTO_CHANGESET_TAGS.comment },
                ...{ 'manual_review_needed': pageLink }
            },
            { create: [], modify: modifications, delete: [] }
        );
        console.log(`Changeset ${changesetId} created for ${subdivisionData.name} (${subdivisionData.countryName})`);
    }
}

/**
 * The main bot routine for automatically processing and uploading 'safe' edits to OpenStreetMap.
 *
 * This asynchronous function performs the following steps:
 * 1. Recursively traverses the {@link SAFE_EDITS_DIR} to collect all generated safe edit JSON files.
 * 2. Reads the content and metadata of each file (country name, subdivision name).
 * 3. Checks the global {@link COUNTRIES} configuration to see if `safeAutoFixBotEnabled` is set to `true`
 * for the file's corresponding country.
 * 4. If enabled, it executes {@link uploadSafeChanges} for the file and collects the resulting Promise.
 * 5. Waits for all upload Promises to resolve using `Promise.allSettled`.
 * 6. Logs a detailed summary of the total files processed, successful uploads, and failed uploads.
 *
 * @async
 * @returns {Promise<void>} A Promise that resolves when all file processing and upload attempts are complete.
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
        console.log(`Starting file collection in ${SAFE_EDITS_DIR}...`);
        await collectSafeEditFiles(SAFE_EDITS_DIR);
        console.log(`Found ${filesToProcess.length} safe edit files.`);

        const uploadPromises = [];

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
                        skipped: 0
                    };
                }

                const stats = countryStats[countryName];
                stats.totalOriginalItems += (data.totalOriginalItems || 0);
                stats.totalSuggestedEdits += (data.totalSuggestedEdits || 0);
                stats.totalSafeEdits += (data.totalSafeEdits || 0);

                const countryConfig = COUNTRIES[countryName];

                if (!countryConfig) {
                    console.warn(`Skipping file ${filePath}: No config found for '${countryName}'.`);
                    stats.skipped++;
                    continue;
                }

                if (countryConfig.safeAutoFixBotEnabled === true) {
                    console.log(`Uploading edits for ${countryName} subdivision: ${data.subdivisionName}`);
                    const uploadPromise = uploadSafeChanges(filePath)
                        .then(() => {
                            stats.uploaded++;
                        })
                        .catch(err => {
                            console.error(`Upload failed for ${filePath}:`, err.message);
                        }); 
                    uploadPromises.push(uploadPromise);
                } else {
                    stats.skipped++;
                }

            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error.message);
            }
        }

        // Wait for all successful uploads to complete
        const results = await Promise.allSettled(uploadPromises);

        const uploadedCount = results.filter(r => r.status === 'fulfilled').length;

        console.log(`\n--- Country Processing Statistics ---`);
        for (const country in countryStats) {
            const stats = countryStats[country];
            console.log(`\nCountry: ${country}`);
            console.log(`  Invalid items: ${stats.totalOriginalItems}`);
            console.log(`  Suggested Fixes: ${stats.totalSuggestedEdits}`);
            console.log(`  Safe Edits: ${stats.totalSafeEdits}`);
            console.log(`  Files Uploaded (Active Bot): ${stats.uploaded}`);
            console.log(`  Files Skipped (No Config/Bot Disabled): ${stats.skipped}`);
        }

        console.log(`\n--- Processing Complete ---`);
        console.log(`Total files processed: ${filesToProcess.length}`);
        console.log(`Successful uploads: ${uploadedCount}`);
        console.log(`Failed uploads: ${results.length - uploadedCount}`);

    } catch (err) {
        console.error('An error occurred during directory traversal:', err);
    }
}

/**
 * The main function to check for safe edit files and upload the changes to OSM.
 */
async function main() {
    await processSafeEdits();
}

if (require.main === module) {
    main(); 
}

module.exports = {
    generateSafeEditFile,
    uploadSafeChanges,
};
