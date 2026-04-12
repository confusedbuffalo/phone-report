const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { COUNTRIES, POLY_DIR, OSM_DIR, ALL_NUMBER_TAGS } = require('./constants');

// const PLANET_URL = 'https://download3.bbbike.org/osm/planet/planet-daily.osm.pbf';
const PLANET_URL = 'https://download3.bbbike.org/osm/planet/sub-planet-daily/europe-central.osm.pbf';

// Ensure output directory exists
if (!fs.existsSync(OSM_DIR)) {
    fs.mkdirSync(OSM_DIR, { recursive: true });
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

module.exports = {
    downloadAndFilterPlanet,
};
