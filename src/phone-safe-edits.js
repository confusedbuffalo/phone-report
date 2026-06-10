import { parsePhoneNumber } from 'libphonenumber-js/max';
import { DIN_FORMAT_COUNTRIES, INVISIBLE_CHARACTERS, NANP_COUNTRY_CODES } from './constants';
import { processSingleNumber } from './phone-processor';
import { getNonStandardCostTypes } from './phone-utils';

/**
 * Checks if a change is only to the formatting or adding a country code and
 * so can be safely made automatically.
 * @param {string} originalNumberStr - The original OSM tag
 * @param {string} newNumberStr - The suggested fix
 * @param {string} countryCode - The country code.
 * @returns {boolean}
 */
export function isSafeEdit(originalNumberStr, newNumberStr, countryCode) {
    if (!originalNumberStr || !newNumberStr) return false;

    // Digits, spaces, plus, dash and hyphens and invisible spacing characters
    // AT and DE: no dashes or hyphens (due to extensions), but include slash (used as grouping separator)
    const SAFE_CHARACTER_REGEX = DIN_FORMAT_COUNTRIES.includes(countryCode)
        ? new RegExp(`^[\\d\\s\\(\\)+\\./${INVISIBLE_CHARACTERS}]+$`)
        : new RegExp(`^[\\d\\s\\(\\)+\\.\\-−‐‑‒–—ー${INVISIBLE_CHARACTERS}]+$`);

    if (!SAFE_CHARACTER_REGEX.test(originalNumberStr)) return false;

    const processedOriginal = processSingleNumber(originalNumberStr, countryCode);

    // Double check that the original number parses to the new number
    if (!processedOriginal.autoFixable || processedOriginal.suggestedFix !== newNumberStr) return false;

    // Confirm that the number is in the same country
    try {
        const parsedNew = parsePhoneNumber(newNumberStr, countryCode);
        if (parsedNew.country === countryCode && parsedNew.isValid()) {
            return true;
        }
        if (
            // Toll free numbers in all of NANP are parsed as US
            // It is not possible to tell the country from the phone number in this case
            NANP_COUNTRY_CODES.includes(countryCode) &&
            parsedNew.isValid() &&
            getNonStandardCostTypes(countryCode).includes(parsedNew.getType()) &&
            parsedNew.country === 'US'
        ) {
            return true;
        }
    } catch {
        // Parsing failed due to an exception
    }

    return false;
}

/**
 * Checks all of the edits and determines if all edits are safe to be
 * made automatically.
 * @param {object} item - The item object containing the Maps.
 * @param {string} countryCode - The country code for validation.
 * @returns {boolean}
 */
export function isSafeItemEdit(item, countryCode) {
    const hasMismatches = item.mismatchTypeNumbers instanceof Map && item.mismatchTypeNumbers.size !== 0;
    const hasDuplicates = item.duplicateNumbers instanceof Map && item.duplicateNumbers.size !== 0;

    // Not safe if there are any mismatch type numbers or duplicate numbers
    if (!item.autoFixable || item.hasTypeMismatch || hasMismatches || hasDuplicates) {
        return false;
    }

    // If sizes are different, there are unpaired items.
    if (item.invalidNumbers.size !== item.suggestedFixes.size) {
        return false;
    }

    // Ensure every invalid number has a corresponding suggested fix and that the edit is safe
    return Array.from(item.invalidNumbers.entries()).every(([key, invalidValue]) => {
        const suggestedValue = item.suggestedFixes.get(key);
        return suggestedValue !== undefined && isSafeEdit(invalidValue, suggestedValue, countryCode);
    });
}
