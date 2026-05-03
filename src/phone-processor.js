const fs = require('fs');
const { parsePhoneNumber } = require('libphonenumber-js/max');
const {
    EXCLUSIONS,
    MOBILE_TAGS,
    WEBSITE_TAGS,
    BAD_SEPARATOR_REGEX,
    UNIVERSAL_SPLIT_REGEX,
    UNIVERSAL_SPLIT_REGEX_DIN,
    EXTENSION_REGEX,
    DIN_EXTENSION_REGEX,
    PHONE_TAG_PREFERENCE_ORDER,
    NANP_COUNTRY_CODES,
    ACCEPTABLE_EXTENSION_FORMATS,
    TOLL_FREE_AS_NATIONAL_COUNTRIES,
    ALL_NUMBER_TAGS,
    FAX_TAGS,
    NON_STANDARD_COST_TYPES,
    INVALID_SPACING_CHARACTERS_REGEX,
    CAN_ADD_COUNTRY_CODE_TO_INCORRECT_LEADING_PLUS,
    COUNTRIES_WITH_PHONEWORDS,
    DIN_FORMAT_COUNTRIES,
    INCORRECT_PLUS_CAN_START_WITH_COUNTRY_CODE,
    CAN_REFORMAT_NUMBER_WITHOUT_SPACES,
    INVALID_SPACING_CHARACTERS_REGEX_TW,
} = require('./constants');
const { PhoneNumber } = require('libphonenumber-js');
const { getRepresentativeLocation } = require('./data-processor');

const MobileStatus = {
    MOBILE: 'mobile',
    NOT_MOBILE: 'not mobile',
    UNKNOWN: 'unknown',
};


/**
 * Checks if a phone number is a mobile number
 * @param {PhoneNumber} phoneNumber The libphonenumber-js PhoneNumber object.
 * @returns {string} One of the values from MobileStatus.
 */
function checkMobileStatus(phoneNumber) {
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
function phoneTagToUse(tags) {
    const phoneTagPresent = 'phone' in tags;
    const contactTagPresent = 'contact:phone' in tags;

    if (phoneTagPresent && contactTagPresent) {
        return 'phone';
    } else if (phoneTagPresent) {
        return 'phone';
    } else if (contactTagPresent) {
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
function keyToRemove(key1, key2) {
    // Look up the score. If a key is unknown, it's given a very low preference 
    // (Infinity), prioritizing its removal.
    const score1 = PHONE_TAG_PREFERENCE_ORDER[key1] !== undefined ? PHONE_TAG_PREFERENCE_ORDER[key1] : Infinity;
    const score2 = PHONE_TAG_PREFERENCE_ORDER[key2] !== undefined ? PHONE_TAG_PREFERENCE_ORDER[key2] : Infinity;

    // The key to REMOVE is the one with the higher score (lower preference).

    if (score1 > score2) {
        return key1;
    } else if (score2 > score1) {
        return key2;
    } else {
        // If scores are equal (e.g., both keys are 'phone', or both are unrecognized),
        // we must choose one deterministically. We'll default to removing key2.
        return key2;
    }
}

/**
 * Checks if a change is only to the formatting or adding a country code and 
 * so can be safely made automatically.
 * @param {string} originalNumberStr - The original OSM tag
 * @param {string} newNumberStr - The suggested fix
 * @param {string} countryCode - The country code.
 * @returns {boolean}
 */
function isSafeEdit(originalNumberStr, newNumberStr, countryCode) {
    if (!originalNumberStr || !newNumberStr) return false;

    // Digits, spaces, plus, dash and hyphens and invisible spacing characters
    // AT and DE: no dashes or hyphens (due to extensions), but include slash (used as grouping separator)
    const SAFE_CHARACTER_REGEX =
        DIN_FORMAT_COUNTRIES.includes(countryCode)
            ? /^[\d\s\(\)+\./\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u2068\u2069]+$/g
            : /^[\d\s\(\)+\.\-−‐‑‒–—\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u2068\u2069]+$/g;

    const hasOnlySafeChars = originalNumberStr.match(SAFE_CHARACTER_REGEX);
    if (!hasOnlySafeChars) return false;

    processedOriginal = processSingleNumber(originalNumberStr, countryCode);

    // Double check that the original number parses to the new number
    if (!processedOriginal.autoFixable || processedOriginal.suggestedFix != newNumberStr) return false;

    // Confirm that the number is in the same country
    try {
        const parsedNew = parsePhoneNumber(newNumberStr);
        if (parsedNew.country === countryCode && parsedNew.isValid()) {
            return true;
        }
        if (
            // Toll free numbers in all of NANP are parsed as US
            // It is not possible to tell the country from the phone number in this case
            NANP_COUNTRY_CODES.includes(countryCode)
            && parsedNew.isValid()
            && NON_STANDARD_COST_TYPES.includes(parsedNew.getType())
            && parsedNew.country === 'US'
        ) {
            return true
        }
    } catch (e) {
        // Parsing failed due to an exception
    }

    return false;
}

/**
 * Strips phone number extensions (x, ext, etc.) and non-dialable characters 
 * to isolate the core number for comparison.
 * @param {string} numberStr 
 * @returns {string} The core number string without the extension.
 */
function stripStandardExtension(numberStr) {
    const match = numberStr.toLowerCase().match(EXTENSION_REGEX);
    if (match && match[1]) {
        return match[1].trim();
    }
    return numberStr;
}

/**
 * Gets the extension from a phone number if it is in a recognisable format.
 * @param {string} numberStr 
 * @returns {string} The core number string without the extension.
 */
function getStandardExtension(numberStr) {
    const match = numberStr.toLowerCase().match(EXTENSION_REGEX);
    if (match && match[3]) {
        return match[3].replace(/[^\d]/g, '');
    }
    return null;
}

/**
 * Determines if the extension is in a standard format.
 * @param {string} numberStr 
 * @returns {boolean|null} If the extension is in a standard format or null if there is no extension
 */
function isStandardExtension(numberStr) {
    if (!numberStr) return null;
    const match = numberStr.toLowerCase().match(EXTENSION_REGEX);
    const originalCaseMatch = numberStr.match(EXTENSION_REGEX);
    if (!match || (match && !match[3])) return null
    if (match && match[2]) {
        if (originalCaseMatch && originalCaseMatch[2]) {
            return ACCEPTABLE_EXTENSION_FORMATS.includes(originalCaseMatch[2]);
        }
        return false;
    }
    return null;
}

/**
 * Gets the relevant regex for valid spacing in the given country code.
 * @param {string} countryCode - The country code.
 * @returns {RegExp} The regular expression to use for spacing validation.
 */
function getSpacingRegex(countryCode) {
    return NANP_COUNTRY_CODES.includes(countryCode) ? /[\s-]/g : /\s/g;
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
function checkExclusions(phoneNumber, numberStr, countryCode, osmTags) {
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
        const isValidShortNumberFr = (
            (coreNationalNumber.length === 4 && coreNationalNumber.at(0) === '3')
            || (coreNationalNumber.length === 4 && coreNationalNumber.at(0) === '1')
        )
        if (isValidShortNumberFr) {
            return {
                isInvalid: !(normalisedOriginal === coreNationalNumber),
                autoFixable: true,
                suggestedFix: coreNationalNumber
            };
        }
    }

    const countryExclusions = EXCLUSIONS[countryCode];
    if (countryExclusions) {
        const numberExclusions = countryExclusions[coreNationalNumber];

        if (numberExclusions) {
            // Check if all required OSM tag key/value pair matches the input osmTags
            for (const key in numberExclusions) {
                if (numberExclusions.hasOwnProperty(key)) {
                    if (osmTags[key] === numberExclusions[key]) {
                        return {
                            isInvalid: !(normalisedOriginal === coreNationalNumber),
                            autoFixable: true,
                            suggestedFix: coreNationalNumber
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
function getNumberAndExtension(numberStr, countryCode) {
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
                    }
                }
            } catch (e) {
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
                    }
                }
            } catch (e) {
                // Parsing failed due to an exception
            }
        }
    }
    return {
        coreNumber: stripStandardExtension(numberStr),
        extension: getStandardExtension(numberStr),
        hasStandardExtension: isStandardExtension(numberStr),
    }
}

/**
 * Formats a single phone number to the appropriate national standard
 * @param {PhoneNumber} phoneNumber - The phone number object
 * @param {string} countryCode - The country code for formatting.
 * @param {boolean} tollFreeAsInternational - Whether or not toll free numbers should be formatted with a country code.
 * @returns {string} The formatted number
 */
function getFormattedNumber(phoneNumber, countryCode, tollFreeAsInternational = false) {
    const isPolishPrefixed = isPolishPrefixedNumber(phoneNumber, countryCode);

    const coreNumberE164 = isPolishPrefixed
        ? `+48 ${phoneNumber.nationalNumber.slice(1)}`
        : phoneNumber.number;

    const internationalNumber = parsePhoneNumber(coreNumberE164).format('INTERNATIONAL')

    const coreFormatted = NANP_COUNTRY_CODES.includes(countryCode)
        ? internationalNumber.replace(/\s/g, '-').replace('-ext.-', ' x')
        : internationalNumber;

    // Append the extension in the standard format (' x{ext}', DIN format or with hash for TW)
    const extension = phoneNumber.ext ?
        (
            DIN_FORMAT_COUNTRIES.includes(countryCode) ? `-${phoneNumber.ext}`
            : countryCode === 'TW' ? `#${phoneNumber.ext}`
            : ` x${phoneNumber.ext}`
        )
        : '';

    if (NON_STANDARD_COST_TYPES.includes(phoneNumber.getType()) && !tollFreeAsInternational) {
        const coreFormattedNational = parsePhoneNumber(coreNumberE164).format('NATIONAL');
        return coreFormattedNational + extension;
    }

    return coreFormatted + extension;
}

/**
 * Determines if a phone number is a Polish number incorrectly prefixed with a 0
 * @param {PhoneNumber} phoneNumber - The phone number object
 * @param {string} countryCode - The country code being checked against
 * @returns {boolean}
 */
function isPolishPrefixedNumber(phoneNumber, countryCode) {
    // See https://github.com/confusedbuffalo/phone-report/issues/15
    return (
        countryCode === 'PL'
        && phoneNumber
        && !phoneNumber.isValid()
        && phoneNumber.isPossible()
        && phoneNumber.nationalNumber.startsWith('0')
    )
}

function insertMissingItalianZero(numberStr) {
    const missingZeroRegex = /^(\+39)(\s*[1-9].*)$/;
    if (!numberStr.match(missingZeroRegex)) return numberStr;

    const newNumberStr = numberStr.replace(missingZeroRegex, '$10$2');

    try {
        let phoneNumber = parsePhoneNumber(newNumberStr);
        if (phoneNumber.isValid()) {
            return newNumberStr;
        }
    }
    catch (e) {
        return numberStr;
    }
    return numberStr;
}

function isItalianMissingZeroNumber(phoneNumber, countryCode) {
    if (countryCode !== 'IT' || phoneNumber.isValid()) return false;
    return phoneNumber.number !== insertMissingItalianZero(phoneNumber.number);
}

/**
 * Checks if a given URL host is an exact match or a subdomain of one of the valid hosts.
 * @param {string} urlString The URL string to check.
 * @returns {boolean} True if the host is valid.
 */
const isWhatsappUrl = (urlString) => {
    const validWhatsappHosts = ['wa.me', 'whatsapp.com'];

    let fullUrlString = urlString;

    if (!urlString.includes(':')) {
        fullUrlString = `https://${urlString}`;
    }

    try {
        const url = new URL(fullUrlString);

        if (url.protocol === 'whatsapp:') {
            return true
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

    } catch (e) {
        return false;
    }
};

/**
 * Extracts a phone number from a string that may be a URL and determines if it is a valid non-number
 * (such as a channel or catalog link)
 * @param {PhoneNumber} phoneNumber - The phone number object
 * @param {string} countryCode - The country code being checked against
 * @returns {boolean}
 */
function getWhatsappNumber(numberStr) {
    let isValidWhatsappUrl = false;
    let cleanNumberStr = numberStr;

    const parsedUrl = URL.parse(numberStr);
    if (parsedUrl) {
        isValidWhatsappUrl = isWhatsappUrl(numberStr)
        const pathname = parsedUrl.pathname;

        if (!isValidWhatsappUrl) {
            return {
                cleanNumberStr: cleanNumberStr,
                validNonNumber: isValidWhatsappUrl
            }
        }
        if (parsedUrl.searchParams?.get('phone')) {
            cleanNumberStr = parsedUrl.searchParams.get('phone');
            if (cleanNumberStr.startsWith(' ')) {
                cleanNumberStr = '+' + cleanNumberStr.trimStart();
            }
            isValidWhatsappUrl = false;
        }
        else if (
            parsedUrl.hostname.endsWith('wa.me')
            && !pathname.startsWith('/qr')
            && !pathname.startsWith('/message')
            && !pathname.startsWith('/c')
        ) {
            cleanNumberStr = pathname.startsWith('/') ? pathname.slice(1) : pathname;
            isValidWhatsappUrl = false;
        }
    }
    return {
        cleanNumberStr: cleanNumberStr,
        validNonNumber: isValidWhatsappUrl
    }
}

/**
 * Converts a phoneword string into a numeric string.
 * @param {string} phoneword - The input string (e.g., "1-800-FLOWERS")
 * @returns {string} - The converted numeric string (e.g., "1-800-3569377")
 */
function convertPhonewordToDigits(phoneword) {
    const mapping = {
      'A': '2', 'B': '2', 'C': '2',
      'D': '3', 'E': '3', 'F': '3',
      'G': '4', 'H': '4', 'I': '4',
      'J': '5', 'K': '5', 'L': '5',
      'M': '6', 'N': '6', 'O': '6',
      'P': '7', 'Q': '7', 'R': '7', 'S': '7',
      'T': '8', 'U': '8', 'V': '8',
      'W': '9', 'X': '9', 'Y': '9', 'Z': '9'
    };
  
    return phoneword.toUpperCase().replace(/[A-Z]/g, (char) => {
      return mapping[char] || char;
    });
  }

/**
 * Validates a single phone number string using libphonenumber-js.
 * @param {string} numberStr - The phone number string to validate.
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @param {string} tag - The OSM phone tag being used for this number
 * @returns {{phoneNumber: phoneNumber, isInvalid: boolean, suggestedFix: string|null, autoFixable: boolean, typeMismatch: boolean, validPhonewords: boolean, foreign: string|null}}
 */
function processSingleNumber(numberStr, countryCode, osmTags = {}, tag) {
    let suggestedFix = null, phoneNumber = null, foreign = null;
    let autoFixable = true;
    let isInvalid = false, typeMismatch = false, validPhonewords = false;

    const spacingRegex = getSpacingRegex(countryCode);

    if (numberStr.startsWith('++')) {
        numberStr = numberStr.slice(1);
        isInvalid = true;
    }

    // Fix number starting 1+ instead of +1 (somewhat common error)
    if (numberStr.match(/^1\+\s?\d.*/)) {
        numberStr = `+1${numberStr.slice(2)}`;
        isInvalid = true;
    }

    if (numberStr.match(INVALID_SPACING_CHARACTERS_REGEX)) {
        isInvalid = true;
    }

    couldBePhonewords = COUNTRIES_WITH_PHONEWORDS.includes(countryCode) && numberStr.match(/.*[a-z]$/i);

    if (tag === 'contact:whatsapp') {
        ({ cleanNumberStr, validNonNumber } = getWhatsappNumber(numberStr));
        if (validNonNumber) {
            return {
                isInvalid: false
            };
        } else if (numberStr !== cleanNumberStr) {
            numberStr = cleanNumberStr;
            isInvalid = true;
        }
    } else if (couldBePhonewords) {
        numberStr = convertPhonewordToDigits(numberStr);
        isInvalid = true;
    }

    const invalidSpacingRegex = countryCode === 'TW' ? INVALID_SPACING_CHARACTERS_REGEX_TW : INVALID_SPACING_CHARACTERS_REGEX

    const { coreNumber, extension, hasStandardExtension } = getNumberAndExtension(numberStr.replace(invalidSpacingRegex, " "), countryCode);
    const standardisedNumber = extension ? `${coreNumber} x${extension}` : coreNumber;

    try {
        phoneNumber = parsePhoneNumber(standardisedNumber, countryCode);

        const exclusionResult = checkExclusions(phoneNumber, numberStr, countryCode, osmTags);
        if (exclusionResult) {
            return exclusionResult;
        }

        const normalisedOriginal = coreNumber.replace(spacingRegex, '');

        let normalisedParsed = '';

        const isPolishPrefixed = isPolishPrefixedNumber(phoneNumber, countryCode);
        const isItalianMissingZero = isItalianMissingZeroNumber(phoneNumber, countryCode);
        if (isItalianMissingZero) {
            phoneNumber = parsePhoneNumber(insertMissingItalianZero(numberStr));
        }

        if (phoneNumber) {
            const tollFreeAsInternational = (
                !TOLL_FREE_AS_NATIONAL_COUNTRIES.includes(countryCode)
                || numberStr.includes('+')
                || numberStr.startsWith('00')
            );
            suggestedFix = getFormattedNumber(phoneNumber, countryCode, tollFreeAsInternational);
        }

        if (phoneNumber && (phoneNumber.isValid() || isPolishPrefixed || isItalianMissingZero)) {
            normalisedParsed = phoneNumber.number.replace(spacingRegex, '');

            if (couldBePhonewords) {
                validPhonewords = true;
            }

            if (MOBILE_TAGS.includes(tag)) {
                const mobileStatus = checkMobileStatus(phoneNumber);
                if (mobileStatus === MobileStatus.NOT_MOBILE) {
                    isInvalid = true;
                    autoFixable = true;
                    typeMismatch = true;
                }
            }

            let numbersMatch = false;
            if (NON_STANDARD_COST_TYPES.includes(phoneNumber.getType())) {
                const normalisedTollFree = suggestedFix.replace(spacingRegex, '');
                numbersMatch = normalisedOriginal === normalisedTollFree;
            }
            numbersMatch = numbersMatch || normalisedOriginal === normalisedParsed;

            if (CAN_REFORMAT_NUMBER_WITHOUT_SPACES.includes(countryCode)) {
                // Targets numbers with no spaces after the country code
                isInvalid = /^\+?\s?\d{4,}[\d\s]+$/.test(numberStr);
            }

            // Bad spacing: space after plus, multiple consecutive spaces/dashes
            isInvalid = isInvalid || /^\+\s.*$/.test(numberStr) || /\s{2,}/.test(numberStr) || /\-{2,}/.test(numberStr);

            isInvalid = isInvalid || !numbersMatch || isPolishPrefixed || isItalianMissingZero;

            if (phoneNumber.ext && !hasStandardExtension) {
                isInvalid = true;
            }

            // Toll free numbers in all of NANP are parsed as US
            // It is not possible to tell the country from the phone number in this case
            const isNanpTollFree = NANP_COUNTRY_CODES.includes(countryCode)
                && NON_STANDARD_COST_TYPES.includes(phoneNumber.getType())
                && phoneNumber.country === 'US'
            foreign = (phoneNumber.country.toLowerCase() !== countryCode.toLowerCase() && !isNanpTollFree) ? phoneNumber.country : null;
        } else {
            // The number is fundamentally invalid (e.g., too few digits)
            phoneNumber = null;
            isInvalid = true;
            suggestedFix = null;
            autoFixable = false;
        }
    } catch (e) {
        // Parsing failed due to an exception (unfixable invalid number)
        isInvalid = true;
        autoFixable = false;
        suggestedFix = null;
    }

    // DE numbers do not have fixed length and could start with 49, but maybe a + was missed off
    // so it is not clear what the correct fix should be, whether adding 0 or adding +
    // see https://github.com/confusedbuffalo/phone-report/issues/78 and https://github.com/confusedbuffalo/phone-report/issues/53
    if (
        isInvalid
        && autoFixable
        && countryCode === 'DE'
        && coreNumber.replace(/[^\d]/g, '').startsWith('49')
        && !coreNumber.split('49')[0].includes('+')
    ) {
        autoFixable = false;
        suggestedFix = null;
    }

    return { phoneNumber, isInvalid, suggestedFix, autoFixable, typeMismatch, validPhonewords, foreign: foreign };
}


/**
 * Checks if the forward slash character should be considered as a spacing character.
 * @param {string} tagValue - The phone number value string to validate.
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @param {string} tag - The OSM phone tag being used for this number
 * @returns {boolean} - Whether forward slash should be treated as a space character.
 */
function isSlashSpace(tagValue, countryCode, osmTags, tag) {
    const validationResult = processSingleNumber(tagValue, countryCode, osmTags, tag);
    return (!validationResult.isInvalid || validationResult.autoFixable);
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
function expandSlashEnding(tagValue, countryCode, osmTags, tag) {
    const parts = tagValue.split('/').map(part => part.trim());

    // Only attempt two possible endings (original and alternative)
    if (parts.length !== 2 || parts[1].length > 4) {
        return null;
    }

    const validationResult = processSingleNumber(parts[0], countryCode, osmTags, tag);

    if (validationResult.isInvalid && !validationResult.autoFixable) {
        return null;
    }

    const altNumber = parts[0].slice(0, -parts[1].length) + [parts[1]];

    const altValidationResult = processSingleNumber(altNumber, countryCode, osmTags, tag);

    if (!altValidationResult.isInvalid || altValidationResult.autoFixable) {
        return [parts[0], altNumber]
    }
    return null;
}


/**
 * Validates a whole phone number tag using libphonenumber-js.
 * @param {string} tagValue - The phone number value string to validate (possibly containing multiple numbers).
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @param {string} tag - The OSM phone tag being used for this number
 * @returns {object} - The status and details of the processed item.
 * @property {boolean} isInvalid - Indicates whether the number is invalid.
 * @property {boolean} isAutoFixable - Indicates whether the number can be automatically corrected.
 * @property {Array<string>} suggestedNumbersList - A list of suggested corrections (as strings).
 * @property {number} numberOfValues - The number of phone values checked.
 * @property {Array<phoneNumber>} validNumbersList - A list of all valid phone numbers found in the tag.
 * @property {Map<string, string>} validForeignNumbersMap - A map of all valid but foreign phone numbers found in the tag, phone string to country code.
 */
function validateSingleTag(tagValue, countryCode, osmTags, tag) {
    const originalTagValue = tagValue.trim();

    // Check if a bad separator was used
    const hasBadSeparator = tag === 'contact:whatsapp' ? false : originalTagValue.match(BAD_SEPARATOR_REGEX);
    const hasBadExtension = originalTagValue.match(/, ext|\\;ext=/gi);

    const slashAsSpace = isSlashSpace(tagValue, countryCode, osmTags, tag);
    const slashForMultipleEndings = expandSlashEnding(tagValue, countryCode, osmTags, tag);

    splitRegex = slashAsSpace ? UNIVERSAL_SPLIT_REGEX_DIN : UNIVERSAL_SPLIT_REGEX;

    // Single-step splitting: The regex finds all separators and removes them.
    const numberList = tag === 'contact:whatsapp'
        ? originalTagValue.split(';')
        : slashForMultipleEndings
        ?? originalTagValue.replace('\\;ext=', ' ext ').replace('\\;=ext=', ' ext ').split(splitRegex);
    const numbers = numberList
        .map(s => s.trim())
        .filter(s => s.length > 0);

    let hasIndividualInvalidNumber = false;

    const tagValidationResult = {
        isInvalid: false,
        isAutoFixable: true,
        validPhonewords: false,
        suggestedNumbersList: [],
        mismatchTypeNumbers: [],
        numberOfValues: 0,
        validNumbersList: [],
        validForeignNumbersMap: new Map(),
    };

    let hasTypeMismatch = false;

    numbers.forEach(numberStr => {
        tagValidationResult.numberOfValues++;

        let validationResult = processSingleNumber(numberStr, countryCode, osmTags, tag);

        // Some editors prompt an initial plus, but some mappers then just put the phone number in using national format, which is invalid
        if (
            validationResult.isInvalid
            && !validationResult.autoFixable
            && numberStr.startsWith('+')
            && CAN_ADD_COUNTRY_CODE_TO_INCORRECT_LEADING_PLUS.includes(countryCode)
        ) {
            const noPlusValidationResult = processSingleNumber(numberStr.slice(1), countryCode, osmTags, tag);
            const countryCodePrefix = noPlusValidationResult.phoneNumber?.format('INTERNATIONAL').split(' ')[0];
            if (
                noPlusValidationResult.phoneNumber
                && noPlusValidationResult.autoFixable
                && noPlusValidationResult.phoneNumber.country === countryCode
                && (INCORRECT_PLUS_CAN_START_WITH_COUNTRY_CODE.includes(countryCode)) || !numberStr.startsWith(countryCodePrefix)
            ) {
                validationResult = noPlusValidationResult;
            }
        }

        const { phoneNumber, isInvalid, suggestedFix, autoFixable, typeMismatch, validPhonewords, foreign } = validationResult;

        if (phoneNumber) {
            tagValidationResult.validNumbersList.push(phoneNumber);
        }

        if (suggestedFix && !typeMismatch) {
            tagValidationResult.suggestedNumbersList.push(suggestedFix);
        }

        if (isInvalid) {
            hasIndividualInvalidNumber = true;
            tagValidationResult.isAutoFixable = tagValidationResult.isAutoFixable && autoFixable;
        }

        if (typeMismatch) {
            tagValidationResult.mismatchTypeNumbers.push(validationResult.suggestedFix);
            hasTypeMismatch = true;
        }

        if (validPhonewords) {
            // Multiple phonewords in one tag gets complicated and is likely very rare
            if (tagValidationResult.numberOfValues == 1 && !tagValidationResult.validPhonewords) {
                tagValidationResult.validPhonewords = true;
            } else {
                tagValidationResult.validPhonewords = false;
                tagValidationResult.isAutoFixable = false;
            }
        }

        if (foreign) {
            tagValidationResult.validForeignNumbersMap.set(numberStr, foreign);
        }
    });

    // Final check for invalidity due to bad separators or type mismatch
    if (hasIndividualInvalidNumber || hasBadSeparator || hasTypeMismatch) {
        tagValidationResult.isInvalid = true;
        if (hasBadSeparator || hasBadExtension || hasTypeMismatch) {
            tagValidationResult.isAutoFixable = tagValidationResult.isAutoFixable && true;
        }
    }

    return tagValidationResult;
}


/**
 * Iterates over the mismatchTypeNumbers Map and updates the suggestedFixes Map.
 * @param {object} item - The item object containing the Maps.
 * @param {string} countryCode - The country code for validation.
 */
function processMismatches(item, countryCode) {
    if (item.mismatchTypeNumbers && item.mismatchTypeNumbers instanceof Map) {
        for (const [mismatchKey, mismatchValue] of item.mismatchTypeNumbers) {

            const tagToUse = phoneTagToUse(item.allTags);
            const existingValue = item.allTags[tagToUse];
            const existingFix = item.suggestedFixes.get(tagToUse);

            let suggestedForMismatch;

            // Check if the number we're moving in is a duplicate
            if (existingFix || existingValue) {
                const suggested = existingFix ? existingFix : existingValue;

                const validatedSuggested = validateSingleTag(suggested, countryCode, item.allTags, tagToUse)
                const validatedMismatch = validateSingleTag(mismatchValue, countryCode, item.allTags, tagToUse)

                const allSuggested = [...validatedSuggested.suggestedNumbersList, ...validatedMismatch.suggestedNumbersList];
                const suggestedSet = new Set(allSuggested);
                const filteredSuggested = Array.from(suggestedSet);

                if (
                    filteredSuggested.join('; ') === validatedSuggested.suggestedNumbersList.join('; ')
                    && !item.suggestedFixes[mismatchKey]
                ) {
                    item.hasTypeMismatch = false;
                    item.mismatchTypeNumbers.delete(mismatchKey);
                }

                suggestedForMismatch = filteredSuggested.join('; ');
            } else {
                suggestedForMismatch = mismatchValue;
            }

            if (item.hasTypeMismatch) {
                // Ensure that existing value is always shown (even if valid) so that it can be displayed
                item.invalidNumbers.set(tagToUse, existingValue);
            }

            // If the numbers were already valid, and invalid is only there to show what the duplicate is matching
            if (item.invalidNumbers.get(tagToUse) !== suggestedForMismatch) {
                item.suggestedFixes.set(tagToUse, suggestedForMismatch);
            }
        }
    }
}

/**
 * Checks all of the edits and determines if all edits are safe to be
 * made automatically.
 * @param {object} item - The item object containing the Maps.
 * @param {string} countryCode - The country code for validation.
 * @returns {boolean}
 */
function isSafeItemEdit(item, countryCode) {
    // Not safe if there are any mismatch type numbers or duplicate numbers
    if (
        !item.autoFixable
        || item.hasTypeMismatch
        || (item.mismatchTypeNumbers && item.mismatchTypeNumbers instanceof Map && item.mismatchTypeNumbers.size !== 0)
        || (item.duplicateNumbers && item.duplicateNumbers instanceof Map && item.duplicateNumbers.size !== 0)
    ) {
        return false
    }

    // If sizes are different, there are unpaired items.
    if (item.invalidNumbers.size !== item.suggestedFixes.size) {
        return false;
    }

    // Ensure every key in one map exists in the other.
    for (const key of item.invalidNumbers.keys()) {
        if (!item.suggestedFixes.has(key)) {
            return false;
        }
    }

    let isSafe = true;

    for (const [key, invalidValue] of item.invalidNumbers.entries()) {
        const suggestedValue = item.suggestedFixes.get(key);

        isSafe = isSafe && isSafeEdit(invalidValue, suggestedValue, countryCode);

        if (!isSafe) {
            return false;
        }
    }

    return isSafe;
}

/**
 * Validates phone numbers using libphonenumber-js, marking tags as invalid if
 * they contain bad separators (comma, slash, 'or') or invalid numbers.
 * @param {Array<Object>} elementStream - OSM elements with phone tags.
 * @param {string} countryCode - The country code for validation.
 * @param {string} tmpFilePath - The temporary file path to store the invalid items.
 * @returns {{
 * totalCount: number,
 * invalidCount: number,
 * autoFixableCount: number,
 * foreignCount: number,
 * safeEditCount: number
 * }} An object containing the breakdown of record counts.
 */
async function validateNumbers(elementStream, countryCode, tmpFilePath) {
    countryCode = countryCode.split('-')[0]; // In case of ISO 3166-2 region code being used at division level
    const fileStream = fs.createWriteStream(tmpFilePath);
    fileStream.write('[\n');
    let isFirstItem = true;

    let totalCount = 0;
    let invalidCount = 0;
    let autoFixableCount = 0;
    let foreignCount = 0;
    let safeEditCount = 0;

    for await (const element of elementStream) {
        if (!element.properties) continue;
        
        const tags = element.properties;

        let item = null;
        let foreignItem = null;
        const allNormalisedPhoneNumbers = new Map();
        const allNormalisedFaxNumbers = new Map();

        const createItem = () => {
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
                invalidNumbers: new Map(),
                suggestedFixes: new Map(),
                hasTypeMismatch: false,
                mismatchTypeNumbers: new Map(),
                duplicateNumbers: new Map(),
                validForeignNumbers: new Map(),
            };
            return baseItem;
        };

        const getOrCreateItem = (autoFixable) => {
            if (item) return item;

            baseItem = createItem();
            item = { ...baseItem, autoFixable }
            return item
        };

        const getOrCreateForeignItem = () => {
            if (foreignItem) return foreignItem;

            const baseItem = createItem();

            foreignItem = {
                ...baseItem,
                isForeignItem: true,
                validForeignNumbers: new Map(),

            };
            return foreignItem;
        };

        for (const tag of ALL_NUMBER_TAGS) {
            if (!tags[tag]) continue;

            const phoneTagValue = tags[tag];
            if (tag === 'mobile' && phoneTagValue === 'yes') continue;
            if (tag === 'phone' && phoneTagValue === 'no') continue;

            const validationResult = validateSingleTag(phoneTagValue, countryCode, tags, tag);
            totalCount += validationResult.numberOfValues;

            const validatedNumbers = validationResult.validNumbersList;
            let tagShouldBeFlaggedForRemoval = false;
            let hasInternalDuplicate = false;
            let suggestedFix = null;
            let duplicateMismatchCount = 0;

            const allNormalisedNumbers = FAX_TAGS.includes(tag) ? allNormalisedFaxNumbers : allNormalisedPhoneNumbers;

            // --- Detect internal duplicates within the same tag ---
            const formattedNumbers = validatedNumbers.map(n => n.format('INTERNATIONAL'));
            const uniqueFormattedSet = [...new Set(formattedNumbers)];
            if (uniqueFormattedSet.length < formattedNumbers.length) {
                tagShouldBeFlaggedForRemoval = true;
                hasInternalDuplicate = true;
                suggestedFix = uniqueFormattedSet.map((number) => {
                    return getFormattedNumber(
                        parsePhoneNumber(number, countryCode),
                        countryCode,
                        !TOLL_FREE_AS_NATIONAL_COUNTRIES.includes(countryCode)
                    );
                }).join('; ');
            }

            // --- Detect duplicates across tags ---
            for (const phoneNumber of validatedNumbers) {
                // Skip duplicate detection only if unfixable invalid
                if (validationResult.isInvalid && !validationResult.isAutoFixable) continue;
                // Skip duplicate detection for whatsapp numbers
                if (tag === 'contact:whatsapp') continue;

                const normalisedNumber = getFormattedNumber(
                    phoneNumber,
                    countryCode,
                    !TOLL_FREE_AS_NATIONAL_COUNTRIES.includes(countryCode)
                ).replace(getSpacingRegex(countryCode), '');

                // Correct the tag of a mismatch type number early
                const normalisedMismatch = validationResult.mismatchTypeNumbers.map(number =>
                    number.replace(getSpacingRegex(countryCode), '')
                );
                const isMismatchNumber = validationResult.mismatchTypeNumbers && normalisedMismatch.includes(normalisedNumber);
                if (isMismatchNumber && allNormalisedNumbers.get(normalisedNumber)) {
                    duplicateMismatchCount++;
                }

                const existingTag = allNormalisedNumbers.get(normalisedNumber);

                if (existingTag) {
                    const tagToRemove = keyToRemove(tag, existingTag);
                    const keptTag = tagToRemove === tag ? existingTag : tag;
                    const currentItem = getOrCreateItem(true);

                    currentItem.invalidNumbers.set(tagToRemove, tags[tagToRemove]);
                    currentItem.duplicateNumbers.set(tagToRemove, keptTag);

                    // Get fixes for tagToRemove and only mark null if there are no other values
                    const removeTagToValidate = currentItem.suggestedFixes.get(tagToRemove) ? currentItem.suggestedFixes.get(tagToRemove) : tags[tagToRemove];
                    const validatedRemoved = validateSingleTag(removeTagToValidate, countryCode, tags, tagToRemove);
                    if (validatedRemoved.suggestedNumbersList) {
                        const normalisedRemoved = validatedRemoved.suggestedNumbersList.map(number =>
                            number.replace(getSpacingRegex(countryCode), '')
                        );
                        let removedValue = null;
                        const deduplicatedRemoved = normalisedRemoved.filter(item => item !== normalisedNumber);
                        if (deduplicatedRemoved) {
                            const dedupValidatedRemoved = validateSingleTag(deduplicatedRemoved.join('; '), countryCode, tags, tagToRemove);
                            removedValue = dedupValidatedRemoved.suggestedNumbersList.join('; ');
                        }
                        if (removedValue && !hasInternalDuplicate) {
                            currentItem.suggestedFixes.set(tagToRemove, removedValue);
                            suggestedFix = removedValue;
                        } else if (!hasInternalDuplicate) {
                            currentItem.suggestedFixes.set(tagToRemove, null);
                            suggestedFix = null;
                        }
                    }

                    // Validate the kept tag in case of bad separator or duplicates and also to fix formatting while here
                    const validatedKept = validateSingleTag(tags[keptTag], countryCode, tags, keptTag);
                    if (validatedKept.suggestedNumbersList) {
                        const formattedKeptNumbers = validatedKept.validNumbersList.map(n => n.format('INTERNATIONAL'));
                        const uniqueFormattedKeptSet = [...new Set(formattedKeptNumbers)];
                        const validatedKeptValue = uniqueFormattedKeptSet.map((number) => {
                            return getFormattedNumber(
                                parsePhoneNumber(number, countryCode),
                                countryCode,
                                !TOLL_FREE_AS_NATIONAL_COUNTRIES.includes(countryCode)
                            );
                        }).join('; ');

                        if (validatedKeptValue !== tags[keptTag]) {
                            currentItem.suggestedFixes.set(keptTag, validatedKeptValue);
                        }
                    }
                    // Mark the kept one as invalid to display the duplicate to the user
                    currentItem.invalidNumbers.set(keptTag, tags[keptTag]);

                    if (tagToRemove in item.mismatchTypeNumbers) {
                        currentItem.hasTypeMismatch = false;
                        currentItem.mismatchTypeNumbers.delete(tagToRemove);
                    }

                    // Update normalised record to reflect the kept tag
                    allNormalisedNumbers.set(normalisedNumber, keptTag);

                    if (tagToRemove === tag) tagShouldBeFlaggedForRemoval = true;
                } else {
                    allNormalisedNumbers.set(normalisedNumber, tag);
                }
            }

            // --- Handle invalid or fixable numbers ---
            const isInvalid = validationResult.isInvalid;
            const autoFixable = validationResult.isAutoFixable;

            if (
                isInvalid &&
                autoFixable &&
                !tagShouldBeFlaggedForRemoval &&
                validationResult.suggestedNumbersList.length > 0
            ) {
                suggestedFix = validationResult.suggestedNumbersList.join('; ');
            }

            // --- Record invalid entries ---
            if (isInvalid || tagShouldBeFlaggedForRemoval) {
                const currentItem = getOrCreateItem(autoFixable);
                currentItem.invalidNumbers.set(tag, phoneTagValue);

                if (tagShouldBeFlaggedForRemoval) {
                    currentItem.suggestedFixes.set(tag, suggestedFix ?? null);
                } else {
                    currentItem.suggestedFixes.set(tag, suggestedFix);
                }

                // Add type mismatch info only if there are any non-duplicates
                if (validationResult.mismatchTypeNumbers.length > duplicateMismatchCount) {
                    if (!tagShouldBeFlaggedForRemoval) {
                        currentItem.hasTypeMismatch = true;
                        currentItem.mismatchTypeNumbers.set(tag, validationResult.mismatchTypeNumbers.join('; '));
                    }
                }

                if (
                    validationResult.validPhonewords
                    && autoFixable && !tagShouldBeFlaggedForRemoval && validationResult.suggestedNumbersList.length > 0
                ) {
                    currentItem.invalidNumbers.set('phone:mnemonic', null)
                    currentItem.suggestedFixes.set('phone:mnemonic', phoneTagValue)
                }

                currentItem.autoFixable = currentItem.autoFixable && autoFixable;
            }

            // Record foreign entries
            if (validationResult.validForeignNumbersMap.size > 0) {
                foreignCount += validationResult.validForeignNumbersMap.size;
                const currentForeignItem = getOrCreateForeignItem();
                currentForeignItem.validForeignNumbers.set(tag, validationResult.validForeignNumbersMap);
            }
        }

        if (item) {
            const safeEdit = isSafeItemEdit(item, countryCode);
            invalidCount++;
            autoFixableCount += item.autoFixable;
            safeEditCount += safeEdit;

            processMismatches(item, countryCode);

            const finalItem = {
                ...item,
                safeEdit: safeEdit
            };
            
            if (!isFirstItem) {
                fileStream.write(',\n');
            }
            
            // Convert Maps and nested Maps
            fileStream.write(JSON.stringify(finalItem, (key, value) => {
                if (value instanceof Map) {
                    return Object.fromEntries(value);
                }
                return value;
            }));
            isFirstItem = false;
        }

        if (foreignItem) {
            if (!isFirstItem) {
                fileStream.write(',\n');
            }
            
            // Convert Maps and nested Maps
            fileStream.write(JSON.stringify(foreignItem, (key, value) => {
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

    return { totalCount, invalidCount, autoFixableCount, foreignCount, safeEditCount };
}


module.exports = {
    validateNumbers,
    phoneTagToUse,
    stripStandardExtension,
    getStandardExtension,
    isStandardExtension,
    getNumberAndExtension,
    processSingleNumber,
    validateSingleTag,
    checkExclusions,
    keyToRemove,
    isSafeEdit,
    isSafeItemEdit,
    getWhatsappNumber,
    isWhatsappUrl,
    isItalianMissingZeroNumber,
    isSlashSpace,
};
