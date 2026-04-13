const os = require('os');
const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const { COUNTRIES, POLY_DIR, OSM_DIR, ALL_NUMBER_TAGS } = require('./constants');
const { getSubdivisionIds } = require('./fetch-polys');

const execPromise = promisify(exec);

// const PLANET_URL = 'https://download3.bbbike.org/osm/planet/planet-daily.osm.pbf';
const PLANET_URL = 'https://download3.bbbike.org/osm/pbf/region/africa/south-africa-and-lesotho.osm.pbf';

// Ensure output directory exists
if (!fs.existsSync(OSM_DIR)) {
    fs.mkdirSync(OSM_DIR, { recursive: true });
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

        const command = `osmium tags-filter "${tempInput}" ${filterExpression} -o "${outputPath}" --overwrite`;

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

async function splitPbf(filteredFilePath, country = null, division = null) {
    const ids = division ? [division.relationId] : getSubdivisionIds(country);

    console.log(`Starting sequential extraction for ${ids.length} divisions...`);

    for (const id of ids) {
        const polyPath = path.join(POLY_DIR, `${id}.poly`);
        const outputPath = path.join(OSM_DIR, `${id}.osm.pbf`);

        if (!fs.existsSync(polyPath)) {
            console.warn(`[SKIP] Poly file not found for ID: ${id}`);
            continue;
        }

        try {
            console.log(`[EXTRACTING] ID: ${id}`);

            const command = `osmium extract -p "${polyPath}" "${filteredFilePath}" -o "${outputPath}" --strategy simple --overwrite`;

            await execPromise(command);
        } catch (error) {
            console.error(`[ERROR] Failed to extract division ${id}:`, error.message);
            continue;
        }
    }

    console.log(`Finished all extractions for ${country?.name || 'division'}.`);
}

/**
 * Fetches and extracts a timestamp from OSM metadata files.
 * Supports download3.bbbike.org (.timestamp) and download.openstreetmap.fr (.state.txt)
 * * @param {string} pbfUrl - The URL to the .osm.pbf file
 * @returns {Promise<string|null>} The ISO timestamp or null if not found
 */
async function getOsmTimestamp(pbfUrl) {
    try {
        let metadataUrl;
        let type;

        if (pbfUrl.includes('bbbike.org')) {
            metadataUrl = pbfUrl + '.timestamp';
            type = 'bbbike';
        } else if (pbfUrl.includes('openstreetmap.fr')) {
            metadataUrl = pbfUrl.replace('.osm.pbf', '.state.txt');
            type = 'osmfr';
        } else {
            throw new Error('Unsupported provider URL');
        }

        const response = await fetch(metadataUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const text = (await response.text()).trim();

        if (type === 'bbbike') {
            // Format: 2026-04-13T00:00:00Z
            return text;
        } else if (type === 'osmfr') {
            // Format: timestamp=2026-04-13T00\:00\:30Z
            // Note: We remove backslashes often found in .state.txt files
            const match = text.match(/timestamp=(.+)/);
            return match ? match[1].replace(/\\/g, '') : null;
        }

    } catch (error) {
        console.error('Error fetching timestamp:', error);
        return null;
    }
}

module.exports = {
    processPbf,
    splitPbf,
    getOsmTimestamp,
};
