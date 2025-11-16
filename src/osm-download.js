const { OVERPASS_API_URL, PHONE_TAGS } = require('./constants');
const { parser } = require('stream-json');
const { pick } = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { Readable } = require('stream');

/**
 * Fetches administrative subdivisions for a given parent area from the Overpass API.
 * This function is recursive and will retry on certain API errors (429, 504).
 * @param {number} divisionId - The OSM relation ID of the parent division.
 * @param {string} divisionName - The name of the division (for logging).
 * @param {number} admin_level - The administrative level of the subdivisions to fetch.
 * @param {number} [retries=3] - Number of retries left.
 * @returns {Promise<Array<{name: string, id: number}>>} A promise that resolves to an array of subdivision objects.
 */
async function fetchAdminLevels(divisionId, divisionName, admin_level, retries = 3) {
    console.log(`Fetching all subdivisions for ${divisionName} (ID: ${divisionId})...`);
    const { default: fetch } = await import('node-fetch');

    const queryTimeout = 180;
    const areaId = divisionId + 3600000000;

    const query = `
        [out:json][timeout:${queryTimeout}];
        area(${areaId})->.division;
        rel(area.division)["admin_level"="${admin_level}"]["boundary"="administrative"]["name"];
        out body;
    `;

    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (response.status === 429 || response.status === 504) {
            if (retries > 0) {
                const retryAfter = response.headers.get('Retry-After') || 60;
                console.warn(`Overpass API rate limit or gateway timeout hit (error ${response.status}). Retrying in ${retryAfter} seconds... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return fetchAdminLevels(divisionId, divisionName, admin_level, retries - 1);
            } else {
                throw new Error(`Overpass API response error: ${response.statusText}`);
            }
        }

        if (!response.ok) {
            throw new Error(`Overpass API response error: ${response.statusText}`);
        }

        const data = await response.json();
        const subdivisions = data.elements.map(el => ({
            name: el.tags.name,
            id: el.id
        }));

        const uniqueSubdivisions = [...new Map(subdivisions.map(item => [item.name, item])).values()];
        return uniqueSubdivisions;
    } catch (error) {
        console.error(`Error fetching subdivisions for ${divisionName}:`, error);
        return [];
    }
}

/**
 * Fetches all OSM elements that have one of the specified phone tags within a given division's area.
 * This function is recursive and will retry on certain API errors (429, 504).
 * @param {{name: string, id: number}} division - The division object, containing its name and OSM relation ID.
 * @param {number} [retries=3] - Number of retries left.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of OSM element objects.
 */
async function fetchOsmDataForDivision(division, retries = 3) {
    console.log(`Fetching data for division: ${division.name} (ID: ${division.id})...`);
    const { default: fetch } = await import('node-fetch');

    const areaId = division.id + 3600000000;
    const queryTimeout = 600;

    const tagQuery = PHONE_TAGS
        .map(tag => `nwr(area.division)["${tag}"];`)
        .join('\n');

    const overpassQuery = `
        [out:json][timeout:${queryTimeout}];
        area(${areaId})->.division;
        (
          ${tagQuery}
        );
        out center;
    `;

    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (response.status === 429 || response.status === 504) {
            if (retries > 0) {
                const retryAfter = response.headers.get('Retry-After') || 60;
                console.warn(`Overpass API rate limit or gateway timeout hit (error ${response.status}). Retrying in ${retryAfter} seconds... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return await fetchOsmDataForDivision(division, retries - 1);
            }
        }

        if (!response.ok) {
            throw new Error(`Overpass API response error: ${response.statusText}`);
        }

        const jsonStream = response.body.pipe(parser({ jsonStreaming: true }));
        const elementStream = jsonStream.pipe(pick({ filter: 'elements' })).pipe(streamArray());
        return Readable.from(elementStream.map(item => item.value));
    } catch (error) {
        const retryAfter = 60;
        if (error.code === 'ECONNRESET' || error.message.includes('socket hang up')) {
            if (retries > 0) {
                console.warn(`Overpass API connection reset. Retrying in ${retryAfter} seconds... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return await fetchOsmDataForDivision(division, retries - 1);
            }
        }
        console.error(`Error fetching OSM data for ${division.name}:`, error);
        return Readable.from([]);
    }
}

module.exports = {
    fetchAdminLevels,
    fetchOsmDataForDivision,
};
