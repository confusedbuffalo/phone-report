import fs from 'fs';
import { createBaseItem, mapReplacer } from './data-processor.js';
import { ALL_HOURS_TAGS } from './constants.js';
import { LRUCache } from 'lru-cache';
import {
    createOpeningHours,
    getNominatimObject,
    hasDaysSpecified,
    isAmbiguousHours,
    standardiseOpeningHours,
} from './opening-hours-utils.js';

const cache = new LRUCache({
    max: 10000,
});

/**
 * Validates a single opening hours tag value.
 * @param {string} hoursTagValue - The tag value for the opening hours string.
 * @param {string} tag - The tag in which the opening hours string is defined (such as 'opening_hours' or 'service_times').
 * @param {string} countryCode - The two-letter country code for the location of the object.
 * @returns {{
 * isInvalid: boolean,
 * isAutoFixable: boolean,
 * prettyValue: string,
 * warnings: Array<string>,
 * disconnected: boolean,
 * isAmbiguous: boolean,
 * }} An object containing the validation result.
 */
export function validateHoursTag(hoursTagValue, tag, countryCode) {
    const cacheKey = `${hoursTagValue}|${tag}|${countryCode}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        return structuredClone(cachedResult);
    }

    const tagValidationResult = {
        isInvalid: false,
        isAutoFixable: true,
        prettyValue: null,
        warnings: null,
        disconnected: false,
        isAmbiguous: false,
        noDays: false,
    };

    if (tag === 'happy_hours' && ['yes', 'no'].includes(hoursTagValue.trim())) return tagValidationResult;
    if (tag === 'service_times' && ['none', 'no'].includes(hoursTagValue.trim())) return tagValidationResult;

    if (['service_times', 'opening_hours'].includes(tag) && hoursTagValue.trim() === 'no') {
        tagValidationResult.isInvalid = true;
        tagValidationResult.isAutoFixable = false;
        return tagValidationResult;
    }

    try {
        const oh = createOpeningHours(hoursTagValue, tag, countryCode);

        const prettyValue = oh.prettifyValue();
        const warnings = oh.getStructuredWarnings().length ? oh.getStructuredWarnings() : null;
        let valuesMatch = true;

        if (
            prettyValue !== hoursTagValue &&
            standardiseOpeningHours(prettyValue) !== standardiseOpeningHours(hoursTagValue)
        ) {
            valuesMatch = false;
            tagValidationResult.isInvalid = true;
            tagValidationResult.isAutoFixable = true;
            tagValidationResult.prettyValue = prettyValue;
            tagValidationResult.warnings = warnings;
        }

        if (tagValidationResult.isInvalid && tagValidationResult.isAutoFixable) {
            tagValidationResult.isAmbiguous = isAmbiguousHours(hoursTagValue, prettyValue, tag, countryCode, oh);
            if (tagValidationResult.isAmbiguous) {
                // stop incorrect fixes being easily applied on the website
                tagValidationResult.isAutoFixable = false;
            }
        }

        if (tag === 'service_times' && !hasDaysSpecified(prettyValue)) {
            tagValidationResult.isInvalid = true;
            tagValidationResult.isAutoFixable = false;
            tagValidationResult.noDays = true;
            if (!valuesMatch) {
                tagValidationResult.prettyValue = prettyValue;
            }
        }

        if (tagValidationResult.isInvalid && tagValidationResult.isAutoFixable && prettyValue.length > 255) {
            tagValidationResult.isAutoFixable = false;
        }

        if (warnings) {
            const warningMessages = oh.getStructuredWarnings().map(warning => warning.message);

            // Warning for when disconnected ranges are used in one rule, e.g. 'Mo-Fr 09:00-17:00 Sa 09:00-12:00'
            if (oh.getStructuredWarnings().some(warning => warning.type === 'use_multi')) {
                tagValidationResult.isInvalid = true;
                tagValidationResult.isAutoFixable = false;
                tagValidationResult.prettyValue = valuesMatch ? null : prettyValue;
                tagValidationResult.warnings = warnings;
                tagValidationResult.disconnected = true;
            }
            // Assumptions are often questionable, such as "M" = "Mo"
            // structured warning here is just 'word_error_correction' which is also used for other probably valid changes
            if (warningMessages.join(',').toLowerCase().includes('assuming')) {
                tagValidationResult.isInvalid = true;
                tagValidationResult.isAutoFixable = false;
                tagValidationResult.prettyValue = valuesMatch ? null : prettyValue;
                tagValidationResult.warnings = warnings;
            }
        }
    } catch (error) {
        // Totally invalid in some way
        tagValidationResult.isInvalid = true;
        tagValidationResult.isAutoFixable = false;
        tagValidationResult.warnings = [error];
    }

    cache.set(cacheKey, tagValidationResult);
    return structuredClone(tagValidationResult);
}

/**
 * Validates opening hours.
 * @param {Array<Object>} elementStream - OSM elements with opening hours tags.
 * @param {string} countryCode - The country code for the location of the object.
 * @param {string} tmpFilePath - The temporary file path to store the invalid items.
 * @returns {{
 * totalCount: number,
 * invalidCount: number,
 * autoFixableCount: number
 * }} An object containing the breakdown of record counts.
 */
export async function validateOpeningHours(elementStream, countryCode, tmpFilePath) {
    const fileStream = fs.createWriteStream(tmpFilePath);
    fileStream.write('[\n');
    let isFirstItem = true;

    let totalCount = 0;
    let invalidCount = 0;
    let autoFixableCount = 0;

    for await (const element of elementStream) {
        if (!element.properties) continue;

        const tags = element.properties;

        let item = null;

        const createItem = () => {
            return {
                ...createBaseItem(element),
                nominatimObject: getNominatimObject(countryCode),
                invalidHours: new Map(),
                suggestedFixes: new Map(),
                warnings: new Map(),
                disconnected: new Map(),
                ambiguous: new Map(),
                noDays: new Map(),
            };
        };

        const getOrCreateItem = autoFixable => {
            if (item) return item;

            const baseItem = createItem();
            item = { ...baseItem, autoFixable };
            return item;
        };

        for (const tag of ALL_HOURS_TAGS) {
            if (!tags[tag]) continue;

            totalCount++;

            const hoursValue = tags[tag];

            const validationResult = validateHoursTag(hoursValue, tag, countryCode);

            const isInvalid = validationResult.isInvalid;
            const isAutoFixable = validationResult.isAutoFixable;

            if (isInvalid) {
                const currentItem = getOrCreateItem(isAutoFixable);

                autoFixableCount += isAutoFixable;
                invalidCount += isInvalid;

                currentItem.isInvalid = currentItem.isInvalid || isInvalid;
                currentItem.autoFixable = currentItem.autoFixable && isAutoFixable;

                currentItem.invalidHours.set(tag, hoursValue);
                currentItem.suggestedFixes.set(tag, validationResult.prettyValue);
                currentItem.warnings.set(tag, validationResult.warnings);
                currentItem.disconnected.set(tag, validationResult.disconnected);
                currentItem.ambiguous.set(tag, validationResult.isAmbiguous);
                currentItem.noDays.set(tag, validationResult.noDays);
            }
        }

        if (item) {
            if (!isFirstItem) {
                fileStream.write(',\n');
            }

            // Convert Maps and nested Maps
            fileStream.write(JSON.stringify(item, mapReplacer));
            isFirstItem = false;
        }
    }

    fileStream.write('\n]');
    fileStream.end();

    await new Promise(resolve => fileStream.on('finish', resolve));

    return { totalCount, invalidCount, autoFixableCount };
}
