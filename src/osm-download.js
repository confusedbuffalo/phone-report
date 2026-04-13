const axios = require('axios');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const { COUNTRIES, POLY_DIR, OSM_DIR, ALL_NUMBER_TAGS } = require('./constants');

const execPromise = promisify(exec);

// const PLANET_URL = 'https://download3.bbbike.org/osm/planet/planet-daily.osm.pbf';
const PLANET_URL = 'https://download3.bbbike.org/osm/pbf/region/africa/south-africa-and-lesotho.osm.pbf';

// Ensure output directory exists
if (!fs.existsSync(OSM_DIR)) {
    fs.mkdirSync(OSM_DIR, { recursive: true });
}

/**
 * Extracts all unique subdivision IDs from a country object.
 * Handles both flat 'divisions' and nested 'divisionMap' structures.
 */
function getSubdivisionIds(country) {
    // If divisions exists, take its values; 
    // otherwise, flatten the values within divisionMap.
    if (country.divisions) {
        return Object.values(country.divisions);
    }

    if (country.divisionMap) {
        return Object.values(country.divisionMap).flatMap(subRegion =>
            Object.values(subRegion)
        );
    }

    return [];
}


/**
 * Generates an Osmium extraction configuration for a specific country.
 *
 * @param {CountryConfig} country - The country object containing division and sub-region data.
 * @returns {{ extracts: Array.<{ output: string, polygon: { file_name: string, file_type: string } }> }} 
 * An object containing an array of extraction configurations for Osmium.
 */
function generateOsmiumConfigForCountry(country) {
    const extracts = [];

    const processDivisions = (divisions) => {
        Object.values(divisions).forEach(id => {
            extracts.push({
                output: path.join(OSM_DIR, `${id}.osm.pbf`),
                polygon: {
                    file_name: path.join(POLY_DIR, `${id}.poly`),
                    file_type: 'poly'
                }
            });
        });
    };

    // Safety check to ensure the object passed has the expected properties
    if (!country) return { extracts };

    if (country.divisions) {
        processDivisions(country.divisions);
    }

    if (country.divisionMap) {
        Object.values(country.divisionMap).forEach(subRegion => {
            processDivisions(subRegion);
        });
    }

    return { extracts };
}


function generateOsmiumConfig() {
    const extracts = [];
    const processDivisions = (divisions) => {
        Object.values(divisions).forEach(id => {
            extracts.push({
                output: path.join(OSM_DIR, `${id}.osm.pbf`),
                polygon: {
                    file_name: path.join(POLY_DIR, `${id}.poly`),
                    file_type: 'poly'
                }
            });
        });
    };

    Object.values(COUNTRIES).forEach(country => {
        if (country.divisions) processDivisions(country.divisions);
        if (country.divisionMap) {
            Object.values(country.divisionMap).forEach(subRegion => processDivisions(subRegion));
        }
    });
    return { extracts };
}

async function downloadAndFilterPlanet() {
    const configPath = './osmium-config.json';
    fs.writeFileSync(configPath, JSON.stringify(generateOsmiumConfig()));

    // Ensure the filter expression is correctly formatted for Osmium
    const filterExpression = `nwr/${ALL_NUMBER_TAGS.join(',')}`;

    console.log(`Starting pipeline: Download -> Filter -> Extract/Clip`);

    return new Promise(async (resolve, reject) => {
        try {
            const response = await axios({
                method: 'get',
                url: PLANET_URL,
                responseType: 'stream'
            });

            const filterProc = spawn('osmium', [
                'tags-filter',
                '--input-format=pbf', '-',
                filterExpression,
                '--output-format=pbf', '-',
                '--omit-referenced'
            ]);

            const extractProc = spawn('osmium', [
                'extract',
                '--input-format=pbf', '-',
                '--config', configPath,
                '--strategy', 'simple',
                '--overwrite'
            ]);

            // Error Handling

            // Handle the EPIPE at the source
            filterProc.stdin.on('error', (err) => {
                if (err.code === 'EPIPE') {
                    console.error("Filter process closed stdin prematurely. Check filter expression syntax.");
                } else {
                    console.error("Filter STDIN Error:", err);
                }
                // Stop the download stream immediately to prevent further EPIPEs
                response.data.destroy();
            });

            // Capture stderr to see WHY Osmium is dying
            filterProc.stderr.on('data', (data) => console.error(`Osmium Filter: ${data}`));
            extractProc.stderr.on('data', (data) => console.error(`Osmium Extract: ${data}`));

            // --- THE PIPE CHAIN ---

            // Step 1: Download -> Filter
            response.data.pipe(filterProc.stdin);

            // Step 2: Filter -> Extract
            filterProc.stdout.pipe(extractProc.stdin);

            // Termination Logic
            extractProc.on('close', (code) => {
                if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
                if (code === 0) {
                    console.log("Pipeline finished successfully.");
                    resolve();
                } else {
                    reject(new Error(`Extract process exited with code ${code}`));
                }
            });

            filterProc.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`Filter process failed with code ${code}`);
                    // If filter fails, extract will never finish, so we reject
                    reject(new Error(`Filter process failed (Code ${code})`));
                }
            });

        } catch (err) {
            reject(err);
        }
    });
}


/**
 * Downloads, filters, and cleans up OSM PBF files.
 * @param {string} url - The URL of the .osm.pbf file.
 * @param {string} outputPath - Where to save the filtered file.
 */
async function processPbf(url, outputPath) {
    const tempInput = path.join(__dirname, 'temp_input.osm.pbf');

    try {
        console.log(`Downloading: ${url}...`);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(tempInput);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const filterExpression = `nwr/${ALL_NUMBER_TAGS.join(',')}`;

        const command = `osmium tags-filter "${tempInput}" ${filterExpression} -o "${outputPath}" --add-until-complete --overwrite`;

        console.log('Running Osmium filter...');
        await execPromise(command);
        console.log(`Filtered file saved to: ${outputPath}`);

    } catch (error) {
        console.error('Error processing OSM data:', error.message);
    } finally {
        // 4. Cleanup the original large file
        if (fs.existsSync(tempInput)) {
            fs.unlinkSync(tempInput);
            console.log('Temporary file deleted.');
        }
    }
}


async function splitPbf(filteredFilePath, country) {
    const configPath = './osmium-config.json';
    fs.writeFileSync(configPath, JSON.stringify(generateOsmiumConfigForCountry(country)));

    try {
        const command = `osmium extract --config ${configPath} --overwrite ${filteredFilePath}`;

        console.log('Running Osmium extract...');
        await execPromise(command);
        console.log(`Extracted files saved`);
    } catch (error) {
        console.error('Error extracting OSM data:', error.message);
    }
}

module.exports = {
    downloadAndFilterPlanet,
    processPbf,
    splitPbf,
};
