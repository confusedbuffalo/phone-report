import { iso31662 } from 'iso-3166';
import opening_hours from 'opening_hours';
import { diffChars } from 'diff';

const iso31662Map = new Map(iso31662.map(item => [item.code, item]));

/**
 * Creates a nominatim object suitable for the opening_hours library from the given code
 * @param {string} countryStateCode - The country (and optionally with state) code for the location of the object in ISO 3166-1 or ISO 3166-2 format.
 * @returns {object}
 */
export function getNominatimObject(countryStateCode) {
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
export function standardiseOpeningHours(str) {
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
