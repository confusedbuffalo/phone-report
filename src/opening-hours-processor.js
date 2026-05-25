import fs from 'fs';
import { createBaseItem } from './data-processor.js';
import { ALL_HOURS_TAGS } from './constants.js';
import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';

const cache = new LRUCache({
    max: 10000,
});

function replaceValidSpacing(str) {
    return (
        str
            // e.g. Su, Mo
            .replace(/\s*([,;])\s*/g, '$1')
            // e.g. Mo - Th
            .replace(/\s*(-)\s*/g, '$1')
            // e.g. Su [1]
            .replace(/((?<=\w)\s+(?=\[))/g, '')
            // e.g. [1] 10:00
            .replace(/((?<=\])\s+(?=\d))/g, '')
            // e.g. Fr10:00
            .replace(/((?<=\w)\s+(?=\d))/g, '')
            // e.g. Sep:Sa
            .replace(/(?<=\w)\s*(:)\s*(?=\w)/g, '$1')
            // consecutive spaces
            .replace(/\s+/g, ' ')
            // title case
            .replaceAll('Off', 'off')
            .replaceAll('Closed', 'closed')
            .replaceAll('Easter', 'easter')
    );
}

/**
 * Validates a single opening hours tag value.
 * @param {string} hoursTagValue - The tag value for the opening hours string.
 * @param {string} tag - The tag in which the opening hours string is defined (such as 'opening_hours' or 'service_times').
 * @param {string} locale - The locale for warnings.
 * @returns {{
 * isInvalid: boolean,
 * isAutoFixable: boolean,
 * prettyValue: string,
 * warnings: Array<string>,
 * disconnected: boolean
 * }} An object containing the validation result.
 */
export function validateHoursTag(hoursTagValue, tag, locale) {
    const cacheKey = `${hoursTagValue}|${tag}|${locale}`;
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
    };

    try {
        const oh = new opening_hours(hoursTagValue, null, { tag_key: tag, locale: locale });

        const prettyValue = oh.prettifyValue();
        const warnings = oh.getWarnings().length ? oh.getWarnings() : null;
        let valuesMatch = true;

        if (prettyValue !== hoursTagValue && replaceValidSpacing(prettyValue) !== replaceValidSpacing(hoursTagValue)) {
            valuesMatch = false;
            tagValidationResult.isInvalid = true;
            tagValidationResult.isAutoFixable = true;
            tagValidationResult.prettyValue = prettyValue;
            tagValidationResult.warnings = warnings;
        }

        if (warnings) {
            const enOh = new opening_hours(hoursTagValue, null, { tag_key: tag, locale: 'en' });
            // Warning for when disconnected ranges are used in one rule, e.g. 'Mo-Fr 09:00-17:00 Sa 09:00-12:00'
            if (enOh.getWarnings().join(',').includes('not connected')) {
                tagValidationResult.isInvalid = true;
                tagValidationResult.isAutoFixable = false;
                tagValidationResult.prettyValue = valuesMatch ? null : prettyValue;
                tagValidationResult.warnings = warnings;
                tagValidationResult.disconnected = true;
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
 * @param {string} locale - The locale for warnings.
 * @param {string} tmpFilePath - The temporary file path to store the invalid items.
 * @returns {{
 * totalCount: number,
 * invalidCount: number,
 * autoFixableCount: number
 * }} An object containing the breakdown of record counts.
 */
export async function validateOpeningHours(elementStream, locale, tmpFilePath) {
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
                invalidHours: new Map(),
                suggestedFixes: new Map(),
                warnings: new Map(),
                disconnected: new Map(),
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

            // opening_hours uses just the first language part
            locale = locale.split('-')[0];
            const validationResult = validateHoursTag(hoursValue, tag, locale);

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
            }
        }

        if (item) {
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

    return { totalCount, invalidCount, autoFixableCount };
}
