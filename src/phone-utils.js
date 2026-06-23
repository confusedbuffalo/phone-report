import { parsePhoneNumber } from 'libphonenumber-js/max';
import {
    ACCEPTABLE_EXTENSION_FORMATS,
    COUNTRIES_WITH_INCORRECT_HYPHENS_IN_NATIONAL,
    DIN_EXTENSION_REGEX,
    DIN_FORMAT_COUNTRIES,
    EXCLUSIONS,
    EXTENSION_REGEX,
    FORCE_TOLL_FREE_AS_NATIONAL_COUNTRIES,
    NANP_COUNTRY_CODES,
    NON_STANDARD_COST_TYPES,
    PHONE_TAG_PREFERENCE_ORDER,
    TOLL_FREE_AS_INTERNATIONAL_COUNTRIES,
} from './constants.js';
import { processSingleNumber } from './phone-processor.js';

export const MobileStatus = {
    MOBILE: 'mobile',
    NOT_MOBILE: 'not mobile',
    UNKNOWN: 'unknown',
};

/**
 * Gets the array of non-standard cost types to be considered as used
 * for national formatting for the given country.
 * @param {string} countryCode
 * @returns {string[]}
 */
export function getNonStandardCostTypes(countryCode) {
    return countryCode === 'TR' ? [...NON_STANDARD_COST_TYPES, 'UAN'] : NON_STANDARD_COST_TYPES;
}

/**
 * Checks if a phone number is a mobile number
 * @param {PhoneNumber} phoneNumber The libphonenumber-js PhoneNumber object.
 * @returns {string} One of the values from MobileStatus.
 */
export function checkMobileStatus(phoneNumber) {
    const numberType = phoneNumber ? phoneNumber.getType() : null;

    if (numberType === 'MOBILE') {
        return MobileStatus.MOBILE;
    } else if (!numberType || numberType === 'FIXED_LINE_OR_MOBILE') {
        return MobileStatus.UNKNOWN;
    }
    return MobileStatus.NOT_MOBILE;
}

/**
 * Determines the OSM phone tag to use for an element.
 * * 'phone' is used if both are present, or if only 'phone' is present.
 * * It only returns 'contact:phone' if only that tag is present.
 * * 'phone' is the fallback if neither is present.
 * @param {Object} tags The tags of the the OSM element
 * @returns {('phone'|'contact:phone')}
 */
export function phoneTagToUse(tags) {
    if ('phone' in tags) {
        return 'phone';
    }
    if ('contact:phone' in tags) {
        return 'contact:phone';
    }
    return 'phone';
}

/**
 * Determines which of the two given OSM keys should be removed based on a predefined
 * preference order. The key with the lower preference (higher score) is returned
 * for removal.
 *
 * @param {string} key1 The first OSM key (e.g., 'phone', 'mobile').
 * @param {string} key2 The second OSM key.
 * @returns {string} The key that should be removed.
 */
export function keyToRemove(key1, key2) {
    // Look up the score. If a key is unknown, it's given a very low preference
    // (Infinity), prioritizing its removal.
    const score1 = PHONE_TAG_PREFERENCE_ORDER[key1] ?? Infinity;
    const score2 = PHONE_TAG_PREFERENCE_ORDER[key2] ?? Infinity;

    // The key to REMOVE is the one with the higher score (lower preference).

    if (score1 > score2) {
        return key1;
    }
    if (score2 > score1) {
        return key2;
    }
    // If scores are equal (e.g., both keys are 'phone', or both are unrecognized),
    // we must choose one deterministically. We'll default to removing key2.
    return key2;
}

const SPACING_REGEX_NANP = /[\s-]/g;
const SPACING_REGEX_DEFAULT = /\s/g;

/**
 * Gets the relevant regex for valid spacing in the given country code.
 * @param {string} countryCode - The country code.
 * @returns {RegExp} The regular expression to use for spacing validation.
 */
export function getSpacingRegex(countryCode) {
    return [...NANP_COUNTRY_CODES, 'ID'].includes(countryCode) ? SPACING_REGEX_NANP : SPACING_REGEX_DEFAULT;
}

/**
 * Converts a phoneword string into a numeric string.
 * @param {string} phoneword - The input string (e.g., "1-800-FLOWERS")
 * @returns {string} - The converted numeric string (e.g., "1-800-3569377")
 */
export function convertPhonewordToDigits(phoneword) {
    // prettier-ignore
    const mapping = {
        'A': '2', 'B': '2', 'C': '2',
        'D': '3', 'E': '3', 'F': '3',
        'G': '4', 'H': '4', 'I': '4',
        'J': '5', 'K': '5', 'L': '5',
        'M': '6', 'N': '6', 'O': '6',
        'P': '7', 'Q': '7', 'R': '7', 'S': '7',
        'T': '8', 'U': '8', 'V': '8',
        'W': '9', 'X': '9', 'Y': '9', 'Z': '9',
    };

    return phoneword.toUpperCase().replace(/[A-Z]/g, char => {
        return mapping[char] || char;
    });
}

/**
 * Fix a Polish number incorrectly prefixed with a 0
 * @param {PhoneNumber} phoneNumber - The phone number object
 * @param {string} countryCode - The country code being checked against
 * @returns {PhoneNumber}
 */
export function fixPolishPrefixedNumber(phoneNumber, countryCode) {
    if (
        countryCode !== 'PL' ||
        !phoneNumber ||
        phoneNumber.isValid() ||
        !phoneNumber.isPossible() ||
        !phoneNumber.nationalNumber.startsWith('0')
    ) {
        return phoneNumber;
    }
    const prefixRemovedNumber = parsePhoneNumber(phoneNumber.nationalNumber.slice(1), countryCode);
    if (phoneNumber.ext) prefixRemovedNumber.setExt(phoneNumber.ext);
    return prefixRemovedNumber.isValid() ? prefixRemovedNumber : phoneNumber;
}

/**
 * Determines if a phone number is a Polish number incorrectly prefixed with a 0
 * @param {PhoneNumber} phoneNumber - The phone number object
 * @param {string} countryCode - The country code being checked against
 * @returns {boolean}
 */
export function isPolishPrefixedNumber(phoneNumber, countryCode) {
    // See https://github.com/confusedbuffalo/phone-report/issues/15
    return phoneNumber.number !== fixPolishPrefixedNumber(phoneNumber, countryCode).number;
}

export function insertMissingItalianZero(numberStr) {
    const missingZeroRegex = /^(\+39)(\s*[1-9].*)$/;
    if (!numberStr.match(missingZeroRegex)) return numberStr;

    const newNumberStr = numberStr.replace(missingZeroRegex, '$10$2');

    try {
        let phoneNumber = parsePhoneNumber(newNumberStr);
        if (phoneNumber.isValid()) {
            return newNumberStr;
        }
    } catch {
        return numberStr;
    }
    return numberStr;
}

export function isItalianMissingZeroNumber(phoneNumber, countryCode) {
    if (countryCode !== 'IT' || phoneNumber.isValid()) return false;
    return phoneNumber.number !== insertMissingItalianZero(phoneNumber.number);
}

/**
 * Checks if a given URL host is an exact match or a subdomain of one of the valid hosts.
 * @param {string} urlString The URL string to check.
 * @returns {boolean} True if the host is valid.
 */
export const isWhatsappUrl = urlString => {
    const validWhatsappHosts = ['wa.me', 'whatsapp.com'];

    const fullUrlString = !urlString.includes(':') ? `https://${urlString}` : urlString;

    try {
        const url = new URL(fullUrlString);

        if (url.protocol === 'whatsapp:') {
            return true;
        }

        const host = url.hostname;

        return validWhatsappHosts.some(validHost => {
            if (host === validHost) {
                return true;
            }
            if (host.endsWith(`.${validHost}`)) {
                return true;
            }
            return false;
        });
    } catch {
        return false;
    }
};

/**
 * Extracts a phone number from a string that may be a URL and determines if it is a valid non-number
 * (such as a channel or catalog link).
 * * @param {string} numberStr - The input string containing a phone number or WhatsApp URL.
 * @returns {{cleanNumberStr: string, validNonNumber: boolean}} An object containing the extracted number and validity status.
 */
export function getWhatsappNumber(numberStr) {
    let isValidWhatsappUrl = false;
    let cleanNumberStr = numberStr;

    const parsedUrl = URL.parse(numberStr);
    if (parsedUrl) {
        isValidWhatsappUrl = isWhatsappUrl(numberStr);
        const pathname = parsedUrl.pathname;

        if (!isValidWhatsappUrl) {
            return {
                cleanNumberStr: cleanNumberStr,
                validNonNumber: isValidWhatsappUrl,
            };
        }
        if (parsedUrl.searchParams?.get('phone')) {
            cleanNumberStr = parsedUrl.searchParams.get('phone');
            if (cleanNumberStr.startsWith(' ')) {
                cleanNumberStr = '+' + cleanNumberStr.trimStart();
            }
            isValidWhatsappUrl = false;
        } else if (
            parsedUrl.hostname.endsWith('wa.me') &&
            !pathname.startsWith('/qr') &&
            !pathname.startsWith('/message') &&
            !pathname.startsWith('/c')
        ) {
            cleanNumberStr = pathname.startsWith('/') ? '+' + pathname.slice(1) : '+' + pathname;
            isValidWhatsappUrl = false;
        }
    }
    return {
        cleanNumberStr: cleanNumberStr,
        validNonNumber: isValidWhatsappUrl,
    };
}

/**
 * Determines if a toll free or special cost number should be formatted in international format.
 * @param {PhoneNumber} phoneNumber - The parsed PhoneNumber object.
 * @param {string} countryCode - The country code used for validation.
 * @param {string} numberStr - The original phone number string.
 * @returns {boolean}
 */
export function shouldTollFreeBeInternational(phoneNumber, countryCode, numberStr) {
    // https://community.openstreetmap.org/t/proposed-automated-edit-korrektur-von-telefonnummern-in-deutschland-basierend-auf-phonenumbervalidator/142498/12
    if (countryCode === 'DE' && phoneNumber.getType() === 'SHARED_COST') return true;
    if (phoneNumber.country.toLowerCase() !== countryCode.toLowerCase()) return true;
    if (TOLL_FREE_AS_INTERNATIONAL_COUNTRIES.includes(countryCode)) return true;
    if (FORCE_TOLL_FREE_AS_NATIONAL_COUNTRIES.includes(countryCode)) return false;
    return numberStr.includes('+') || numberStr.startsWith('00');
}

const arBrFinalHyphenRegex = /^\+\d+-\d{4}$/;

/**
 * Determines if two phone numbers semantically match one another, regardless of spacing
 * @param {PhoneNumber} phoneNumber - The parsed PhoneNumber object.
 * @param {string} coreNumber - The core number, without extension.
 * @param {string|null} extension - The extension of the number.
 * @param {string} countryCode - The country code for validation.
 * @param {boolean} tollFreeAsInternational - Whether toll free numbers should be formatted in international format
 * @returns {boolean}
 */
export function numbersSemanticallyMatch(phoneNumber, coreNumber, extension, countryCode, tollFreeAsInternational) {
    const standardisedNumber = extension ? `${coreNumber} x${extension}` : coreNumber;

    const coreStandardised = parsePhoneNumber(coreNumber, countryCode)
        .format(tollFreeAsInternational ? 'INTERNATIONAL' : 'NATIONAL')
        .replace(/[^\d+]/g, '');
    const standardisedSuggestedFix = extension ? `${coreStandardised} x${extension}` : coreStandardised;

    const spacingRegex = getSpacingRegex(phoneNumber.country);

    const normalisedOriginal = standardisedNumber.replace(spacingRegex, '');
    const normalisedCoreParsed = phoneNumber.number.replace(spacingRegex, '');
    const normalisedParsed = extension ? `${normalisedCoreParsed}x${extension}` : normalisedCoreParsed;
    const normalisedTollFree = standardisedSuggestedFix.replace(spacingRegex, '');

    if (getNonStandardCostTypes(countryCode).includes(phoneNumber.getType())) {
        return normalisedOriginal === normalisedTollFree;
    }
    if (['AR', 'BR'].includes(countryCode) && arBrFinalHyphenRegex.test(normalisedOriginal)) {
        return true;
    }
    return normalisedOriginal === normalisedParsed;
}

/**
 * Checks if the forward slash character should be considered as a spacing character.
 * @param {string} tagValue - The phone number value string to validate.
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @param {string} tag - The OSM phone tag being used for this number
 * @returns {boolean} - Whether forward slash should be treated as a space character.
 */
export function isSlashSpace(tagValue, countryCode, osmTags, tag) {
    const validationResult = processSingleNumber(tagValue, countryCode, osmTags, tag);
    return !validationResult.isInvalid || validationResult.autoFixable;
}

/**
 * Expands a phone number string where a slash denotes an alternative suffix.
 * Example: "01234 567/568" -> ["01234 567", "01234 568"]
 * @param {string} tagValue - The phone number value string to validate.
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @param {string} tag - The OSM phone tag being used for this number
 * @returns {string[]|null} - Array of expanded numbers if valid or null if validation fails.
 */
export function expandSlashEnding(tagValue, countryCode, osmTags, tag) {
    const parts = tagValue.split('/').map(part => part.trim());

    // Only attempt two possible endings (original and alternative)
    if (parts.length !== 2) return null;
    // Could cause issues elsewhere, but BR has many long alternative endings (everything after area code)
    if (parts[1].length > 4 && countryCode !== 'BR') return null;

    const validationResult = processSingleNumber(parts[0], countryCode, osmTags, tag);

    if (validationResult.isInvalid && !validationResult.autoFixable) {
        return null;
    }

    const altNumber = parts[0].slice(0, -parts[1].length) + parts[1];

    const altValidationResult = processSingleNumber(altNumber, countryCode, osmTags, tag);

    if (!altValidationResult.isInvalid || altValidationResult.autoFixable) {
        return [parts[0], altNumber];
    }
    return null;
}

/**
 * Parses a phone number string to extract standard extension information.
 * This helper consolidates logic for regex matching to avoid redundant operations.
 * @param {string} numberStr - The phone number string to parse.
 * @returns {{coreNumber: string, extension: string|null, hasStandardExtension: boolean|null}}
 */
export function parseStandardExtension(numberStr) {
    const res = { coreNumber: numberStr, extension: null, hasStandardExtension: null };
    if (!numberStr) {
        res.coreNumber = '';
        return res;
    }

    const match = numberStr.toLowerCase().match(EXTENSION_REGEX);
    if (match) {
        if (match[1]) {
            res.coreNumber = match[1].trim();
        }
        if (match[3]) {
            res.extension = match[3].replace(/[^\d]/g, '');

            if (match[2]) {
                res.hasStandardExtension = false;
                const originalCaseMatch = numberStr.match(EXTENSION_REGEX);
                if (originalCaseMatch && originalCaseMatch[2]) {
                    res.hasStandardExtension = ACCEPTABLE_EXTENSION_FORMATS.includes(originalCaseMatch[2]);
                }
            }
        }
    }
    return res;
}

/**
 * Checks if a parsed phone number matches any defined exclusions based on country
 * code and OSM tags.
 * @param {Object} phoneNumber - The parsed phone number object from libphonenumber-js.
 * @param {string} numberStr - The phone number string to validate.
 * @param {string} countryCode - The country code.
 * @param {Object} osmTags - The OpenStreetMap tags associated with the number.
 * @returns {Object|null} - Returns an object with { isInvalid: false, autoFixable: true, suggestedFix }
 * if an exclusion is matched, otherwise returns null.
 */
export function checkExclusions(phoneNumber, numberStr, countryCode, osmTags) {
    if (!phoneNumber || !numberStr) {
        return null;
    }

    // Get the core national number without country code
    const coreNationalNumber = phoneNumber.nationalNumber;
    const normalisedOriginal = numberStr.replace(getSpacingRegex(countryCode), '');

    // See https://github.com/confusedbuffalo/phone-report/issues/18
    if (['FR', 'GF', 'GP', 'YT'].includes(countryCode)) {
        // libphonenumbers-js doesn't support the short number check
        // but that would catch emergency numbers which probably shouldn't be mapped anyway
        const isValidShortNumberFr =
            (coreNationalNumber.length === 4 && coreNationalNumber.at(0) === '3') ||
            (coreNationalNumber.length === 4 && coreNationalNumber.at(0) === '1');
        if (isValidShortNumberFr) {
            return {
                isInvalid: !(normalisedOriginal === coreNationalNumber),
                autoFixable: true,
                suggestedFix: coreNationalNumber,
            };
        }
    }

    const countryExclusions = EXCLUSIONS[countryCode];
    if (countryExclusions) {
        const numberExclusions = countryExclusions[coreNationalNumber];

        if (numberExclusions) {
            // Check if all required OSM tag key/value pair matches the input osmTags
            for (const key in numberExclusions) {
                if (Object.hasOwn(numberExclusions, key)) {
                    if (osmTags[key] === numberExclusions[key]) {
                        return {
                            isInvalid: !(normalisedOriginal === coreNationalNumber),
                            autoFixable: true,
                            suggestedFix: coreNationalNumber,
                        };
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Split a number into the core number and the extension, respecting country
 * formatting for extensions.
 * @param {PhoneNumber} numberStr - The original phone number string
 * @param {string} countryCode - The country code for formatting.
 * @returns {{
 * coreNumber: string,
 * extension: string,
 * hasStandardExtension: boolean
 * }} An object containing the core number, the extension and whether the extension is in a standard format.
 */
export function getNumberAndExtension(numberStr, countryCode) {
    // DIN format has hyphen extension
    if (DIN_FORMAT_COUNTRIES.includes(countryCode)) {
        const match = numberStr.match(DIN_EXTENSION_REGEX);
        // DE extensions can be up to 5 digits: https://community.openstreetmap.org/t/telefonnummer-nebenstelle-kennzeichnen-phonenumbervalidator/137711/20
        // AT extensions can be up to 8 digits: https://community.openstreetmap.org/t/telefonnummern-report-fur-osterreich/140237/32
        const maxExtensionLength = countryCode === 'AT' ? 8 : 5;

        if (match && match[1] && match[2] && match[3]) {
            try {
                const preHyphenNumber = parsePhoneNumber(match[1], countryCode);
                const isHyphen = match[2] === '-';
                const extensionDigits = match[3].replace(/[^\d]/, '');
                // Only consider this as an extension if the number before it is valid as a number
                // (since hyphens may have been used as separators in a non-extension number)
                if (preHyphenNumber.isValid() && extensionDigits && extensionDigits.length <= maxExtensionLength) {
                    return {
                        coreNumber: match[1].trim(),
                        extension: extensionDigits,
                        hasStandardExtension: isHyphen,
                    };
                }
            } catch {
                // Parsing failed due to an exception
            }
        }
    }
    // TW uses # for extension
    else if (countryCode === 'TW') {
        const match = numberStr.match(/^(.*?)(\s*(?:[#~]|分機)\s*)(.+)$/);

        if (match && match[1] && match[2] && match[3]) {
            try {
                const mainNumber = parsePhoneNumber(match[1], countryCode);
                const isHash = match[2].trim() === '#';
                const extensionDigits = match[3].replace(/[^\d]/, '');

                if (mainNumber.isValid() && extensionDigits) {
                    return {
                        coreNumber: match[1].trim(),
                        extension: extensionDigits,
                        hasStandardExtension: isHash,
                    };
                }
            } catch {
                // Parsing failed due to an exception
            }
        }
    }
    const { coreNumber, extension, hasStandardExtension } = parseStandardExtension(numberStr);
    return {
        coreNumber,
        extension,
        hasStandardExtension,
    };
}

/**
 * Formats a single phone number to the appropriate national standard
 * @param {PhoneNumber} phoneNumber - The phone number object
 * @param {string} countryCode - The country code for formatting.
 * @param {boolean} tollFreeAsInternational - Whether or not toll free numbers should be formatted with a country code.
 * @returns {string} The formatted number
 */
export function getFormattedNumber(phoneNumber, tollFreeAsInternational = false) {
    const countryCode = phoneNumber.country;
    const originalExt = phoneNumber.ext;

    // Temporarily clear the extension to get the core number without libphonenumber's formatting
    if (originalExt) {
        phoneNumber.setExt(undefined);
    }
    let internationalNumber = NANP_COUNTRY_CODES.includes(countryCode)
        ? phoneNumber.format('INTERNATIONAL').replace(/\s/g, '-')
        : phoneNumber.format('INTERNATIONAL');

    // Append the extension in the standard format (' x{ext}', DIN format or with hash for TW)
    const extension = originalExt
        ? DIN_FORMAT_COUNTRIES.includes(countryCode)
            ? `-${originalExt}`
            : countryCode === 'TW'
              ? `#${originalExt}`
              : ` x${originalExt}`
        : '';

    let result;

    const phoneType = phoneNumber.getType();

    if (getNonStandardCostTypes(countryCode).includes(phoneType) && !tollFreeAsInternational) {
        const coreFormattedNational = phoneNumber.format('NATIONAL');
        result =
            countryCode === 'PE'
                ? coreFormattedNational.replace(/[()]/g, '') + extension
                : COUNTRIES_WITH_INCORRECT_HYPHENS_IN_NATIONAL.includes(countryCode)
                  ? coreFormattedNational.replaceAll('-', ' ') + extension
                  : coreFormattedNational + extension;
    } else {
        result = internationalNumber + extension;
    }

    // Restore extension
    if (originalExt) {
        phoneNumber.setExt(originalExt);
    }

    return result;
}
