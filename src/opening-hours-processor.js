import fs from 'fs';
import { createBaseItem, mapReplacer } from './data-processor.js';
import { ALL_HOURS_TAGS } from './constants.js';
import opening_hours from 'opening_hours';
import { LRUCache } from 'lru-cache';
import { diffChars } from 'diff';
import { iso31662 } from 'iso-3166';

const cache = new LRUCache({
    max: 10000,
});

const iso31662Map = new Map(iso31662.map(item => [item.code, item]));

/**
 * Creates a nominatim object suitable for the opening_hours library from the given code
 * @param {string} countryStateCode - The country (and optionally with state) code for the location of the object in ISO 3166-1 or ISO 3166-2 format.
 * @returns {object}
 */
function getNominatimObject(countryStateCode) {
    if (!countryStateCode) return null;

    const result = iso31662Map.get(countryStateCode.toUpperCase());
    const countryCode = result ? result.parent.toLowerCase() : countryStateCode.split('-')[0].toLowerCase();
    const state = result?.name ?? null;

    return { address: { country_code: countryCode, state } };
}

/**
 * Creates an opening hours object, falling back to a default location if the tag value has holidays that are not defined in the given country
 * @param {string} hoursTagValue - The tag value for the opening hours string.
 * @param {string} tag - The tag in which the opening hours string is defined (such as 'opening_hours' or 'service_times').
 * @param {string} countryStateCode - The country (and optionally with state) code for the location of the object in ISO 3166-1 or ISO 3166-2 format.
 * @returns {opening_hours}
 */
export function createOpeningHours(hoursTagValue, tag, countryStateCode) {
    const nominatimObject = getNominatimObject(countryStateCode);
    const originalConsoleError = console.error;

    try {
        // Temporarily silence console.error during instantiation
        console.error = () => {};
        const oh = new opening_hours(hoursTagValue, nominatimObject, { tag_key: tag });
        console.error = originalConsoleError;
        return oh;
    } catch (error) {
        console.error = originalConsoleError;
        if (
            countryStateCode &&
            String(error?.message || error)
                .toLowerCase()
                .includes('there are no holidays')
        ) {
            return createOpeningHours(hoursTagValue, tag, null);
        }
        throw error;
    }
}

const stdSemicolonCommaRegex = /\s*([,;])\s*/g;
const stdHyphenRegex = /\s*(-)\s*/g;
const stdWordBracketRegex = /((?<=\w)\s+(?=\[))/g;
const stdBracketDigitRegex = /((?<=\])\s+(?=\d))/g;
const stdWordDigitRegex = /((?<=\w)\s+(?=\d))/g;
const stdWordColonWordRegex = /(?<=\w)\s*(:)\s*(?=\w)/g;
const stdSpacesRegex = /\s+/g;
const stdFallbackSeparatorRegex = /\s*(\|\|)\s*/g;
const stdZeroPaddingRegex = /(?<=(?:(?<!\w)\w{3}|[Ww]eek))0(\d)(?!:)/g;
const stdOffRegex = /Off/g;
const stdClosedRegex = /Closed/g;
const stdEasterRegex = /Easter/g;

/**
 * Standardises all valid spacing and acceptable capitalisation differences in an opening hours tag
 * @param {string} str - The tag value for the opening hours string.
 * @returns {string}
 */
function standardiseOpeningHours(str) {
    return (
        str
            // e.g. Su, Mo
            .replace(stdSemicolonCommaRegex, '$1')
            // e.g. Mo - Th
            .replace(stdHyphenRegex, '$1')
            // e.g. Su [1]
            .replace(stdWordBracketRegex, '')
            // e.g. [1] 10:00
            .replace(stdBracketDigitRegex, '')
            // e.g. Fr10:00
            .replace(stdWordDigitRegex, '')
            // e.g. Sep:Sa
            .replace(stdWordColonWordRegex, '$1')
            // consecutive spaces
            .replace(stdSpacesRegex, ' ')
            // fallback separator
            .replace(stdFallbackSeparatorRegex, '$1')
            // single digit month days or week numbers (unlikely to be ambiguous)
            .replace(stdZeroPaddingRegex, '$1')
            // title case
            .replace(stdOffRegex, 'off')
            .replace(stdClosedRegex, 'closed')
            .replace(stdEasterRegex, 'easter')
    );
}

const hasDaysRegex = /Mo|Tu|We|Th|Fr|Sa|Su/;
const hasDateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s?\d{1,2}(?!\d|:)/;

export function hasDaysSpecified(str) {
    if (str === '24/7') return true;
    if (str.toLowerCase() === 'closed') return true;
    const ruleRemovedStr = str.toLowerCase().replace('closed', '').replace('24/7', '').trim();
    if (ruleRemovedStr.at(0) === '"' && ruleRemovedStr.at(-1) === '"') return true;
    if (hasDateRegex.test(str)) return true;
    return hasDaysRegex.test(str);
}

const amPmRegex = /^\d([.:]\d{1,2})?\s?[ap]\.?m\.?.*$/i;
const hourPattern1 = /^\d:\d/;
const hourPattern2 = /0$/;
const hourPattern3 = /^:\d/;
const thisHourMatchRegex = /^(\d):\d\d/;
const endHourMatchRegex = /^\d:\d\d-(\d\d):\d\d/;

/**
 * Determine if a single-digit hour in an opening hours string is ambiguous
 * @param {string} originalHours - The original tag value for the opening hours string.
 * @param {string} newHours - The prettified tag value for the opening hours string.
 * @param {string} tag - The tag in which the opening hours string is defined (such as 'opening_hours' or 'service_times').
 * @param {string} countryCode - The two-letter country code for the location of the object.
 * @param {opening_hours} [originalOh] - Pre-instantiated opening_hours object.
 * @returns {boolean}
 */
export function isAmbiguousHours(originalHours, newHours, tag, countryCode, originalOh) {
    if (!originalHours || !newHours) return false;

    if (!originalOh) {
        // keep the tests happy
        originalOh = createOpeningHours(originalHours, tag, countryCode);
    }

    let isAmbiguous = originalOh
        .getStructuredWarnings()
        .some(warning => warning.type === 'ambiguous_single_digit_hour');

    if (isAmbiguous) return true;

    try {
        const oh1 = originalOh || createOpeningHours(originalHours, tag, countryCode);
        const oh2 = createOpeningHours(newHours, tag, countryCode);

        if (!oh1.isEqualTo(oh2)[0]) {
            console.error(`Comparing two non-equal opening hours:\nOld: ${originalHours}\nNew: ${newHours}`);
            return false;
        }

        const hoursDiff = diffChars(originalHours, newHours);

        let newValueSoFar = '';
        let oldValueSoFar = '';

        const numParts = hoursDiff.length;

        let fullNewValue = '';
        let fullOldValue = '';
        for (let i = 0; i < numParts; i++) {
            const part = hoursDiff[i];
            const val = part.value.toLowerCase();
            if (!part.removed) fullNewValue += val;
            if (!part.added) fullOldValue += val;
        }

        for (let i = 0; i < numParts; i++) {
            const thisPart = hoursDiff[i];
            const partValue = thisPart.value;

            if (thisPart.added) {
                if (partValue.trim() === '0') {
                    const newValueRemaining = fullNewValue.slice(newValueSoFar.length + partValue.length);
                    const oldValueRemaining = fullOldValue.slice(oldValueSoFar.length);

                    const isHour =
                        hourPattern1.test(newValueRemaining) ||
                        (hourPattern2.test(newValueSoFar) && hourPattern3.test(newValueRemaining));

                    const isAmPm = amPmRegex.test(oldValueRemaining);

                    const thisHourMatch = newValueRemaining.match(thisHourMatchRegex);
                    const thisHourAmbiguous = thisHourMatch && [0, 1, 2].includes(Number(thisHourMatch[1]));

                    const endHourMatch = newValueRemaining.match(endHourMatchRegex);
                    const is24Hour = endHourMatch && Number(endHourMatch[1]) < 12;

                    if (isHour && !isAmPm && (is24Hour || !endHourMatch || thisHourAmbiguous)) {
                        isAmbiguous = true;
                        break;
                    }
                }
                newValueSoFar += partValue.toLowerCase();
            } else if (thisPart.removed) {
                oldValueSoFar += partValue.toLowerCase();
            } else {
                newValueSoFar += partValue.toLowerCase();
                oldValueSoFar += partValue.toLowerCase();
            }
        }

        if (isAmbiguous) {
            console.log(`Considering "${originalHours}" as ambiguous, but library does not`);
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
