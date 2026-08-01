import axios from 'axios';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { POLY_DIR, ALL_NUMBER_TAGS, ALL_HOURS_TAGS } from './constants.js';
import { getSubdivisionIds } from './fetch-polys.js';

const execPromise = promisify(exec);

const MIN_FREE_DISK_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

/**
 * Class to track disk space reservations and queue downloads until sufficient space is free.
 */
export class DiskSpaceManager {
    constructor(targetDir = process.cwd(), multiplier = 1.5, maxActiveTickets = 5) {
        this.targetDir = targetDir;
        this.multiplier = multiplier;
        this.reservedBytes = 0;
        this.queue = [];
        this.activeTickets = 0;
        this.maxActiveTickets = maxActiveTickets;
    }

    /**
     * Gets actual unreserved free space, enforcing a hard minimum disk floor.
     */
    async getAvailableSpace() {
        const stats = await fsPromises.statfs(this.targetDir);
        const realDiskFree = stats.bsize * stats.bavail;

        // Ensure we always leave a safety buffer on the physical disk
        const usableDiskFree = Math.max(0, realDiskFree - MIN_FREE_DISK_BYTES);
        return Math.max(0, usableDiskFree - this.reservedBytes);
    }

    async getRequiredSpace(url) {
        // Fallback: 5 GB
        let downloadBytes = 5 * 1024 * 1024 * 1024;
        try {
            const response = await axios.head(url);
            const contentLength = response.headers['content-length'];
            if (!contentLength) throw new Error('Content-Length missing');
            downloadBytes = parseInt(contentLength, 10);
        } catch (error) {
            console.warn(`Could not determine size via HEAD for ${url}: ${error.message}`);
        }
        return {
            downloadBytes,
            totalBytes: Math.ceil(downloadBytes * this.multiplier),
        };
    }

    async reserveSpace(url) {
        const { downloadBytes, totalBytes } = await this.getRequiredSpace(url);

        return new Promise(resolve => {
            const tryAcquire = async () => {
                const freeSpace = await this.getAvailableSpace();
                if (freeSpace >= totalBytes && this.activeTickets < this.maxActiveTickets) {
                    this.reservedBytes += totalBytes;
                    this.activeTickets++;
                    let currentReservation = totalBytes;

                    const ticket = {
                        downloadBytes,

                        onDownloadComplete: actualDownloadedBytes => {
                            const bytesToRelease = actualDownloadedBytes || downloadBytes;
                            this.reduceReservation(ticket, bytesToRelease);
                        },

                        release: () => {
                            this.reduceReservation(ticket, currentReservation, true);
                        },
                    };

                    resolve(ticket);
                } else {
                    this.queue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }

    reduceReservation(ticket, amount, done) {
        const releaseAmount = Math.min(amount, this.reservedBytes);
        this.reservedBytes -= releaseAmount;
        if (!done) return;
        this.activeTickets--;
        this.checkQueue();
    }

    checkQueue() {
        if (this.queue.length > 0 && this.activeTickets < this.maxActiveTickets) {
            const next = this.queue.shift();
            next();
        }
    }
}

export const globalSpaceManager = new DiskSpaceManager();

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
 * Downloads a specified OSM PBF file into a temporary file.
 * @param {string} url - The URL of the .osm.pbf file.
 * @param {DiskSpaceManager} [spaceManager] - Optional custom space manager instance.
 * @returns {Promise<{path: string, dispose: () => void}>} Where the file was saved and how to get rid of it.
 */
export async function downloadPbf(url, spaceManager = globalSpaceManager) {
    const ticket = await spaceManager.reserveSpace(url);
    console.log(`Downloading: ${url}`);
    const outputPath = path.join(process.cwd(), `${uuidv4()}.osm.pbf`);

    const dispose = () => {
        try {
            fs.rmSync(outputPath, { force: true });
        } catch (error) {
            console.warn(`Failed to remove temporary PBF ${outputPath}: ${error.message}`);
        } finally {
            ticket.release();
        }
    };

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

        const stats = fs.statSync(outputPath);
        ticket.onDownloadComplete(stats.size);

        return { path: outputPath, dispose };
    } catch (error) {
        console.error('Error downloading OSM file:', error?.message || error);
        dispose();
        throw error;
    }
}

/**
 * Simple concurrency manager to limit parallel execution of Osmium commands.
 */
export class OsmiumQueueManager {
    constructor(maxConcurrent = 2) {
        this.maxConcurrent = maxConcurrent;
        this.activeCount = 0;
        this.queue = [];
    }

    /**
     * Acquires an execution slot, waiting in line if max concurrency is reached.
     */
    async acquire() {
        if (this.activeCount < this.maxConcurrent) {
            this.activeCount++;
            return;
        }

        await new Promise(resolve => this.queue.push(resolve));
        this.activeCount++;
    }

    /**
     * Releases the slot and triggers the next queued task, if any.
     */
    release() {
        this.activeCount--;
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        }
    }

    /**
     * Helper to wrap and execute an async function within the queue slot.
     * @param {Function} fn - Async task to execute.
     */
    async run(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

export const globalOsmiumManager = new OsmiumQueueManager(2);

const FILTER_EXPRESSIONS = {
    phone: `nwr/${ALL_NUMBER_TAGS.join(',')}`,
    name: 'name:*',
    hours: `nwr/${ALL_HOURS_TAGS.join(',')}`,
};

/**
 * Filters an OSM PBF file by tags appropriate for the specified report type.
 * Limited to 2 max global active Osmium operations.
 * @param {string} inputPath - The filename of the .osm.pbf file.
 * @param {string} outputPath - Where to save the filtered file.
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report to filter for.
 */
export async function filterPbf(inputPath, outputPath, reportType, osmiumManager = globalOsmiumManager) {
    return osmiumManager.run(async () => {
        try {
            const filterExpression = FILTER_EXPRESSIONS[reportType];
            const command = `osmium tags-filter "${inputPath}" "${filterExpression}" -o "${outputPath}" --overwrite`;
            await execPromise(command);
        } catch (error) {
            console.error('Error processing OSM data:', error.message);
            throw error;
        }
    });
}

/**
 * Splits a PBF file into smaller extracts based on country or specific division boundaries.
 * If a division is provided, it extracts that specific relation; otherwise, it
 * iterates through all subdivision IDs for the given country.
 * Treats the whole sequence of subdivisions as one Osmium task slot.
 * @param {string} filteredFilePath - The file path to the source .osm.pbf file.
 * @param {string} outputDir - The directory in which to save the output files.
 * @param {string|null} [country=null] - The country name or identifier used to fetch subdivision IDs.
 * @param {Object|null} [division=null] - An optional division object.
 * @param {string} division.relationId - The OpenStreetMap relation ID for the division.
 * @returns {Promise<void>} Resolves when the extraction process is complete for all IDs.
 */
export async function splitPbf(
    filteredFilePath,
    outputDir,
    country = null,
    division = null,
    osmiumManager = globalOsmiumManager
) {
    return osmiumManager.run(async () => {
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
    });
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
        console.error('Error fetching timestamp, falling back to now:', error);
        return new Date().toISOString();
    }
}
