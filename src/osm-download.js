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
        await execPromise(command);
    } catch (error) {
        console.error('Error processing OSM data:', error.message);
    } finally {
        // 4. Cleanup the original large file
        if (fs.existsSync(tempInput)) {
            fs.unlinkSync(tempInput);
        }
    }
}

async function splitPbf(filteredFilePath, country = null, division = null) {
    const ids = division ? [division.relationId] : getSubdivisionIds(country);

    for (const id of ids) {
        const polyPath = path.join(POLY_DIR, `${id}.poly`);
        const outputPath = path.join(OSM_DIR, `${id}.osm.pbf`);

        if (!fs.existsSync(polyPath)) {
            console.warn(`[SKIP] Poly file not found for ID: ${id}`);
            continue;
        }

        try {
            const command = `osmium extract -p "${polyPath}" "${filteredFilePath}" -o "${outputPath}" --strategy simple --overwrite`;
            await execPromise(command);
        } catch (error) {
            console.error(`[ERROR] Failed to extract division ${id}:`, error.message);
            continue;
        }
    }
}

/**
 * Fetches and extracts a timestamp from OSM metadata or headers.
 * Supports bbbike, openstreetmap.fr, and geofabrik.de
 * @param {string} pbfUrl - The URL to the .osm.pbf file
 * @returns {Promise<string|null>} The ISO timestamp string
 */
async function getOsmTimestamp(pbfUrl) {
    try {
        // Handle Geofabrik via HTTP Headers
        if (pbfUrl.includes('geofabrik.de') || pbfUrl.includes('geo2day.com')) {
            const response = await fetch(pbfUrl, { method: 'HEAD' });
            const lastModified = response.headers.get('last-modified');

            if (lastModified) {
                // Convert "Mon, 13 Apr 2026 00:00:00 GMT" to "2026-04-13T00:00:00.000Z"
                return new Date(lastModified).toISOString();
            }
            return null;
        }

        // Handle Sidecar Metadata Files
        let metadataUrl;
        let isOsmFr = false;

        if (pbfUrl.includes('bbbike.org')) {
            metadataUrl = pbfUrl + '.timestamp';
        } else if (pbfUrl.includes('openstreetmap.fr')) {
            metadataUrl = pbfUrl.replace('.osm.pbf', '.state.txt');
            isOsmFr = true;
        } else {
            throw new Error('Unsupported provider URL');
        }

        const response = await fetch(metadataUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const text = (await response.text()).trim();

        if (isOsmFr) {
            const match = text.match(/timestamp=(.+)/);
            // Clean backslashes and standardize to ISO
            const raw = match ? match[1].replace(/\\/g, '') : null;
            return raw ? new Date(raw).toISOString() : null;
        }

        // Default for BBBike (already almost ISO)
        return new Date(text).toISOString();

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
