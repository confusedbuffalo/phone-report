import fs from 'fs';
import { parsePhoneNumber } from 'libphonenumber-js/max';
import { LRUCache } from 'lru-cache';
import {
    EXCLUSIONS,
    MOBILE_TAGS,
    BAD_SEPARATOR_REGEX,
    UNIVERSAL_SPLIT_REGEX,
    UNIVERSAL_SPLIT_REGEX_DIN,
    NANP_COUNTRY_CODES,
    FORCE_TOLL_FREE_AS_NATIONAL_COUNTRIES,
    ALL_NUMBER_TAGS,
    FAX_TAGS,
    INVALID_SPACING_CHARACTERS_REGEX,
    CAN_ADD_COUNTRY_CODE_TO_INCORRECT_LEADING_PLUS,
    COUNTRIES_WITH_PHONEWORDS,
    INCORRECT_PLUS_CAN_START_WITH_COUNTRY_CODE,
    CAN_REFORMAT_NUMBER_WITHOUT_SPACES,
    INVALID_SPACING_CHARACTERS_REGEX_TW,
    INVISIBLE_CHARACTERS,
    TOLL_FREE_AS_INTERNATIONAL_COUNTRIES,
} from './constants.js';
import { createBaseItem, mapReplacer } from './data-processor.js';
import { isSafeItemEdit } from './phone-safe-edits.js';
import {
    checkExclusions,
    checkMobileStatus,
    convertPhonewordToDigits,
    expandSlashEnding,
    fixPolishPrefixedNumber,
    getFormattedNumber,
    getNonStandardCostTypes,
    getNumberAndExtension,
    getSpacingRegex,
    getWhatsappNumber,
    insertMissingItalianZero,
    isItalianMissingZeroNumber,
    isPolishPrefixedNumber,
    isSlashSpace,
    keyToRemove,
    MobileStatus,
    numbersSemanticallyMatch,
    phoneTagToUse,
    shouldTollFreeBeInternational,
} from './phone-utils.js';

const phoneValidationCache = new LRUCache({
    max: 10000,
});

const invisibleCharactersRegex = new RegExp(`[${INVISIBLE_CHARACTERS}]`, 'g');

/**
 * Validates a single phone number string using libphonenumber-js.
 * @param {string} numberStr - The phone number string to validate.
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @param {string} tag - The OSM phone tag being used for this number
 * @returns {{phoneNumber: phoneNumber, isInvalid: boolean, suggestedFix: string|null, autoFixable: boolean, typeMismatch: boolean, validPhonewords: boolean, foreign: string|null}}
 */
export function processSingleNumber(numberStr, countryCode, osmTags = {}, tag) {
    let suggestedFix;
    let phoneNumber = null,
        foreign = null;
    let autoFixable = true;
    let isInvalid = false,
        typeMismatch = false,
        validPhonewords = false;

    if (numberStr.startsWith('++')) {
        numberStr = numberStr.slice(1);
        isInvalid = true;
    }

    // Fix number starting 1+ instead of +1 (somewhat common error)
    if (numberStr.match(/^1\+\s?\d.*/)) {
        numberStr = `+1${numberStr.slice(2)}`;
        isInvalid = true;
    }

    const invalidSpacingRegex =
        countryCode === 'TW' ? INVALID_SPACING_CHARACTERS_REGEX_TW : INVALID_SPACING_CHARACTERS_REGEX;

    if (!isInvalid && (numberStr.match(invalidSpacingRegex) || numberStr.match(invisibleCharactersRegex))) {
        isInvalid = true;
    }

    const couldBePhonewords = COUNTRIES_WITH_PHONEWORDS.includes(countryCode) && numberStr.match(/.*[a-z]$/i);

    if (tag === 'contact:whatsapp') {
        const { cleanNumberStr, validNonNumber } = getWhatsappNumber(numberStr);
        if (validNonNumber) {
            return {
                isInvalid: false,
            };
        } else if (numberStr !== cleanNumberStr) {
            numberStr = cleanNumberStr;
            isInvalid = true;
        }
    } else if (couldBePhonewords) {
        numberStr = convertPhonewordToDigits(numberStr);
        isInvalid = true;
    }

    const { coreNumber, extension, hasStandardExtension } = getNumberAndExtension(
        numberStr.replace(invalidSpacingRegex, ' ').replace(invisibleCharactersRegex, ''),
        countryCode
    );
    const standardisedNumber = extension ? `${coreNumber} x${extension}` : coreNumber;

    try {
        phoneNumber = parsePhoneNumber(standardisedNumber, countryCode);

        const exclusionResult = checkExclusions(phoneNumber, numberStr, countryCode, osmTags);
        if (exclusionResult) {
            return exclusionResult;
        }

        const isPolishPrefixed = isPolishPrefixedNumber(phoneNumber, countryCode);
        if (isPolishPrefixed) {
            phoneNumber = fixPolishPrefixedNumber(phoneNumber, countryCode);
            isInvalid = true;
        }
        const isItalianMissingZero = isItalianMissingZeroNumber(phoneNumber, countryCode);
        if (isItalianMissingZero) {
            phoneNumber = parsePhoneNumber(insertMissingItalianZero(numberStr));
            isInvalid = true;
        }

        if (phoneNumber && phoneNumber.isValid()) {
            const tollFreeAsInternational = shouldTollFreeBeInternational(phoneNumber, countryCode, numberStr);
            suggestedFix = getFormattedNumber(phoneNumber, tollFreeAsInternational);

            validPhonewords = !!couldBePhonewords;

            if (MOBILE_TAGS.includes(tag)) {
                const mobileStatus = checkMobileStatus(phoneNumber);
                if (mobileStatus === MobileStatus.NOT_MOBILE) {
                    isInvalid = true;
                    autoFixable = true;
                    typeMismatch = true;
                }
            }

            const numbersMatch = numbersSemanticallyMatch(
                phoneNumber,
                coreNumber,
                extension,
                countryCode,
                tollFreeAsInternational
            );

            if (CAN_REFORMAT_NUMBER_WITHOUT_SPACES.includes(countryCode)) {
                // Targets numbers with no spaces after the country code
                isInvalid = /^\+?\s?\d{4,}[\d\s]+$/.test(numberStr);
            }

            // Bad spacing: space after plus, multiple consecutive spaces/dashes
            isInvalid = isInvalid || /^\+\s.*$/.test(numberStr) || /\s{2,}/.test(numberStr) || /-{2,}/.test(numberStr);

            isInvalid = isInvalid || !numbersMatch;

            if (phoneNumber.ext && !hasStandardExtension) {
                isInvalid = true;
            }

            // Toll free numbers in all of NANP are parsed as US
            // It is not possible to tell the country from the phone number in this case
            const isNanpTollFree =
                NANP_COUNTRY_CODES.includes(countryCode) &&
                getNonStandardCostTypes(countryCode).includes(phoneNumber.getType()) &&
                phoneNumber.country === 'US';
            foreign =
                phoneNumber.country.toLowerCase() !== countryCode.toLowerCase() && !isNanpTollFree
                    ? phoneNumber.country
                    : null;
        } else {
            // The number is fundamentally invalid (e.g., too few digits)
            phoneNumber = null;
            isInvalid = true;
            suggestedFix = null;
            autoFixable = false;
        }
    } catch {
        // Parsing failed due to an exception (unfixable invalid number)
        isInvalid = true;
        autoFixable = false;
        suggestedFix = null;
    }

    // DE numbers do not have fixed length and could start with 49, but maybe a + was missed off
    // so it is not clear what the correct fix should be, whether adding 0 or adding +
    // see https://github.com/confusedbuffalo/phone-report/issues/78 and https://github.com/confusedbuffalo/phone-report/issues/53
    if (
        isInvalid &&
        autoFixable &&
        countryCode === 'DE' &&
        coreNumber.replace(/[^\d]/g, '').startsWith('49') &&
        !coreNumber.split('49')[0].includes('+')
    ) {
        autoFixable = false;
        suggestedFix = null;
    }

    return { phoneNumber, isInvalid, suggestedFix, autoFixable, typeMismatch, validPhonewords, foreign: foreign };
}

const nanpStandardFormatRegex = /^\+\(?\d\d\d\)?[ -]\d\d\d[ -]\d\d\d\d$/;

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
export function validateSingleTag(tagValue, countryCode, osmTags, tag) {
    const originalTagValue = tagValue.trim();

    // Check if a bad separator was used
    const hasBadSeparator = tag === 'contact:whatsapp' ? false : originalTagValue.match(BAD_SEPARATOR_REGEX);
    const hasBadExtension = originalTagValue.match(/, ext|\\;ext=/gi);

    let slashAsSpace = false;
    let slashForMultipleEndings = null;

    if (originalTagValue.includes('/')) {
        slashAsSpace = isSlashSpace(tagValue, countryCode, osmTags, tag);
        slashForMultipleEndings = expandSlashEnding(tagValue, countryCode, osmTags, tag);
    }

    const splitRegex = slashAsSpace ? UNIVERSAL_SPLIT_REGEX_DIN : UNIVERSAL_SPLIT_REGEX;

    // Single-step splitting: The regex finds all separators and removes them.
    const numberList =
        tag === 'contact:whatsapp'
            ? originalTagValue.split(';')
            : (slashForMultipleEndings ??
              originalTagValue.replace('\\;ext=', ' ext ').replace('\\;=ext=', ' ext ').split(splitRegex));
    const numbers = numberList.map(s => s.trim()).filter(s => s.length > 0);

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

        let validationResult;

        if (NANP_COUNTRY_CODES.includes(countryCode) && nanpStandardFormatRegex.test(numberStr)) {
            // see https://github.com/confusedbuffalo/phone-report/issues/295
            const noPlusValidationResult = processSingleNumber(numberStr.slice(1), countryCode, osmTags, tag);
            if (
                noPlusValidationResult.phoneNumber &&
                noPlusValidationResult.autoFixable &&
                NANP_COUNTRY_CODES.includes(noPlusValidationResult.phoneNumber.country)
            ) {
                validationResult = noPlusValidationResult;
            }
        } else {
            validationResult = processSingleNumber(numberStr, countryCode, osmTags, tag);
        }

        if (
            validationResult.isInvalid &&
            !validationResult.autoFixable &&
            numberStr.startsWith('+') &&
            CAN_ADD_COUNTRY_CODE_TO_INCORRECT_LEADING_PLUS.includes(countryCode)
        ) {
            // Some editors prompt an initial plus, but some mappers then just put the phone number in using national format, which is invalid
            const noPlusValidationResult = processSingleNumber(numberStr.slice(1), countryCode, osmTags, tag);
            const countryCodePrefix = noPlusValidationResult.phoneNumber?.format('INTERNATIONAL').split(' ')[0];
            if (
                (noPlusValidationResult.phoneNumber &&
                    noPlusValidationResult.autoFixable &&
                    noPlusValidationResult.phoneNumber.country === countryCode &&
                    INCORRECT_PLUS_CAN_START_WITH_COUNTRY_CODE.includes(countryCode)) ||
                !numberStr.startsWith(countryCodePrefix)
            ) {
                validationResult = noPlusValidationResult;
            }
        }

        const { phoneNumber, isInvalid, suggestedFix, autoFixable, typeMismatch, validPhonewords, foreign } =
            validationResult;

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
            if (tagValidationResult.numberOfValues === 1 && !tagValidationResult.validPhonewords) {
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

                const validatedSuggested = validateSingleTag(suggested, countryCode, item.allTags, tagToUse);
                const validatedMismatch = validateSingleTag(mismatchValue, countryCode, item.allTags, tagToUse);

                const allSuggested = [
                    ...validatedSuggested.suggestedNumbersList,
                    ...validatedMismatch.suggestedNumbersList,
                ];
                const suggestedSet = new Set(allSuggested);
                const filteredSuggested = Array.from(suggestedSet);

                if (
                    filteredSuggested.join('; ') === validatedSuggested.suggestedNumbersList.join('; ') &&
                    !item.suggestedFixes[mismatchKey]
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
export async function validateNumbers(elementStream, countryCode, tmpFilePath) {
    const baseCountryCode = countryCode.split('-')[0]; // In case of ISO 3166-2 region code being used at division level
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
            return {
                ...createBaseItem(element),
                invalidNumbers: new Map(),
                suggestedFixes: new Map(),
                hasTypeMismatch: false,
                mismatchTypeNumbers: new Map(),
                duplicateNumbers: new Map(),
                validForeignNumbers: new Map(),
            };
        };

        const getOrCreateItem = autoFixable => {
            if (item) return item;

            const baseItem = createItem();
            item = { ...baseItem, autoFixable };
            return item;
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

            // Only cache if the number cannot be an exclusion (to avoid dependency on osmTags context)
            const nationalNumberOnly = phoneTagValue.replace(/[^\d]/g, '');
            const countryExclusions = EXCLUSIONS[baseCountryCode];
            const canBeExclusion = countryExclusions && countryExclusions[nationalNumberOnly];

            const cacheKey = `${tag}|${baseCountryCode}|${phoneTagValue}`;
            let validationResult = !canBeExclusion ? phoneValidationCache.get(cacheKey) : null;

            if (validationResult) {
                validationResult = { ...validationResult };
            } else {
                validationResult = validateSingleTag(phoneTagValue, baseCountryCode, tags, tag);
                if (!canBeExclusion) {
                    phoneValidationCache.set(cacheKey, { ...validationResult });
                }
            }

            totalCount += validationResult.numberOfValues;

            const validatedNumbers = validationResult.validNumbersList;
            let tagShouldBeFlaggedForRemoval = false;
            let hasInternalDuplicate = false;
            let suggestedFix = null;
            let duplicateMismatchCount = 0;

            const allNormalisedNumbers = FAX_TAGS.includes(tag) ? allNormalisedFaxNumbers : allNormalisedPhoneNumbers;

            const tollFreeAsInternational =
                TOLL_FREE_AS_INTERNATIONAL_COUNTRIES.includes(baseCountryCode) ||
                !FORCE_TOLL_FREE_AS_NATIONAL_COUNTRIES.includes(baseCountryCode);

            // --- Detect internal duplicates within the same tag ---
            const formattedNumbers = validatedNumbers.map(n => n.format('INTERNATIONAL'));
            const uniqueFormattedSet = [...new Set(formattedNumbers)];
            if (uniqueFormattedSet.length < formattedNumbers.length) {
                tagShouldBeFlaggedForRemoval = true;
                hasInternalDuplicate = true;
                suggestedFix = uniqueFormattedSet
                    .map(number => {
                        return getFormattedNumber(parsePhoneNumber(number, baseCountryCode), tollFreeAsInternational);
                    })
                    .join('; ');
            }

            // --- Detect duplicates across tags ---
            for (const phoneNumber of validatedNumbers) {
                // Skip duplicate detection only if unfixable invalid
                if (validationResult.isInvalid && !validationResult.isAutoFixable) continue;
                // Skip duplicate detection for whatsapp numbers
                if (tag === 'contact:whatsapp') continue;

                const normalisedNumber = getFormattedNumber(phoneNumber, tollFreeAsInternational).replace(
                    getSpacingRegex(baseCountryCode),
                    ''
                );

                // Correct the tag of a mismatch type number early
                const normalisedMismatch = validationResult.mismatchTypeNumbers.map(number =>
                    number.replace(getSpacingRegex(baseCountryCode), '')
                );
                const isMismatchNumber =
                    validationResult.mismatchTypeNumbers && normalisedMismatch.includes(normalisedNumber);
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
                    const removeTagToValidate = currentItem.suggestedFixes.get(tagToRemove)
                        ? currentItem.suggestedFixes.get(tagToRemove)
                        : tags[tagToRemove];
                    const validatedRemoved = validateSingleTag(removeTagToValidate, baseCountryCode, tags, tagToRemove);
                    if (validatedRemoved.suggestedNumbersList) {
                        const normalisedRemoved = validatedRemoved.suggestedNumbersList.map(number =>
                            number.replace(getSpacingRegex(baseCountryCode), '')
                        );
                        let removedValue = null;
                        const deduplicatedRemoved = normalisedRemoved.filter(item => item !== normalisedNumber);
                        if (deduplicatedRemoved) {
                            const dedupValidatedRemoved = validateSingleTag(
                                deduplicatedRemoved.join('; '),
                                baseCountryCode,
                                tags,
                                tagToRemove
                            );
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
                    const validatedKept = validateSingleTag(tags[keptTag], baseCountryCode, tags, keptTag);
                    if (validatedKept.suggestedNumbersList) {
                        const formattedKeptNumbers = validatedKept.validNumbersList.map(n => n.format('INTERNATIONAL'));
                        const uniqueFormattedKeptSet = [...new Set(formattedKeptNumbers)];
                        const validatedKeptValue = uniqueFormattedKeptSet
                            .map(number => {
                                return getFormattedNumber(
                                    parsePhoneNumber(number, baseCountryCode),
                                    tollFreeAsInternational
                                );
                            })
                            .join('; ');

                        if (validatedKeptValue !== tags[keptTag]) {
                            currentItem.suggestedFixes.set(keptTag, validatedKeptValue);
                        }
                    }
                    // Mark the kept one as invalid to display the duplicate to the user
                    currentItem.invalidNumbers.set(keptTag, tags[keptTag]);

                    if (item.mismatchTypeNumbers.has(tagToRemove)) {
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

                if (validationResult.validPhonewords) {
                    currentItem.validPhonewords = true;
                }

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
                    validationResult.validPhonewords &&
                    autoFixable &&
                    !tagShouldBeFlaggedForRemoval &&
                    validationResult.suggestedNumbersList.length > 0
                ) {
                    currentItem.invalidNumbers.set('phone:mnemonic', null);
                    currentItem.suggestedFixes.set('phone:mnemonic', phoneTagValue);
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
            const safeEdit = isSafeItemEdit(item, baseCountryCode);
            invalidCount++;
            autoFixableCount += item.autoFixable;
            safeEditCount += safeEdit;

            processMismatches(item, baseCountryCode);

            const finalItem = {
                ...item,
                safeEdit: safeEdit,
            };

            if (!isFirstItem) {
                fileStream.write(',\n');
            }

            // Convert Maps and nested Maps
            fileStream.write(JSON.stringify(finalItem, mapReplacer));
            isFirstItem = false;
        }

        if (foreignItem) {
            if (!isFirstItem) {
                fileStream.write(',\n');
            }

            // Convert Maps and nested Maps
            fileStream.write(JSON.stringify(foreignItem, mapReplacer));
            isFirstItem = false;
        }
    }

    fileStream.write('\n]');
    fileStream.end();

    await new Promise(resolve => fileStream.on('finish', resolve));

    return { totalCount, invalidCount, autoFixableCount, foreignCount, safeEditCount };
}
