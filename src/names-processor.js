import fs from 'fs';
import { createBaseItem } from './data-processor.js';

const NAME_LOCALIZED_REGEX = /^name(?::([a-z]{2,3}(?:-[a-zA-Z]{4,})?(?:-[a-zA-Z]{4,})?))$/;

const BELGIUM_REGION_LANGUAGES = {
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
const UNDELIMITED_NAME_LANGUAGES = {
    DZ: ['fr', 'ber', 'ar'],
    HK: ['zh', 'en'],
    MA: ['fr', 'zgh', 'ar'],
    NZ: ['mi', 'en'],
};

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

        const nameTags = new Map();
        const primaryName = tags['name'];
        let hasPrimaryNameMatch = false;

        for (const key in tags) {
            if (key.startsWith('name:')) {
                if (NAME_LOCALIZED_REGEX.test(key)) {
                    const tagValue = tags[key];
                    nameTags.set(key, tagValue);
                    if (primaryName && tagValue === primaryName) {
                        hasPrimaryNameMatch = true;
                    }
                }
            }
        }

        if (nameTags.size === 0) continue;

        totalCount++;

        // Condition 1: There is no 'name' tag
        // Condition 2: There are localised names (name:*) and none of them match the primary name
        let isInvalid = !primaryName || !hasPrimaryNameMatch;

        if (isInvalid) {
            const validPairs = BELGIUM_REGION_LANGUAGES[countryCode] || [];

            // Check if primaryName matches any allowed joined pair for the region
            const isValidCombo = validPairs.some(([langA, langB]) => {
                const valA = nameTags.get(`name:${langA}`);
                const valB = nameTags.get(`name:${langB}`);
                return valA && valB && primaryName === `${valA} - ${valB}`;
            });

            if (isValidCombo) isInvalid = false;

            const noDelimiter = UNDELIMITED_NAME_LANGUAGES[countryCode.split('-')[0]];
            if (primaryName && noDelimiter) {
                // in some regions, multilingual names are written with no delimiter

                // check if deleting every name:* tag will leave us with an empty
                // name=* tag. If yes, the name is considered valid in these regions.
                let remaining = primaryName;
                for (const lang of noDelimiter) {
                    const localizedName = nameTags.get(`name:${lang}`);
                    if (localizedName) {
                        remaining = remaining.replace(localizedName, '');
                    }
                }
                if (!remaining.trim()) isInvalid = false;
            }
        }

        if (!primaryName) missingNamesCount++;

        if (isInvalid) {
            incompleteNames++;
            const item = {
                ...createBaseItem(element),
                nameTags,
            };

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
