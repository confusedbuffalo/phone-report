import fs from 'fs';
import { createBaseItem } from './data-processor.js';
import { ALL_HOURS_TAGS } from './constants.js';
import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import { diffChars } from 'diff';

const cache = new LRUCache({
    max: 10000,
});

/**
 * Standardises all valid spacing and acceptable capitalisation differences in an opening hours tag
 * @param {string} str - The tag value for the opening hours string.
 * @returns {string}
 */
function standardiseOpeningHours(str) {
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
            // fallback separator
            .replace(/\s*(||)\s*/g, '$1')
            // single digit month days or week numbers (unlikely to be ambiguous)
            .replace(/(?<=(?:(?<!\w)\w{3}|[Ww]eek))0(\d)(?!:)/g, '$1')
            // title case
            .replaceAll('Off', 'off')
            .replaceAll('Closed', 'closed')
            .replaceAll('Easter', 'easter')
    );
}

/**
 * Determine if a single-digit hour in an opening hours string is ambiguous
 * @param {string} originalHours - The original tag value for the opening hours string.
 * @param {string} newHours - The prettified tag value for the opening hours string.
 * @param {string} tag - The tag in which the opening hours string is defined (such as 'opening_hours' or 'service_times').
 * @param {string} locale - The locale for warnings.
 * @returns {boolean}
 */
export function isAmbiguousHours(originalHours, newHours, tag, locale) {
    if (!originalHours || !newHours) return false;

    let isAmbiguous = false;

    try {
        const originalOh = new opening_hours(originalHours, null, { tag_key: tag, locale: locale });
        const newOh = new opening_hours(newHours, null, { tag_key: tag, locale: locale });

        if (!originalOh.isEqualTo(newOh)[0]) {
            console.error(`Comparing two non-equal opening hours:\nOld: ${originalHours}\nNew: ${newHours}`);
            return false;
        }

        const hoursDiff = diffChars(originalHours, newHours);

        const numParts = hoursDiff.length;
        for (let i = 0; i < numParts - 1; i++) {
            const thisPart = hoursDiff[i];
            const remainingNewValue = hoursDiff
                .slice(i + 1, numParts)
                .map(part => {
                    const isNew = part.added || (!part.added && !part.removed);
                    return isNew ? part.value.toLowerCase() : '';
                })
                .join('');
            const remainingOldValue = hoursDiff
                .slice(i + 1, numParts)
                .map(part => {
                    const isOld = part.removed || (!part.added && !part.removed);
                    return isOld ? part.value.toLowerCase() : '';
                })
                .join('');
            if (
                thisPart.value.trim() === '0' &&
                remainingNewValue.match(/^\d:.*$/) &&
                !remainingOldValue.match(/^\d([.:]\d{1,2})?\s?[ap]\.?m\.?.*$/)
            ) {
                isAmbiguous = true;
            }
        }

        return isAmbiguous;
    } catch {
        return false;
    }
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
 * disconnected: boolean,
 * isAmbiguous: boolean,
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
        isAmbiguous: false,
    };

    try {
        const oh = new opening_hours(hoursTagValue, null, { tag_key: tag, locale: locale });

        const prettyValue = oh.prettifyValue();
        const warnings = oh.getWarnings().length ? oh.getWarnings() : null;
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
            tagValidationResult.isAmbiguous = isAmbiguousHours(hoursTagValue, prettyValue, tag, locale);
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
                ambiguous: new Map(),
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
                currentItem.ambiguous.set(tag, validationResult.isAmbiguous);
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
