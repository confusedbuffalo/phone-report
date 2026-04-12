const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { COUNTRIES, POLY_DIR, OSM_DIR, ALL_NUMBER_TAGS } = require('./constants');

const PLANET_URL = 'https://download3.bbbike.org/osm/planet/planet-daily.osm.pbf';

// Ensure output directory exists
if (!fs.existsSync(OSM_DIR)) {
    fs.mkdirSync(OSM_DIR, { recursive: true });
}

function generateOsmiumConfig() {
    const extracts = [];
    const processDivisions = (divisions) => {
        Object.values(divisions).forEach(id => {
            extracts.push({
                output: path.join(OSM_DIR, `${id}.jsonseq`),
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

    // Convert ['phone', 'contact:phone'] to "phone,contact:phone" for Osmium
    const filterExpression = ALL_NUMBER_TAGS.join(',');

    console.log(`Starting pipeline: Download -> Filter (${filterExpression}) -> Extract/Clip`);

    return new Promise(async (resolve, reject) => {
        try {
            const response = await axios({ method: 'get', url: PLANET_URL, responseType: 'stream' });

            // Step 1: Filter Stream
            const filterProc = spawn('osmium', [
                'tags-filter', '-F', 'pbf', '-',
                filterExpression,
                '-f', 'pbf', '-' // Output as PBF to the next pipe for speed
            ]);

            // Step 2: Extract/Clip Stream
            const extractProc = spawn('osmium', [
                'extract',
                '-F', 'pbf', '-',
                '-c', configPath,
                '-s', 'simple',
                '-f', 'jsonseq',
                '--overwrite',
            ]);

            const handleSpawnError = (proc, name) => {
                proc.on('error', (err) => {
                    console.error(`Failed to start ${name}:`, err);
                    response.data.destroy(); // Stop downloading if a process fails
                });
                proc.on('exit', (code) => {
                    if (code !== 0) console.error(`${name} exited with code ${code}`);
                });
            };

            handleSpawnError(filterProc, 'Filter');
            handleSpawnError(extractProc, 'Extract');

            // --- THE PIPE CHAIN ---
            // If a pipe fails, prevent EPIPE by handling the error on the destination
            filterProc.stdin.on('error', (err) => {
                console.error("Filter STDIN Error (Broken Pipe):", err.message);
            }); response.data.pipe(filterProc.stdin);
            filterProc.stdout.pipe(extractProc.stdin);

            extractProc.stderr.on('data', (d) => console.error(`Osmium Error: ${d}`));

            extractProc.on('close', (code) => {
                if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
                code === 0 ? resolve() : reject(new Error(`Pipeline failed at Extract stage (Code ${code})`));
            });

        } catch (err) { reject(err); }
    });
}

module.exports = {
    downloadAndFilterPlanet,
};
