const fs = require('fs');
const { WEBSITE_TAGS } = require('./constants');
const { getRepresentativeLocation } = require('./data-processor');

/**
 * Validates names.
 * @param {Array<Object>} elementStream - OSM elements with name tags.
 * @param {string} countryCode - The country code for special handling of multi-lingual names in the name tag.
 * @param {string} tmpFilePath - The temporary file path to store the invalid items.
 * @returns {{
 * totalCount: number,
 * invalidCount: number,
 * missingNames: number
 * }} An object containing the breakdown of record counts.
 */
async function validateNames(elementStream, countryCode, tmpFilePath) {
    const fileStream = fs.createWriteStream(tmpFilePath);
    fileStream.write('[\n');
    let isFirstItem = true;

    let totalNames = 0;
    let incompleteNames = 0;
    let missingNames = 0;

    for await (const element of elementStream) {
        if (!element.properties) continue;

        const tags = element.properties;

        const nameEntries = Object.entries(tags).filter(([key]) => key.match(/^name(?::([a-z]{2,3}(?:-[a-zA-Z]{4,})?(?:-[a-zA-Z]{4,})?))$/));
        const primaryName = tags['name'];

        if (Object.keys(nameEntries).length === 0 && !primaryName) continue;

        totalNames++;
        
        let item = null;

        const getOrCreateItem = () => {
            if (item) return item;

            let website = WEBSITE_TAGS.map(tag => tags[tag]).find(url => url);
            if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
                website = `http://${website}`;
            }

            const { lat, lon } = getRepresentativeLocation(element.geometry);
            
            const { type: geometryType, coordinates: c } = element.geometry;
            // Many areas are returned as LineString due to osmium export
            const couldBeArea = ['Polygon', 'MultiPolygon'].includes(geometryType)
                || (geometryType === 'LineString' && c.length > 2 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]);

            const elementTimestamp = element.properties["@timestamp"] ? new Date(element.properties["@timestamp"] * 1000).toISOString() : 0;

            const baseItem = {
                type: element.properties["@type"],
                id: element.properties["@id"],
                user: element.properties["@user"],
                timestamp: elementTimestamp,
                changeset: element.properties["@changeset"],
                website,
                lat,
                lon,
                couldBeArea,
                name: tags.name,
                allTags: tags,
                nameTags: new Map(),
            };
            item = baseItem
            return item;
        };

        // Condition 1: There is no 'name' tag
        // Condition 2: There are localised names (name:*) and none of them match the primary name
        const isInvalid =
            !primaryName ||
            (nameEntries.some(([k]) => k.startsWith('name:')) && !nameEntries.some(([_, v]) => v === primaryName));

        if (!primaryName) missingNames++;

        if (isInvalid) {
            const currentItem = getOrCreateItem(true);
            currentItem.nameTags = Object.fromEntries(nameEntries);
        }

        if (item) {
            incompleteNames++;
            
            if (!isFirstItem) {
                fileStream.write(',\n');
            }
            
            // Convert Maps and nested Maps
            fileStream.write(JSON.stringify(item, (key, value) => {
                if (value instanceof Map) {
                    return Object.fromEntries(value);
                }
                return value;
            }));
            isFirstItem = false;
        }
    }

    fileStream.write('\n]');
    fileStream.end();

    await new Promise(resolve => fileStream.on('finish', resolve));

    return { totalNames, incompleteNames, missingNames };
}

module.exports = {
    validateNames,
};
