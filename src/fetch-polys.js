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
 * Extracts all unique relation IDs from the JSON structure
 */
function getAllRelationIds(data) {
    const ids = new Set();
    Object.values(data).forEach(country => {
      // Standard divisions
      if (country.divisions) {
        Object.values(country.divisions).forEach(id => ids.add(id.toString()));
      }
      // Nested division maps (e.g., DE, GB)
      if (country.divisionMap) {
        Object.values(country.divisionMap).forEach(sub => {
          Object.values(sub).forEach(id => ids.add(id.toString()));
        });
      }
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
  
    // 1. Cleanup
    cleanupStaleFiles(validIds);
  
    // 2. Fetch
    console.log(`Starting fetch (Refresh mode: ${isRefresh})...`);
    for (const id of validIds) {
      await fetchPoly(id);
    }
    console.log('Done!');
  }
  
  run();
