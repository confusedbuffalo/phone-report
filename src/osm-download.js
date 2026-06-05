import axios from 'axios';
import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { POLY_DIR, ALL_NUMBER_TAGS, ALL_HOURS_TAGS } from './constants.js';
import { getSubdivisionIds } from './fetch-polys.js';

const execPromise = promisify(exec);

/**
 * Executes a function with a single retry for temporary network errors (timeout or 5xx).
 * @param {Function} fn - The async function to execute.
 * @param {string} label - A label for logging.
 * @returns {Promise<any>}
 */
export async function withRetry(fn, label) {
    const maxAttempts = 2;
    const delay = 2000;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const isTimeout =
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNABORTED' ||
                error.message?.toLowerCase().includes('timeout');
            const status = error.response?.status || error.status;
            const is5xx = status >= 500 && status < 600;

            if ((isTimeout || is5xx) && attempt < maxAttempts) {
                console.warn(`${label} failed (${error.code || status}). Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    throw lastError;
}

/**
 * Downloads a specified OSM PBF file and saves it to the given path.
 * @param {string} url - The URL of the .osm.pbf file.
 * @param {string} outputPath - Where to save the file.
 */
export async function downloadPbf(url, outputPath) {
    console.log(`Downloading: ${url}`);
    try {
        await withRetry(async () => {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
            });

            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        }, `Download ${url}`);
    } catch (error) {
        console.error('Error download OSM file:', error.message);
        throw error;
    }
}

const FILTER_EXPRESSIONS = {
    phone: `nwr/${ALL_NUMBER_TAGS.join(',')}`,
    name: 'name:*',
    hours: `nwr/${ALL_HOURS_TAGS.join(',')}`,
};

/**
 * Filters an OSM PBF file by tags appropriate for the specified report type.
 * @param {string} inputPath - The filename of the .osm.pbf file.
 * @param {string} outputPath - Where to save the filtered file.
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report to filter for.
 */
export async function filterPbf(inputPath, outputPath, reportType) {
    try {
        const filterExpression = FILTER_EXPRESSIONS[reportType];

        const command = `osmium tags-filter "${inputPath}" "${filterExpression}" -o "${outputPath}" --overwrite`;
        await execPromise(command);
    } catch (error) {
        console.error('Error processing OSM data:', error.message);
    }
}

/**
 * Splits a PBF file into smaller extracts based on country or specific division boundaries.
 * * This function uses the `osmium` CLI tool to extract geographic data using `.poly` files.
 * If a division is provided, it extracts that specific relation; otherwise, it
 * iterates through all subdivision IDs for the given country.
 * * @async
 * @param {string} filteredFilePath - The file path to the source .osm.pbf file.
 * @param {string} outputDir - The directory in which to save the output files.
 * @param {string|null} [country=null] - The country name or identifier used to fetch subdivision IDs.
 * @param {Object|null} [division=null] - An optional division object.
 * @param {string} division.relationId - The OpenStreetMap relation ID for the division.
 * @returns {Promise<void>} Resolves when the extraction process is complete for all IDs.
 * @throws {Error} Logs an error if the `osmium` command fails for a specific division.
 */
export async function splitPbf(filteredFilePath, outputDir, country = null, division = null) {
    const ids = division ? [division.relationId] : getSubdivisionIds(country);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const id of ids) {
        const polyPath = path.join(POLY_DIR, `${id}.poly`);
        const tempPath = path.join(outputDir, `${id}.osm.pbf`);
        const outputPath = path.join(outputDir, `${id}.geojsonseq`);

        if (!fs.existsSync(polyPath)) {
            console.warn(`[SKIP] Poly file not found for ID: ${id}`);
            continue;
        }

        try {
            const extractCommand = `osmium extract -p "${polyPath}" "${filteredFilePath}" -o "${tempPath}" --strategy simple --overwrite`;
            const exportCommand = `osmium export "${tempPath}" -a type,id,changeset,timestamp,user -f geojsonseq -o "${outputPath}" --overwrite`;
            await execPromise(extractCommand);
            await execPromise(exportCommand);
            fs.unlinkSync(tempPath);
        } catch (error) {
            console.error(`[ERROR] Failed to extract division ${id}:`, error.message);
            continue;
        }
    }
}

/**
 * Fetches and extracts a timestamp from OSM metadata or headers.
 * Supports bbbike, openstreetmap.fr, geofabrik.de and geo2day.com
 * @param {string} pbfUrl - The URL to the .osm.pbf file
 * @returns {Promise<string|null>} The ISO timestamp string
 */
export async function getOsmTimestamp(pbfUrl) {
    try {
        return await withRetry(async () => {
            // Handle Geofabrik and geo2day via HTTP Headers
            if (pbfUrl.includes('geofabrik.de') || pbfUrl.includes('geo2day.com')) {
                const response = await fetch(pbfUrl, { method: 'HEAD' });
                if (!response.ok && response.status >= 500) {
                    throw { status: response.status, message: `HTTP error! status: ${response.status}` };
                }
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
                metadataUrl = pbfUrl.replace('-latest.osm.pbf', '.state.txt').replace('.osm.pbf', '.state.txt');
                isOsmFr = true;
            } else {
                throw new Error('Unsupported provider URL');
            }

            const response = await fetch(metadataUrl);
            if (!response.ok) {
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                throw error;
            }

            const text = (await response.text()).trim();

            if (isOsmFr) {
                const match = text.match(/timestamp=(.+)/);
                // Clean backslashes and standardise to ISO
                const raw = match ? match[1].replace(/\\/g, '') : null;
                return raw ? new Date(raw).toISOString() : null;
            }

            return new Date(text).toISOString();
        }, `Fetch timestamp for ${pbfUrl}`);
    } catch (error) {
        console.error('Error fetching timestamp:', error);
        return null;
    }
}
