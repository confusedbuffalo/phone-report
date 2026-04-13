const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { COUNTRIES, POLY_DIR } = require('./constants');

const BASE_URL = 'https://polygons.openstreetmap.fr/get_poly.py?id=';

// Ensure output directory exists
if (!fs.existsSync(POLY_DIR)) {
    fs.mkdirSync(POLY_DIR, { recursive: true });
}

const isRefresh = process.argv.includes('--refresh');

/**
 * Extracts all unique subdivision IDs from a country object.
 * Handles flat 'divisions', nested 'divisionMap' and both primitive IDs or Object structures.
 */
function getSubdivisionIds(country) {
    // Helper to extract the ID regardless of whether the value is a number or an object
    const extractId = (val) => (typeof val === 'object' && val !== null ? val.relationId : val);

    if (country.divisions) {
        return Object.values(country.divisions).map(extractId);
    }

    if (country.divisionMap) {
        return Object.values(country.divisionMap).flatMap(subRegion =>
            Object.values(subRegion).map(extractId)
        );
    }

    return [];
}

/**
 * Extracts all unique relation IDs from the entire config object.
 */
function getAllRelationIds(data) {
    const ids = new Set();

    Object.values(data).forEach(country => {
        const countryIds = getSubdivisionIds(country);

        countryIds.forEach(id => {
            if (id !== undefined && id !== null) {
                ids.add(id.toString());
            }
        });
    });

    return ids;
}

/**
 * Removes files from /poly that are no longer in the JSON
 */
function cleanupStaleFiles(validIds) {
    const files = fs.readdirSync(POLY_DIR);
    files.forEach(file => {
        if (path.extname(file) === '.poly') {
            const relationId = path.basename(file, '.poly');
            if (!validIds.has(relationId)) {
                console.log(`🗑️ Removing stale file: ${file}`);
                fs.unlinkSync(path.join(POLY_DIR, file));
            }
        }
    });
}

async function fetchPoly(relationId) {
    const filePath = path.join(POLY_DIR, `${relationId}.poly`);

    if (!isRefresh && fs.existsSync(filePath)) {
        return; // Skip existing
    }

    try {
        console.log(`Fetching relation ${relationId}...`);
        const response = await axios.get(`${BASE_URL}${relationId}&params=0`);

        if (response.data.includes('None') || response.status !== 200) {
            console.error(`⚠️ Failed to get valid poly for ${relationId}`);
            return;
        }

        fs.writeFileSync(filePath, response.data);
        // Rate limiting for the community server
        await new Promise(res => setTimeout(res, 1000));
    } catch (error) {
        console.error(`❌ Error fetching ${relationId}: ${error.message}`);
    }
}

async function run() {
    const validIds = getAllRelationIds(COUNTRIES);
    console.log(`Found ${validIds.size} unique relations in JSON.`);

    cleanupStaleFiles(validIds);

    console.log(`Starting fetch (Refresh mode: ${isRefresh})...`);
    for (const id of validIds) {
        await fetchPoly(id);
    }
    console.log('Done!');
}

if (require.main === module) {
    run();
}

module.exports = {
    getSubdivisionIds,
};
