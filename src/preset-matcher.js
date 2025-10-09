const fs = require('fs');
const path = require('path');

// --- Global Data Setup ---

/**
 * Loads the raw preset data from the iD Tagging Schema module.
 * @type {Object<string, object>}
 */
const presetsData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'node_modules/@openstreetmap/id-tagging-schema/dist/presets.json'), 'utf8'));

/**
 * A map of all presets, indexed by their ID, with the ID added as a property to the preset object.
 * @type {Object<string, object>}
 */
const allPresets = {};
for (const key in presetsData) {
    allPresets[key] = { ...presetsData[key], id: key };
}

/**
 * Cache for loaded translation data to avoid redundant file system access.
 * @type {Object<string, object>}
 */
const translations = {};

// --- Helper Functions ---

/**
 * Loads translation data for a given locale, falling back to language code and then 'en'.
 * The resulting translation object is cached.
 * Note: This function's actual file access logic is often mocked in tests.
 * @param {string} locale - The target locale string (e.g., 'en', 'en-US', 'fr').
 * @returns {object|null} The translation object for the locale, or null if loading fails.
 */
function loadTranslation(locale) {
    if (translations[locale]) {
        return translations[locale];
    }

    const lang = locale.split('-')[0];
    let translation;

    // Try full locale, then language, then fallback to english
    const translationPaths = [
        path.resolve(__dirname, '..', `node_modules/@openstreetmap/id-tagging-schema/dist/translations/${locale}.json`),
        path.resolve(__dirname, '..', `node_modules/@openstreetmap/id-tagging-schema/dist/translations/${lang}.json`),
        path.resolve(__dirname, '..', `node_modules/@openstreetmap/id-tagging-schema/dist/translations/en.json`)
    ];

    for (const p of translationPaths) {
        if (fs.existsSync(p)) {
            const translationData = JSON.parse(fs.readFileSync(p, 'utf8'));
            translation = translationData[locale] || translationData[lang] || translationData.en;
            if (translation) break;
        }
    }

    if (translation) {
        translations[locale] = translation;
        return translation;
    }

    return null;
}

// Preload 'en' for immediate fallback access
loadTranslation('en');

/**
 * Determines the simplified geometry type for an OpenStreetMap item based on its type and tags.
 * This logic attempts to classify ways/relations as 'area' if they contain known area keys.
 * @param {object} item - The OSM item object (must have 'type' and 'allTags').
 * @returns {('point'|'line'|'area'|'relation')} The determined geometry type.
 */
function getGeometry(item) {
    if (item.type === 'node') return 'point'; // TODO: could also be vertex, but is there anything that can only be a vertex and have a phone number?

    // For ways and relations, determine if it's an area based on 'area' tag
    if (item.allTags.area === 'yes') return 'area';
    if (item.allTags.area === 'no') return 'line';

    // Check for common area-defining keys
    const areaKeys = [
        'amenity', 'shop', 'tourism', 'leisure', 'building',
        'craft', 'healthcare', 'military', 'landuse', 'natural',
        'historic'
    ]
    for (const key of areaKeys) {
        if (item.allTags[key]) {
            return 'area';
        }
    }

    // Relations that weren't classified as an area based on tags
    if (item.type === 'relation') {
        if (item.allTags['type'] && item.allTags['type'] === 'multipolygon') {
            return 'area';
        }
        return 'relation';
    }

    // Resort to checking if it could be an area based on whether it forms a loop
    if (item.couldBeArea) {
        return 'area'
    }
    return 'line';
}

/**
 * Calculates a match score between a preset's required tags and a feature's actual tags and geometry.
 * A score of -1 indicates an incompatible match.
 * @param {object} preset - The preset definition (must have .tags and .geometry).
 * @param {object} tags - The target OSM feature's tags (e.g., item.allTags).
 * @param {string} geometry - The target OSM feature's geometry type.
 * @returns {number} The match score. Higher scores indicate a better, more specific match.
 */
function getMatchScore(preset, tags, geometry) {
    // Check geometry compatibility
    if (preset.geometry && !preset.geometry.includes(geometry)) {
        return -1;
    }

    let specificMatches = 0;
    let wildcardMatches = 0;

    // Check tag compatibility and count matches
    for (const key in preset.tags) {
        const value = preset.tags[key];
        
        // Fail if a required tag key is missing from the feature
        if (!tags.hasOwnProperty(key)) {
            return -1; 
        }
        
        if (value === '*') {
            // Wildcard match
            wildcardMatches++;
        } else if (value === tags[key]) {
            // Exact value match
            specificMatches++;
        } else {
            // Fail if the tag exists but the value is incorrect
            return -1; 
        }
    }

    if (preset.matchScore) {
        return preset.matchScore
    }

    return specificMatches + wildcardMatches * 0.5;
}

/**
 * Finds the best matching preset for a given OSM item by iterating through all known presets
 * and maximizing the match score.
 * @param {object} item - The OSM item object (must have .allTags and .type).
 * @param {string} [locale='en'] - The desired language locale for the preset name translation.
 * @returns {object|null} A copy of the best matching preset with its name translated, or null if no match is found.
 */
function getBestPreset(item, locale = 'en') {
    const geometry = getGeometry(item);
    let bestPreset = null;
    let maxScore = -1;

    // Use globally injected mock presets for testing, or the real presets otherwise.
    const presetsToTest = (typeof global !== 'undefined' && typeof global.getMockPresets === 'function')
        ? global.getMockPresets()
        : allPresets;

    for (const id in presetsToTest) {
        const preset = presetsToTest[id];

        const score = getMatchScore(preset, item.allTags, geometry);
        if (score > maxScore) {
            maxScore = score;
            bestPreset = preset;
        }
    }

    if (bestPreset) {
        // Create a copy to avoid modifying the original preset object
        const presetCopy = { ...bestPreset };
        const translation = loadTranslation(locale) || loadTranslation('en');

        // Apply translation if available
        if (translation && translation.presets && translation.presets.presets && translation.presets.presets[presetCopy.id]) {
            presetCopy.name = translation.presets.presets[presetCopy.id].name;
        } else {
             // Fallback name generation
            const nameParts = presetCopy.id.split('/');
            const fallbackName = nameParts[nameParts.length - 1];
            presetCopy.name = fallbackName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return presetCopy;
    }

    return null;
}

module.exports = {
    getBestPreset,
    getGeometry,
    getMatchScore
};