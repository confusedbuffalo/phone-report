import fs from 'fs';
import { createBaseItem } from './data-processor.js';

/**
 * Validates names.
 * @param {Array<Object>} elementStream - OSM elements with name tags.
 * @param {string} countryCode - The country code for special handling of multi-lingual names in the name tag.
 * @param {string} tmpFilePath - The temporary file path to store the invalid items.
 * @returns {{
 * totalCount: number,
 * invalidCount: number,
 * missingNamesCount: number
 * }} An object containing the breakdown of record counts.
 */
export async function validateNames(elementStream, countryCode, tmpFilePath) {
    const fileStream = fs.createWriteStream(tmpFilePath);
    fileStream.write('[\n');
    let isFirstItem = true;

    let totalCount = 0;
    let incompleteNames = 0;
    let missingNamesCount = 0;

    for await (const element of elementStream) {
        if (!element.properties) continue;

        const tags = element.properties;

        const nameTags = Object.keys(tags).reduce((acc, key) => {
            if (key.match(/^name(?::([a-z]{2,3}(?:-[a-zA-Z]{4,})?(?:-[a-zA-Z]{4,})?))$/)) {
                acc[key] = tags[key];
            }
            return acc;
        }, {});

        const primaryName = tags['name'];

        if (Object.keys(nameTags).length === 0) continue;

        totalCount++;

        let item = null;

        const getOrCreateItem = () => {
            if (item) return item;

            item = {
                ...createBaseItem(element),
                nameTags: new Map(),
            };
            return item;
        };

        // Condition 1: There is no 'name' tag
        // Condition 2: There are localised names (name:*) and none of them match the primary name
        let isInvalid = !primaryName || !Object.values(nameTags).includes(primaryName);

        if (isInvalid) {
            const langMap = {
                'BE-BRU': [['fr', 'nl']], // Strict: Only FR - NL
                'BE-VLG': [
                    ['nl', 'fr'],
                    ['fr', 'nl'],
                ], // Flexible
                'BE-WAL': [
                    ['fr', 'nl'],
                    ['nl', 'fr'],
                    ['fr', 'de'],
                    ['de', 'fr'],
                ], // Flexible
            };

            const validPairs = langMap[countryCode] || [];

            // Check if primaryName matches any allowed joined pair for the region
            const isValidCombo = validPairs.some(([langA, langB]) => {
                const valA = nameTags[`name:${langA}`];
                const valB = nameTags[`name:${langB}`];
                return valA && valB && primaryName === `${valA} - ${valB}`;
            });

            if (isValidCombo) isInvalid = false;
        }

        if (!primaryName) missingNamesCount++;

        if (isInvalid) {
            const currentItem = getOrCreateItem(true);
            currentItem.nameTags = nameTags;
        }

        if (item) {
            incompleteNames++;

            if (!isFirstItem) {
                fileStream.write(',\n');
            }

            // Convert Maps and nested Maps
            fileStream.write(
                JSON.stringify(item, (key, value) => {
                    if (value instanceof Map) {
                        return Object.fromEntries(value);
                    }
                    return value;
                })
            );
            isFirstItem = false;
        }
    }

    fileStream.write('\n]');
    fileStream.end();

    await new Promise(resolve => fileStream.on('finish', resolve));

    return { totalCount, invalidCount: incompleteNames, missingNamesCount };
}
