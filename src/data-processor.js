const pointOnFeature = require('@turf/point-on-feature').default;
const { getBestPreset, getGeometry } = require('./preset-matcher');
const { FEATURE_TAGS, HISTORIC_AND_DISUSED_PREFIXES } = require('./constants');


/**
 * Converts a country or region name into a 'safe' string (slug) suitable for
 * use as filenames, URLs, or command-line identifiers.
 *
 * This function uses Unicode property escapes (\p{L} and \p{N}) to robustly
 * preserve all letters and numbers across all world scripts (including accented
 * Latin and non-Latin scripts like Japanese/Cyrillic).
 *
 * @param {string} name - The country or region name to convert.
 * @returns {string} The safe, slugified string.
 */
function safeName(name) {
    if (!name) {
        return '';
    }

    let processedName = name;

    // Convert to lowercase
    processedName = processedName.toLowerCase();

    // Substitute non-letter (\p{L}), non-number (\p{N}), and non-space (\s) characters with a hyphen.
    // The 'gu' flags enable global replacement and robust Unicode handling.
    // This step preserves all letters/numbers across all scripts and substitutes all symbols.
    // Note: If running in a very old JS environment that doesn't support \p{L}, this may fail.
    try {
        processedName = processedName.replace(/[^\p{L}\p{N}\s]+/gu, '-');
    } catch (e) {
        // Fallback for environments lacking full Unicode property support
        // This regex is less precise but covers most common use cases
        processedName = processedName.replace(/[^a-z0-9\s\u00C0-\uFFFF]+/g, '-');
    }

    // Replace one or more spaces with a hyphen.
    processedName = processedName.replace(/\s+/g, '-');

    // Remove repeated substitutes (e.g., '--' becomes '-')
    processedName = processedName.replace(/-+/g, '-');

    // Remove substitutes appearing at the start or end of the string.
    processedName = processedName.replace(/^-|-$/g, '');

    return processedName;
}

/**
 * Determines if an OSM feature should be considered disused.
 * It checks for various prefixed tags.
 * An item is not considered disused if it has a primary feature tag (e.g. `amenity`).
 * @param {object} item - An OSM object including allTags.
 * @returns {boolean} True if the feature is considered disused.
 */
function isDisused(item) {
    const featureType = getFeatureType(item);
    if (featureType) {
        return false
    }

    for (const prefix of HISTORIC_AND_DISUSED_PREFIXES) {
        for (const tag of FEATURE_TAGS) {
            if (item.allTags[`${prefix}:${tag}`]) {
                return true
            }
        }
    }
    return false
}

/**
 * Determines a feature's primary type value from its OSM tags.
 * For example, for a feature with `amenity=restaurant`, it returns 'restaurant'.
 * @param {object} item - An OSM object including allTags.
 * @returns {string|null} The value of the most relevant feature tag, or null if not found.
 */
function getFeatureType(item) {
    for (const tag of FEATURE_TAGS) {
        if (item.allTags[tag]) {
            return item.allTags[tag];
        }
    }
    return null
}

/**
 * Determines a readable feature name from OSM tags.
 * If the feature has a `name` tag, it is returned. Otherwise, it attempts to find a
 * descriptive name from presets, or falls back to a formatted feature type.
 * @param {object} item - An OSM object including allTags.
 * @param {string} locale - The locale for translating preset names.
 * @returns {string} A displayable name for the feature.
 */
function getFeatureTypeName(item, locale) {
    if (item.name) {
        return `${item.name}`;
    }

    const preset = getBestPreset(item, locale);
    if (preset && preset.name) {
        return preset.name;
    }

    const formattedType = item.type.replace(/\b\w/g, c => c.toUpperCase());
    return `OSM ${formattedType}`;
}

/**
 * Gets the icon for a feature based on its tags.
 * It first tries to find a matching preset icon. If none is found, it falls back
 * to a generic icon based on the feature's geometry (point, line, area, or relation).
 * @param {Object} item - The OSM data item.
 * @param {string} locale - The locale used for preset matching.
 * @returns {string} The icon name (e.g., 'iD-icon-point', 'maki-restaurant').
 */
function getFeatureIcon(item, locale) {
    const preset = getBestPreset(item, locale);
    if (preset && preset.icon) {
        return preset.icon;
    }
    const geometry = getGeometry(item);
    if (geometry === 'point') {
        return "iD-icon-point"
    } else if (geometry === 'area') {
        return 'iD-icon-area'
    } else if (geometry === 'line') {
        return 'iD-icon-line'
    } else {
        return 'iD-icon-relation'
    }
}

/**
 * Extracts a representative [lat, lng] from a GeoJSON geometry.
 * Uses 'pointOnFeature' to ensure the point resides within the geometry boundaries.
 * * @param {Object} geometry - A GeoJSON geometry object (Polygon, MultiPolygon, etc.)
 * @returns {Object} An object containing lat and lng.
 */
function getRepresentativeLocation(geometry) {
    if (!geometry) return null;

    const representativePoint = pointOnFeature(geometry);
    const [lon, lat] = representativePoint.geometry.coordinates;

    return {
        lat: lat,
        lon: lon
    };
}


module.exports = {
    safeName,
    isDisused,
    getFeatureTypeName,
    getFeatureIcon,
    getRepresentativeLocation,
};
