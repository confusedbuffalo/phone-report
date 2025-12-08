const fs = require('fs');
const { parsePhoneNumber } = require('libphonenumber-js/max');
const { getBestPreset, getGeometry } = require('./preset-matcher');
const {
    FEATURE_TAGS,
    HISTORIC_AND_DISUSED_PREFIXES,
    EXCLUSIONS,
    MOBILE_TAGS,
    WEBSITE_TAGS,
    BAD_SEPARATOR_REGEX,
    UNIVERSAL_SPLIT_REGEX,
    UNIVERSAL_SPLIT_REGEX_DE,
    EXTENSION_REGEX,
    DE_EXTENSION_REGEX,
    PHONE_TAG_PREFERENCE_ORDER,
    NANP_COUNTRY_CODES,
    ACCEPTABLE_EXTENSION_FORMATS,
    TOLL_FREE_AS_NATIONAL_COUNTRIES,
    ALL_NUMBER_TAGS,
    FAX_TAGS,
    NON_STANDARD_COST_TYPES,
    INVALID_SPACING_CHARACTERS_REGEX,
} = require('./constants');
const { PhoneNumber } = require('libphonenumber-js');

const MobileStatus = {
    MOBILE: 'mobile',
    NOT_MOBILE: 'not mobile',
    UNKNOWN: 'unknown',
};

/**
 * Converts a country or region name into a 'safe' string (slug) suitable for
 * use as filenames, URLs, or command-line identifiers.
 *
 * This function uses Unicode property escapes (\p{L} and \p{N}) to robustly
 * preserve all letters and numbers across all world scripts (including accented
 * Latin and non-Latin scripts like Japanese/Cyrillic).
 *
 * @param {string} name - The country or region name to convert.
 * @returns {string} The safe, slugified string.
 */
function safeName(name) {
    if (!name) {
        return '';
    }

    let processedName = name;

    // Convert to lowercase
    processedName = processedName.toLowerCase();

    // Substitute non-letter (\p{L}), non-number (\p{N}), and non-space (\s) characters with a hyphen.
    // The 'gu' flags enable global replacement and robust Unicode handling.
    // This step preserves all letters/numbers across all scripts and substitutes all symbols.
    // Note: If running in a very old JS environment that doesn't support \p{L}, this may fail.
    try {
        processedName = processedName.replace(/[^\p{L}\p{N}\s]+/gu, '-');
    } catch (e) {
        // Fallback for environments lacking full Unicode property support
        // This regex is less precise but covers most common use cases
        processedName = processedName.replace(/[^a-z0-9\s\u00C0-\uFFFF]+/g, '-');
    }

    // Replace one or more spaces with a hyphen.
    processedName = processedName.replace(/\s+/g, '-');

    // Remove repeated substitutes (e.g., '--' becomes '-')
    processedName = processedName.replace(/-+/g, '-');

    // Remove substitutes appearing at the start or end of the string.
    processedName = processedName.replace(/^-|-$/g, '');

    return processedName;
}

/**
 * Determines if an OSM feature should be considered disused.
 * It checks for various prefixed tags.
 * An item is not considered disused if it has a primary feature tag (e.g. `amenity`).
 * @param {object} item - An OSM object including allTags.
 * @returns {boolean} True if the feature is considered disused.
 */
function isDisused(item) {
    const featureType = getFeatureType(item);
    if (featureType) {
        return false
    }

    for (const prefix of HISTORIC_AND_DISUSED_PREFIXES) {
        for (const tag of FEATURE_TAGS) {
            if (item.allTags[`${prefix}:${tag}`]) {
                return true
            }
        }
    }
    return false
}

/**
 * Determines a feature's primary type value from its OSM tags.
 * For example, for a feature with `amenity=restaurant`, it returns 'restaurant'.
 * @param {object} item - An OSM object including allTags.
 * @returns {string|null} The value of the most relevant feature tag, or null if not found.
 */
function getFeatureType(item) {
    for (const tag of FEATURE_TAGS) {
        if (item.allTags[tag]) {
            return item.allTags[tag];
        }
    }
    return null
}

/**
 * Determines a readable feature name from OSM tags.
 * If the feature has a `name` tag, it is returned. Otherwise, it attempts to find a
 * descriptive name from presets, or falls back to a formatted feature type.
 * @param {object} item - An OSM object including allTags.
 * @param {string} locale - The locale for translating preset names.
 * @returns {string} A displayable name for the feature.
 */
function getFeatureTypeName(item, locale) {
    if (item.name) {
        return `${item.name}`;
    }

    const preset = getBestPreset(item, locale);
    if (preset && preset.name) {
        return preset.name;
    }

    const formattedType = item.type.replace(/\b\w/g, c => c.toUpperCase());
    return `OSM ${formattedType}`;
}

/**
 * Gets the icon for a feature based on its tags.
 * It first tries to find a matching preset icon. If none is found, it falls back
 * to a generic icon based on the feature's geometry (point, line, area, or relation).
 * @param {Object} item - The OSM data item.
 * @param {string} locale - The locale used for preset matching.
 * @returns {string} The icon name (e.g., 'iD-icon-point', 'maki-restaurant').
 */
function getFeatureIcon(item, locale) {
    const preset = getBestPreset(item, locale);
    if (preset && preset.icon) {
        return preset.icon;
    }
    const geometry = getGeometry(item);
    if (geometry === 'point') {
        return "iD-icon-point"
    } else if (geometry === 'area') {
        return 'iD-icon-area'
    } else if (geometry === 'line') {
        return 'iD-icon-line'
    } else {
        return 'iD-icon-relation'
    }
}

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
    // DE: no dashes or hyphens (due to extensions), but include slash (used as grouping separator)
    const SAFE_CHARACTER_REGEX =
        countryCode === 'DE'
            ? /^[\d\s\(\)+\./\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u2069]+$/g
            : /^[\d\s\(\)+\.\-−‐‑‒–—\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u2069]+$/g;

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
    const normalizedOriginal = numberStr.replace(getSpacingRegex(countryCode), '');

    // See https://github.com/confusedbuffalo/phone-report/issues/18
    if (countryCode === 'FR') {
        // libphonenumbers-js doesn't support the short number check
        // but that would catch emergency numbers which probably shouldn't be mapped anyway
        const isValidShortNumberFr = (
            (coreNationalNumber.length === 4 && coreNationalNumber.at(0) === '3')
            || (coreNationalNumber.length === 4 && coreNationalNumber.at(0) === '1')
        )
        if (isValidShortNumberFr) {
            return {
                isInvalid: !(normalizedOriginal === coreNationalNumber),
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
                            isInvalid: !(normalizedOriginal === coreNationalNumber),
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
    // DIN format has hyphen then 1-5 digits for extensions
    if (countryCode === 'DE') {
        const match = numberStr.match(DE_EXTENSION_REGEX);
        if (match && match[1] && match[2] && match[3]) {
            try {
                const preHyphenNumber = parsePhoneNumber(match[1], countryCode);
                const isHyphen = match[2] === '-';
                const extensionDigits = match[3].replace(/[^\d]/, '');
                // Only consider this as an extension if the number before it is valid as a number
                // (since hyphens may have been used as separators in a non-extension number)
                if (preHyphenNumber.isValid() && extensionDigits && extensionDigits.length <= 5) {
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

    // Append the extension in the standard format (' x{ext}' or DIN format for DE)
    const extension = phoneNumber.ext ?
        (countryCode === 'DE' ? `-${phoneNumber.ext}` : ` x${phoneNumber.ext}`)
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
    }
    return {
        cleanNumberStr: cleanNumberStr,
        validNonNumber: isValidWhatsappUrl
    }
}

/**
 * Validates a single phone number string using libphonenumber-js.
 * @param {string} numberStr - The phone number string to validate.
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @param {string} tag - The OSM phone tag being used for this number
 * @returns {{phoneNumber: phoneNumber, isInvalid: boolean, suggestedFix: string|null, autoFixable: boolean, typeMismatch: boolean}}
 */
function processSingleNumber(numberStr, countryCode, osmTags = {}, tag) {
    let suggestedFix = null;
    let autoFixable = true;
    let isInvalid = false;
    let typeMismatch = false;
    let phoneNumber = null;

    const spacingRegex = getSpacingRegex(countryCode);

    if (numberStr.startsWith('++')) {
        numberStr = numberStr.slice(1);
        isInvalid = true;
    }

    if (numberStr.match(INVALID_SPACING_CHARACTERS_REGEX)) {
        isInvalid = true;
    }

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
    }

    const { coreNumber, extension, hasStandardExtension } = getNumberAndExtension(numberStr.replace(INVALID_SPACING_CHARACTERS_REGEX, " "), countryCode);
    const standardisedNumber = extension ? `${coreNumber} x${extension}` : coreNumber;

    try {
        phoneNumber = parsePhoneNumber(standardisedNumber, countryCode);

        const exclusionResult = checkExclusions(phoneNumber, numberStr, countryCode, osmTags);
        if (exclusionResult) {
            return exclusionResult;
        }

        const normalizedOriginal = coreNumber.replace(spacingRegex, '');

        let normalizedParsed = '';

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
            normalizedParsed = phoneNumber.number.replace(spacingRegex, '');

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
                const normalizedTollFree = suggestedFix.replace(spacingRegex, '');
                numbersMatch = normalizedOriginal === normalizedTollFree;
            }
            numbersMatch = numbersMatch || normalizedOriginal === normalizedParsed;

            isInvalid = isInvalid || !numbersMatch || isPolishPrefixed || isItalianMissingZero;

            if (phoneNumber.ext && !hasStandardExtension) {
                isInvalid = true;
            }
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
    // so it is not clear what the correct fix should be
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

    return { phoneNumber, isInvalid, suggestedFix, autoFixable, typeMismatch };
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
 * @property {phoneNumber} validNumbersList - A list of all valid phone numbers found in the tag.
 */
function validateSingleTag(tagValue, countryCode, osmTags, tag) {
    const originalTagValue = tagValue.trim();

    // Check if a bad separator was used
    const hasBadSeparator = tag === 'contact:whatsapp' ? false : originalTagValue.match(BAD_SEPARATOR_REGEX);
    const hasBadExtension = originalTagValue.match(/, ext|\\;ext=/gi);

    splitRegex = countryCode === 'DE' ? UNIVERSAL_SPLIT_REGEX_DE : UNIVERSAL_SPLIT_REGEX;

    // Single-step splitting: The regex finds all separators and removes them.
    const numberList = tag === 'contact:whatsapp'
        ? originalTagValue.split(';')
        : originalTagValue.replace('\\;ext=', ' ext ').replace('\\;=ext=', ' ext ').split(splitRegex);
    const numbers = numberList
        .map(s => s.trim())
        .filter(s => s.length > 0);

    let hasIndividualInvalidNumber = false;

    const tagValidationResult = {
        isInvalid: false,
        isAutoFixable: true,
        suggestedNumbersList: [],
        mismatchTypeNumbers: [],
        numberOfValues: 0,
        validNumbersList: []
    };

    let hasTypeMismatch = false;

    numbers.forEach(numberStr => {
        tagValidationResult.numberOfValues++;

        const validationResult = processSingleNumber(numberStr, countryCode, osmTags, tag);
        const { phoneNumber, isInvalid, suggestedFix, autoFixable, typeMismatch } = validationResult;

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
 * @param {Array<Object>} elements - OSM elements with phone tags.
 * @param {string} countryCode - The country code for validation.
 * @param {string} tmpFilePath - The temporary file path to store the invalid items.
 * @returns {{invalidNumbers: Array<Object>, totalNumbers: number}}
 */
async function validateNumbers(elementStream, countryCode, tmpFilePath) {
    const fileStream = fs.createWriteStream(tmpFilePath);
    fileStream.write('[\n');
    let isFirstItem = true;

    let totalNumbers = 0;
    let invalidCount = 0;
    let autoFixableCount = 0;
    let safeEditCount = 0;

    for await (const element of elementStream) {
        if (!element.tags) continue;
        const tags = element.tags;

        let item = null;
        const allNormalizedPhoneNumbers = new Map();
        const allNormalizedFaxNumbers = new Map();

        const getOrCreateItem = (autoFixable) => {
            if (item) return item;

            let website = WEBSITE_TAGS.map(tag => tags[tag]).find(url => url);
            if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
                website = `http://${website}`;
            }
            const lat = element.lat || (element.center && element.center.lat);
            const lon = element.lon || (element.center && element.center.lon);
            const couldBeArea =
                element.type === 'way' &&
                element.nodes &&
                element.nodes.at(0) === element.nodes.at(-1);

            const baseItem = {
                type: element.type,
                id: element.id,
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
            };
            item = { ...baseItem, autoFixable };
            return item;
        };

        for (const tag of ALL_NUMBER_TAGS) {
            if (!tags[tag]) continue;

            const phoneTagValue = tags[tag];
            if (tag === 'mobile' && phoneTagValue === 'yes') continue;

            const validationResult = validateSingleTag(phoneTagValue, countryCode, tags, tag);
            totalNumbers += validationResult.numberOfValues;

            const validatedNumbers = validationResult.validNumbersList;
            let tagShouldBeFlaggedForRemoval = false;
            let hasInternalDuplicate = false;
            let suggestedFix = null;
            let duplicateMismatchCount = 0;

            const allNormalizedNumbers = FAX_TAGS.includes(tag) ? allNormalizedFaxNumbers : allNormalizedPhoneNumbers;

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

                const normalizedNumber = getFormattedNumber(
                    phoneNumber,
                    countryCode,
                    !TOLL_FREE_AS_NATIONAL_COUNTRIES.includes(countryCode)
                ).replace(getSpacingRegex(countryCode), '');

                // Correct the tag of a mismatch type number early
                const normalizedMismatch = validationResult.mismatchTypeNumbers.map(number =>
                    number.replace(getSpacingRegex(countryCode), '')
                );
                const isMismatchNumber = validationResult.mismatchTypeNumbers && normalizedMismatch.includes(normalizedNumber);
                if (isMismatchNumber && allNormalizedNumbers.get(normalizedNumber)) {
                    duplicateMismatchCount++;
                }

                const existingTag = allNormalizedNumbers.get(normalizedNumber);

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
                        const normalizedRemoved = validatedRemoved.suggestedNumbersList.map(number =>
                            number.replace(getSpacingRegex(countryCode), '')
                        );
                        let removedValue = null;
                        const deduplicatedRemoved = normalizedRemoved.filter(item => item !== normalizedNumber);
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

                    // Update normalized record to reflect the kept tag
                    allNormalizedNumbers.set(normalizedNumber, keptTag);

                    if (tagToRemove === tag) tagShouldBeFlaggedForRemoval = true;
                } else {
                    allNormalizedNumbers.set(normalizedNumber, tag);
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

                currentItem.autoFixable = currentItem.autoFixable && autoFixable;
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
                safeEdit: safeEdit,
                invalidNumbers: Object.fromEntries(item.invalidNumbers),
                suggestedFixes: Object.fromEntries(item.suggestedFixes),
                mismatchTypeNumbers: Object.fromEntries(item.mismatchTypeNumbers),
                duplicateNumbers: Object.fromEntries(item.duplicateNumbers),
            };

            if (!isFirstItem) {
                fileStream.write(',\n');
            }
            fileStream.write(JSON.stringify(finalItem));
            isFirstItem = false;
        }
    }

    fileStream.write('\n]');
    fileStream.end();

    await new Promise(resolve => fileStream.on('finish', resolve));

    return { totalNumbers, invalidCount, autoFixableCount, safeEditCount };
}


module.exports = {
    safeName,
    validateNumbers,
    isDisused,
    getFeatureTypeName,
    getFeatureIcon,
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
};
