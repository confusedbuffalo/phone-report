const fs = require('fs');
const { parsePhoneNumber } = require('libphonenumber-js/max');
const { getBestPreset, getGeometry } = require('./preset-matcher');
const { FEATURE_TAGS, HISTORIC_AND_DISUSED_PREFIXES, EXCLUSIONS, MOBILE_TAGS, NON_MOBILE_TAGS, PHONE_TAGS, WEBSITE_TAGS, BAD_SEPARATOR_REGEX, UNIVERSAL_SPLIT_REGEX, UNIVERSAL_SPLIT_REGEX_DE, PHONE_TAG_PREFERENCE_ORDER } = require('./constants');

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
 * It checks standard feature tags first, then prefixed tags (e.g. `disused:amenity`).
 * @param {object} item - An OSM object including allTags.
 * @returns {string|null} The value of the most relevant feature tag, or null if not found.
 */
function getFeatureType(item) {
    for (const tag of FEATURE_TAGS) {
        if (item.allTags[tag]) {
            return item.allTags[tag];
        }
    }

    for (const prefix of HISTORIC_AND_DISUSED_PREFIXES) {
        for (const tag of FEATURE_TAGS) {
            if (item.allTags[`${prefix}:${tag}`]) {
                return item.allTags[tag];
            }
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

    const featureType = getFeatureType(item);

    if (featureType) {
        const formattedType = featureType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `${formattedType}`;
    } else {
        const formattedType = item.type.replace(/\b\w/g, c => c.toUpperCase());
        return `OSM ${formattedType}`;
    }
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
 * Strips phone number extensions (x, ext, etc.) and non-dialable characters 
 * to isolate the core number for comparison.
 * @param {string} numberStr 
 * @returns {string} The core number string without the extension.
 */
function stripExtension(numberStr) {
    // Regex matches common extension prefixes: x, ext, extension, etc.
    // It captures everything before the extension marker.
    const extensionRegex = /^(.*?)(?:[xX]|[eE][xX][tT]|\s*\(ext|extension\)\s*).*$/;
    const match = numberStr.match(extensionRegex);

    // If an extension is found, return the part before it (trimmed).
    if (match && match[1]) {
        return match[1].trim();
    }
    // Otherwise, return the original string.
    return numberStr;
}

/**
 * Gets the relevant regex for valid spacing in the given country code.
 * @param {string} countryCode - The country code.
 * @returns {RegExp} - The regular expression to use for spacing validation.
 */
function getSpacingRegex(countryCode) {
    return countryCode === 'US' ? /[\s-]/g : /\s/g;
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
    if (
        countryCode === 'FR'
        && coreNationalNumber.length === 4
        && coreNationalNumber.at(0) === '3'
    ) {
        return {
            isInvalid: !(normalizedOriginal === coreNationalNumber),
            autoFixable: true,
            suggestedFix: coreNationalNumber
        };
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

    const NON_STANDARD_EXT_PREFIX_REGEX = /([eE][xX][tT])|(\s*\([eE][xX][tT]\)\s*)/;
    const hasNonStandardExtension = NON_STANDARD_EXT_PREFIX_REGEX.test(numberStr);
    const spacingRegex = getSpacingRegex(countryCode);

    if (numberStr.startsWith('++')) {
        numberStr = numberStr.slice(1);
        isInvalid = true;
    }

    try {
        phoneNumber = parsePhoneNumber(numberStr, countryCode);

        const exclusionResult = checkExclusions(phoneNumber, numberStr, countryCode, osmTags);
        if (exclusionResult) {
            return exclusionResult;
        }

        // Strip the extension from the original string for normalization
        const numberToValidate = stripExtension(numberStr);
        const normalizedOriginal = numberToValidate.replace(spacingRegex, '');

        let normalizedParsed = '';

        // See https://github.com/confusedbuffalo/phone-report/issues/15
        const isPolishPrefixed = (
            countryCode === 'PL'
            && phoneNumber
            && !phoneNumber.isValid()
            && phoneNumber.isPossible
            && phoneNumber.nationalNumber.startsWith('0')
        )

        if (phoneNumber) {
            const coreNumberE164 = isPolishPrefixed
                ? `+48 ${phoneNumber.nationalNumber.slice(1)}`
                : phoneNumber.number;

            const coreFormatted = parsePhoneNumber(coreNumberE164).format('INTERNATIONAL');
            // Append the extension in the standard format (' x{ext}').
            const extension = phoneNumber.ext ? ` x${phoneNumber.ext}` : '';

            suggestedFix = (() => {
                if (countryCode === 'US') {
                    // Use dashes as separator, but space after country code
                    const countryCodePrefix = `+${phoneNumber.countryCallingCode}`;

                    let nationalNumberFormatted = phoneNumber.format('NATIONAL');
                    nationalNumberFormatted = nationalNumberFormatted.replace(/[\(\)]/g, '').trim();
                    nationalNumberFormatted = nationalNumberFormatted.replace(/\s/g, '-');

                    // National number has extension in it for US
                    nationalNumberFormatted = nationalNumberFormatted.replace('-ext.-', ' ext. ');
                    return `${countryCodePrefix} ${nationalNumberFormatted}`;
                } else {
                    return coreFormatted + extension;
                }
            })();
        }

        if (phoneNumber && (phoneNumber.isValid() || isPolishPrefixed)) {
            normalizedParsed = phoneNumber.number.replace(spacingRegex, '');

            if (MOBILE_TAGS.includes(tag)) {
                const mobileStatus = checkMobileStatus(phoneNumber);
                if (mobileStatus === MobileStatus.NOT_MOBILE) {
                    isInvalid = true;
                    autoFixable = true;
                    typeMismatch = true;
                }
            }

            isInvalid = isInvalid || normalizedOriginal !== normalizedParsed || isPolishPrefixed;

            if (phoneNumber.ext && hasNonStandardExtension) {
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
    const hasBadSeparator = originalTagValue.match(BAD_SEPARATOR_REGEX);

    splitRegex = countryCode === 'DE' ? UNIVERSAL_SPLIT_REGEX_DE : UNIVERSAL_SPLIT_REGEX;

    // Single-step splitting: The regex finds all separators and removes them.
    const numbers = originalTagValue
        .split(splitRegex)
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
        if (hasBadSeparator || hasTypeMismatch) {
            tagValidationResult.isAutoFixable = tagValidationResult.isAutoFixable && true;
        }
    }

    return tagValidationResult;
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

    for await (const element of elementStream) {
        if (!element.tags) continue;
        const tags = element.tags;

        let item = null;
        const allNormalizedNumbers = new Map();

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

        for (const tag of PHONE_TAGS) {
            if (!tags[tag]) continue;
            const phoneTagValue = tags[tag];
            if (tag === 'mobile' && phoneTagValue === 'yes') continue;

            const validationResult = validateSingleTag(phoneTagValue, countryCode, tags, tag);
            totalNumbers += validationResult.numberOfValues;

            const validatedNumbers = validationResult.validNumbersList;
            let tagShouldBeFlaggedForRemoval = false;
            let suggestedFix = null;

            // --- Detect internal duplicates within the same tag ---
            const formattedNumbers = validatedNumbers.map(n => n.format('INTERNATIONAL'));
            const uniqueFormattedSet = [...new Set(formattedNumbers)];
            if (uniqueFormattedSet.length < formattedNumbers.length) {
                tagShouldBeFlaggedForRemoval = true;
                suggestedFix = uniqueFormattedSet.join('; ');
            }

            // --- Detect duplicates across tags ---
            for (const phoneNumber of validatedNumbers) {
                // Skip duplicate detection only if unfixable invalid
                if (validationResult.isInvalid && !validationResult.isAutoFixable) continue;

                // Normalise including extension (so different extensions remain distinct)
                const normalizedNumber = (
                    phoneNumber.number + (phoneNumber.ext ? `x${phoneNumber.ext}` : '')
                ).replace(getSpacingRegex(countryCode), '');
                const existingTag = allNormalizedNumbers.get(normalizedNumber);

                if (existingTag) {
                    const tagToRemove = keyToRemove(tag, existingTag);
                    const keptTag = tagToRemove === tag ? existingTag : tag;
                    const currentItem = getOrCreateItem(true);

                    currentItem.invalidNumbers.set(tagToRemove, tags[tagToRemove]);
                    currentItem.duplicateNumbers.set(tagToRemove, tags[tagToRemove]);
                    currentItem.suggestedFixes.set(tagToRemove, null);
                    currentItem.suggestedFixes.set(keptTag, tags[keptTag]);
                    currentItem.hasTypeMismatch = false;
                    currentItem.mismatchTypeNumbers.delete(tagToRemove);

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
                    currentItem.duplicateNumbers.set(tag, phoneTagValue);
                } else {
                    currentItem.suggestedFixes.set(tag, suggestedFix);
                }

                // Add type mismatch info only if not a duplicate
                if (
                    validationResult.mismatchTypeNumbers.length > 0 &&
                    !currentItem.duplicateNumbers.has(tag)
                ) {
                    currentItem.hasTypeMismatch = true;
                    currentItem.mismatchTypeNumbers.set(tag, validationResult.mismatchTypeNumbers.join('; '));
                }

                currentItem.autoFixable = currentItem.autoFixable && autoFixable;
            }
        }

        if (item) {
            invalidCount++;
            if (item.autoFixable) {
                autoFixableCount++;
            }

            const finalItem = {
                ...item,
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

    return { totalNumbers, invalidCount, autoFixableCount };
}


module.exports = {
    safeName,
    validateNumbers,
    isDisused,
    getFeatureTypeName,
    getFeatureIcon,
    phoneTagToUse,
    stripExtension,
    processSingleNumber,
    validateSingleTag,
    checkExclusions,
    keyToRemove
};
