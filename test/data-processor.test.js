const { Readable } = require('stream');
const os = require('os');
const path = require('path');
const fs = require('fs');
const {
    safeName,
    stripStandardExtension,
    checkExclusions,
    processSingleNumber,
    validateNumbers,
    getFeatureTypeName,
    isDisused,
    validateSingleTag,
    phoneTagToUse,
    keyToRemove,
    getStandardExtension,
    getNumberAndExtension,
    isSafeEdit,
    isSafeItemEdit,
    isStandardExtension,
    getWhatsappNumber,
    isItalianMissingZeroNumber
} = require('../src/data-processor');

const SAMPLE_COUNTRY_CODE_GB = 'GB';
const SAMPLE_COUNTRY_CODE_DE = 'DE';
const SAMPLE_COUNTRY_CODE_US = 'US';
const SAMPLE_COUNTRY_CODE_ZA = 'ZA';
const SAMPLE_COUNTRY_CODE_PL = 'PL';
const SAMPLE_COUNTRY_CODE_FR = 'FR';

// =====================================================================
// safeName Tests
// =====================================================================
describe('safeName', () => {
    // Array of tests: [input_name, expected_safe_name]
    const testCases = [
        // 1. Dual-Name Division with slash
        ["Ynys Môn / Isle of Anglesey", "ynys-môn-isle-of-anglesey"],
        
        // 2. Name with Accented character and hyphen (hyphen should be kept, apostrophe substituted)
        ["Côte-d'Or", "côte-d-or"], 
        
        // 3. Name starting with apostrophe/special character (should be stripped by strict/trim logic)
        ["'s-Hertogenbosch", "s-hertogenbosch"], 
        
        // 4. Non-Latin script (should be fully preserved)
        ["愛知県", "愛知県"], 

        // Additional edge cases:
        // Case with multiple separators and trailing/leading symbols
        ["(The) New Zealand, LTD.", "the-new-zealand-ltd"],

        // Case with mixed script and symbols
        ["Москва (Moscow) - 2024", "москва-moscow-2024"],
        
        // Case with repeated special characters
        ["United -- States", "united-states"],

        // Case with just an accented character
        ["Réunion", "réunion"],

        // Empty string
        ["", ""],
        
        // Null/Undefined input
        [null, ""],
    ];

    test.each(testCases)(
        'converts "%s" to "%s" correctly',
        (input, expected) => {
            // Ensure inputs like null/undefined are handled gracefully
            const result = safeName(input);
            expect(result).toBe(expected);
        },
    );
});

// =====================================================================
// isdisused Tests
// =====================================================================
describe("isDisused", () => {
    // Disused
    test('disused object is disused', () => {
        expect(isDisused({allTags: {'disused:amenity': 'cafe'}})).toBe(true)
    });

    test('historic object is disused', () => {
        expect(isDisused({allTags: {'historic:amenity': 'cafe'}})).toBe(true)
    });

    test('was object is disused', () => {
        expect(isDisused({allTags: {'was:amenity': 'cafe'}})).toBe(true)
    });

    test('abandoned object is disused', () => {
        expect(isDisused({allTags: {'abandoned:amenity': 'cafe'}})).toBe(true)
    });

    // Not disused
    test('regular object is not disused', () => {
        expect(isDisused({allTags: {'amenity': 'cafe'}})).toBe(false)
    });

    test('regular object with old disused tags is not disused', () => {
        expect(isDisused({allTags: {'amenity': 'cafe', 'was:amenity': 'place_of_worship'}})).toBe(false)
    });

    test('empty tags is not disused', () => {
        expect(isDisused({allTags: {}})).toBe(false)
    });
});

// =====================================================================
// stripStandardExtension Tests
// =====================================================================
describe('stripStandardExtension', () => {
    test('should strip an extension prefixed by "x"', () => {
        expect(stripStandardExtension('020 7946 0000 x123')).toBe('020 7946 0000');
    });

    test('should strip an extension prefixed by "ext"', () => {
        expect(stripStandardExtension('+44 20 7946 0000 ext. 456')).toBe('+44 20 7946 0000');
    });

    test('should strip an extension prefixed by "extension"', () => {
        expect(stripStandardExtension('+44 20 7946 0000 extension 456')).toBe('+44 20 7946 0000');
    });

    test('should return the original string if no extension is present', () => {
        expect(stripStandardExtension('0800 123 4567')).toBe('0800 123 4567');
    });
});


// =====================================================================
// getStandardExtension Tests
// =====================================================================
describe('getStandardExtension', () => {

    test('should extract a numeric extension prefixed by "x"', () => {
        expect(getStandardExtension('020 7946 0000 x123')).toBe('123');
    });

    test('should extract a numeric extension prefixed by uppercase "X"', () => {
        expect(getStandardExtension('020 7946 0000 X99')).toBe('99');
    });

    test('should extract a numeric extension prefixed by "ext."', () => {
        expect(getStandardExtension('+44 20 7946 0000 ext. 456')).toBe('456');
    });

    test('should extract a numeric extension prefixed by "ext" without a dot', () => {
        expect(getStandardExtension('1-800-CALL EXT500')).toBe('500');
    });

    test('should extract a numeric extension prefixed by uppercase "EXT."', () => {
        expect(getStandardExtension('123 EXT.789')).toBe('789');
    });

    test('should extract a numeric extension prefixed by "extension"', () => {
        expect(getStandardExtension('+44 20 7946 0000 extension 808')).toBe('808');
    });

    test('should extract an extension when prefixed by uppercase "EXTENSION"', () => {
        expect(getStandardExtension('Office Number EXTENSION 101')).toBe('101');
    });

    test('should return null if no extension prefix is present', () => {
        expect(getStandardExtension('0800 123 4567')).toBeNull();
    });
    
    test('should return null if the prefix is present but no digits follow', () => {
        expect(getStandardExtension('555-1212 x')).toBeNull();
    });

    test('should return null if the string is empty', () => {
        expect(getStandardExtension('')).toBeNull();
    });
});


// =====================================================================
// isStandardExtension Tests
// =====================================================================
describe('isStandardExtension', () => {

    // --- Cases expected to be TRUE (Standard Formats) ---

    test('should return true for "ext." with mandatory surrounding spaces', () => {
        expect(isStandardExtension('555-123-4567 ext. 101')).toBe(true);
        expect(isStandardExtension('1234 ext. 567')).toBe(true);
    });

    test('should return true for "x" with a leading space', () => {
        expect(isStandardExtension('(555) 123-4567 x101')).toBe(true);
        expect(isStandardExtension('1234 x567')).toBe(true);
    });

    test('should return true for "x" with no spaces', () => {
        expect(isStandardExtension('1234x567')).toBe(true);
    });


    // --- Cases expected to be FALSE (Non-Standard Formats that match the regex) ---
    
    test('should return false for "x" with a trailing space', () => {
        expect(isStandardExtension('1234 x 567')).toBe(false);
    });

    test('should return false for "ext." with missing trailing space', () => {
        expect(isStandardExtension('1234 ext.567')).toBe(false);
    });
    
    test('should return false for uppercase non-standard keywords (e.g., "EXTENSION")', () => {
        expect(isStandardExtension('1234 EXTENSION 567')).toBe(false);
    });

    test('should return false for full "extension" keyword (lowercase)', () => {
        expect(isStandardExtension('1234 extension 567')).toBe(false);
    });

    test('should return false for non-standard keyword (wewn)', () => {
        expect(isStandardExtension('1234 wewn 567')).toBe(false);
    });
    
    test('should return false for uppercase ext. or x in otherwise standard format', () => {
        expect(isStandardExtension('1234 EXT. 999')).toBe(false);
        expect(isStandardExtension('1234 X123')).toBe(false);
    });

    // --- Cases expected to be NULL (No valid extension found) ---

    test('should return null when no separator is present', () => {
        // No match for the full regex
        expect(isStandardExtension('1234567')).toBeNull();
    });
    
    test('should return null when the separator exists but no digits follow (ext.)', () => {
        expect(isStandardExtension('1234 ext. ')).toBeNull();
    });

    test('should return null when the separator exists but no digits follow (x)', () => {
        expect(isStandardExtension('1234x')).toBeNull();
    });

    test('should return null for an empty string or null input', () => {
        expect(isStandardExtension('')).toBeNull();
        expect(isStandardExtension(null)).toBeNull();
    });
});


// =====================================================================
// getNumberAndExtension Tests
// =====================================================================
describe('getNumberAndExtension', () => {

    // --- DE (German) Specific Tests (DIN Format) ---

    describe('DE Country Code (DIN Format)', () => {
        const countryCode = 'DE';

        test('should correctly parse DIN-style extension (1-4 digits) when core number is valid', () => {
            expect(getNumberAndExtension('+49 489 123456-789', countryCode)).toEqual({
                coreNumber: '+49 489 123456',
                extension: '789',
                hasStandardExtension: true,
            });
        });

        test('should correctly parse a 4-digit DIN extension', () => {
            expect(getNumberAndExtension('+49 489 1234-4321', countryCode)).toEqual({
                coreNumber: '+49 489 1234',
                extension: '4321',
                hasStandardExtension: true,
            });
        });

        test('should correctly parse a 4-digit DIN extension with en dash', () => {
            expect(getNumberAndExtension('+49 489 1234–4321', countryCode)).toEqual({
                coreNumber: '+49 489 1234',
                extension: '4321',
                hasStandardExtension: false,
            });
        });

        test('should correctly parse a 4-digit DIN extension with em dash', () => {
            expect(getNumberAndExtension('+49 489 1234—4321', countryCode)).toEqual({
                coreNumber: '+49 489 1234',
                extension: '4321',
                hasStandardExtension: false,
            });
        });

        test('should correctly parse a 4-digit DIN extension with spaces around hyphen', () => {
            expect(getNumberAndExtension('+49 489 1234 - 4321', countryCode)).toEqual({
                coreNumber: '+49 489 1234',
                extension: '4321',
                hasStandardExtension: false,
            });
        });

        test('should correctly parse a 4-digit DIN extension with spaces in the extension', () => {
            expect(getNumberAndExtension('+49 489 1234-43 21', countryCode)).toEqual({
                coreNumber: '+49 489 1234',
                extension: '4321',
                hasStandardExtension: true,
            });
        });

        test('should fall back to standard logic if DIN-style extension has more than 5 digits (and thus matches standard)', () => {
            expect(getNumberAndExtension('+49 489 123456-789012', countryCode)).toEqual({
                coreNumber: '+49 489 123456-789012',
                extension: null,
                hasStandardExtension: null,
            });
        });

        test('should fall back to standard logic if the core number fails validation', () => {
            expect(getNumberAndExtension('+49 123456-789', countryCode)).toEqual({
                coreNumber: '+49 123456-789',
                extension: null,
                hasStandardExtension: null,
            });
        });

        test('should fall back to standard logic if DE number has standard extension format (x, ext)', () => {
            expect(getNumberAndExtension('+49 489 123456 ext. 789', countryCode)).toEqual({
                coreNumber: '+49 489 123456',
                extension: '789',
                hasStandardExtension: true,
            });
        });

        test('should allow a 8 digit extension in AT', () => {
            expect(getNumberAndExtension('+43 1 71123-12345678', 'AT')).toEqual({
                coreNumber: '+43 1 71123',
                extension: '12345678',
                hasStandardExtension: true,
            });
        });

        test('should not allow a 9 digit extension in AT', () => {
            expect(getNumberAndExtension('+43 1 71123-123456789', 'AT')).toEqual({
                coreNumber: '+43 1 71123-123456789',
                extension: null,
                hasStandardExtension: null,
            });
        });
    });

    // --- Standard (Fallback) Tests (Any Country Code other than DE) ---

    describe('Standard Format)', () => {

        test('should handle "x" prefixed extension using standard logic (without space)', () => {
            expect(getNumberAndExtension('1-800-555-1212x456', 'US')).toEqual({
                coreNumber: '1-800-555-1212',
                extension: '456',
                hasStandardExtension: true,
            });
        });

        test('should handle "x" prefixed extension using standard logic (with space)', () => {
            expect(getNumberAndExtension('1-800-555-1212 x456', 'US')).toEqual({
                coreNumber: '1-800-555-1212',
                extension: '456',
                hasStandardExtension: true,
            });
        });

        test('should handle "ext." prefixed extension using standard logic', () => {
            expect(getNumberAndExtension('800-123-4567 ext. 1234', 'US')).toEqual({
                coreNumber: '800-123-4567',
                extension: '1234',
                hasStandardExtension: true,
            });
        });

        test('should handle "ext." prefixed extension, no space is not-standard', () => {
            expect(getNumberAndExtension('800-123-4567 ext.1234', 'US')).toEqual({
                coreNumber: '800-123-4567',
                extension: '1234',
                hasStandardExtension: false,
            });
        });

        test('should handle "extension" prefixed extension using standard logic', () => {
            expect(getNumberAndExtension('(555) 123 4567 extension 99', 'US')).toEqual({
                coreNumber: '(555) 123 4567',
                extension: '99',
                hasStandardExtension: false,
            });
        });

        test('should return null extension if no extension is present', () => {
            expect(getNumberAndExtension('0800 123 4567', 'US')).toEqual({
                coreNumber: '0800 123 4567',
                extension: null,
                hasStandardExtension: null,
            });
        });

        test('PL: detect wew. extension and mark as non-standard', () => {
            expect(getNumberAndExtension('+48 22 825 91 00 wew.106', 'PL')).toEqual({
                coreNumber: '+48 22 825 91 00',
                extension: '106',
                hasStandardExtension: false,
            });
        });

        test('PL: detect wewn. as extension and mark as non-standard', () => {
            expect(getNumberAndExtension('+48 22 825 91 00 wewn. 106', 'PL')).toEqual({
                coreNumber: '+48 22 825 91 00',
                extension: '106',
                hasStandardExtension: false,
            });
        });

        test('PL: detect wewn. as extension and mark as non-standard when extension is in brackets', () => {
            expect(getNumberAndExtension('+48 22 825 91 00 (wewn. 106)', 'PL')).toEqual({
                coreNumber: '+48 22 825 91 00',
                extension: '106',
                hasStandardExtension: false,
            });
        });

        test('CA: detect poste as extension and mark as non-standard', () => {
            expect(getNumberAndExtension('+1-819-755-4833 poste 5421', 'CA')).toEqual({
                coreNumber: '+1-819-755-4833',
                extension: '5421',
                hasStandardExtension: false,
            });
        });
    });
});

// =====================================================================
// phoneTagToUse Tests
// =====================================================================
describe('phoneTagToUse', () => {
    test('should return phone if no other tags are present', () => {
        expect(phoneTagToUse({})).toBe('phone');
    });
    
    test('should return contact:phone if it is present', () => {
        expect(phoneTagToUse({'contact:phone': '01234'})).toBe('contact:phone');
    });

    test('should return phone if both phone and contact:phone are present', () => {
        expect(phoneTagToUse({'contact:phone': '01234', 'phone': '06789'})).toBe('phone');
    });

    test('should return phone if it is present', () => {
        expect(phoneTagToUse({'phone': '01234'})).toBe('phone');
    });

    test('should not be affected by other tags', () => {
        expect(phoneTagToUse({'phone': '01234', 'mobile': '07123'})).toBe('phone');
    });
});

// =====================================================================
// keyToRemove Tests
// =====================================================================
describe('keyToRemove', () => {

    // Test cases for clear preference based on the defined order
    test('should remove the lower-preference key (contact:phone) when comparing phone vs contact:phone', () => {
        expect(keyToRemove('phone', 'contact:phone')).toBe('contact:phone');
        expect(keyToRemove('contact:phone', 'phone')).toBe('contact:phone');
    });

    test('should remove the lower-preference key (mobile) when comparing phone vs mobile', () => {
        expect(keyToRemove('phone', 'mobile')).toBe('mobile');
        expect(keyToRemove('mobile', 'phone')).toBe('mobile');
    });

    test('should remove the lowest-preference key (contact:mobile) when comparing mobile vs contact:mobile', () => {
        expect(keyToRemove('mobile', 'contact:mobile')).toBe('contact:mobile');
        expect(keyToRemove('contact:mobile', 'mobile')).toBe('contact:mobile');
    });

    // Test case for tie-breaker rule
    test('should remove key2 when both keys have the same preference score (tie-breaker)', () => {
        // Equal known scores
        expect(keyToRemove('phone', 'phone')).toBe('phone');
        expect(keyToRemove('mobile', 'mobile')).toBe('mobile');
        
        // Ensure key1 is kept if they are equal
        expect(keyToRemove('contact:phone', 'contact:phone')).toBe('contact:phone');
    });

    // Test cases involving unknown keys (which get Infinity score and should be removed)
    test('should remove an unknown key when compared against a known key', () => {
        const unknownKey = 'fax';
        const knownKey = 'phone'; 
        
        // Case 1: Unknown key is key1 (score: Infinity > 0)
        expect(keyToRemove(unknownKey, knownKey)).toBe(unknownKey);
        
        // Case 2: Unknown key is key2 (score: 0 < Infinity)
        expect(keyToRemove(knownKey, unknownKey)).toBe(unknownKey);
    });

    // Test case where both keys are unknown
    test('should remove key2 when both keys are unknown (Infinity score tie-breaker)', () => {
        expect(keyToRemove('fax', 'email')).toBe('email');
    });
});

// =====================================================================
// checkExclusions Tests
// =====================================================================
/**
 * A mock function to simulate the output of a successful phone number parse 
 * (from libphonenumber-js), primarily exposing the nationalNumber.
 * @param {string} nationalNumber - The core national number of the phone number.
 * @param {string} countryCode - The country code (e.g., 'FR').
 * @returns {Object} A mock phone number object.
 */
const mockPhoneNumber = (nationalNumber, countryCode) => ({
    nationalNumber: nationalNumber, 
    country: countryCode,
});

describe('checkExclusions', () => {
    
    const FR = 'FR';
    const DE = 'DE'; // Non-excluded country
    const excludedNumber = '3631';
    const excludedNumberWithExtra = 'tel: 3631';
    const otherNumber = '4321'; // Non-excluded number
    const requiredTags = { amenity: 'post_office' };
    const irrelevantTags = { shop: 'bank', operator: 'La Banque Postale' };
    const emptyTags = {};

    // --- SUCCESS CASES: Should return the exclusion object ---

    test('should return exclusion result when country, number and tags match', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const expected = {
            isInvalid: false,
            autoFixable: true,
            suggestedFix: excludedNumber
        };
        expect(checkExclusions(phoneNumber, excludedNumber, FR, requiredTags)).toEqual(expected);
    });

    test('should return fix result when country and tags match but extras on the number', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const expected = {
            isInvalid: true,
            autoFixable: true,
            suggestedFix: excludedNumber
        };
        expect(checkExclusions(phoneNumber, excludedNumberWithExtra, FR, requiredTags)).toEqual(expected);
    });

    test('should return exclusion result when number and tags match, even with extra irrelevant tags', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const combinedTags = { ...requiredTags, ...irrelevantTags };
        const expected = {
            isInvalid: false,
            autoFixable: true,
            suggestedFix: excludedNumber
        };
        expect(checkExclusions(phoneNumber, excludedNumber, FR, combinedTags)).toEqual(expected);
    });

    // --- FAILURE CASES: Should return null ---

    test('should return null when the country code does not match', () => {
        // 3631 is only excluded for FR, not DE
        const phoneNumber = mockPhoneNumber(excludedNumber, DE);
        expect(checkExclusions(phoneNumber, excludedNumber, DE, requiredTags)).toBeNull();
    });

    test('should return null when the phone number is not excluded, even if tags and country match', () => {
        // FR is excluded, amenity=post_office is the required tag, but the number is wrong
        const phoneNumber = mockPhoneNumber(otherNumber, FR);
        expect(checkExclusions(phoneNumber, otherNumber, FR, requiredTags)).toBeNull();
    });

    
    // Disabled these tests since all 3xxx numbers are valid, so I don't have any exclusions to test against

    // test('should return null when the required OSM tag value is incorrect', () => {
    //     // Correct country and number, but the amenity tag is 'bank' instead of 'post_office'
    //     const phoneNumber = mockPhoneNumber(excludedNumber, FR);
    //     expect(checkExclusions(phoneNumber, excludedNumber, FR, irrelevantTags)).toBeNull();
    // });

    // test('should return null when the required OSM tag is missing (empty tags)', () => {
    //     // Correct country and number, but no tags are passed
    //     const phoneNumber = mockPhoneNumber(excludedNumber, FR);
    //     expect(checkExclusions(phoneNumber, excludedNumber, FR, emptyTags)).toBeNull();
    // });
    
    test('should return null when no phoneNumber object is provided', () => {
        // Should handle the case where parsePhoneNumber failed and returned null
        expect(checkExclusions(null, null, FR, requiredTags)).toBeNull();
    });
});

// =====================================================================
// getWhatsappNumber Tests
// =====================================================================
describe('getWhatsappNumber', () => {

    test('Plain number returns plain number', () => {
        const result = getWhatsappNumber('+442079460000');
        expect(result.cleanNumberStr).toEqual('+442079460000');
        expect(result.validNonNumber).toBe(false);
    });

    test('Number is extracted from whatsapp protocol', () => {
        const result = getWhatsappNumber('whatsapp://send?phone=+79268634179');
        expect(result.cleanNumberStr).toEqual('+79268634179');
        expect(result.validNonNumber).toBe(false);
    });

    test('Number is extracted from whatsapp protocol with spacing', () => {
        const result = getWhatsappNumber('whatsapp://send?phone=+79%2026%208634179');
        expect(result.cleanNumberStr).toEqual('+79 26 8634179');
        expect(result.validNonNumber).toBe(false);
    });

    test('Number is extracted from whatsapp protocol with text option first', () => {
        const result = getWhatsappNumber('whatsapp://send?text=&phone=+393296618182');
        expect(result.cleanNumberStr).toEqual('+393296618182');
        expect(result.validNonNumber).toBe(false);
    });

    test('Number is extracted from whatsapp protocol with text option second', () => {
        const result = getWhatsappNumber('whatsapp://send?phone=+393296618182&text=');
        expect(result.cleanNumberStr).toEqual('+393296618182');
        expect(result.validNonNumber).toBe(false);
    });

    test('wa.me plain link with number does not need special handling', () => {
        const result = getWhatsappNumber('wa.me/79622801221');
        expect(result.cleanNumberStr).toEqual('wa.me/79622801221');
        expect(result.validNonNumber).toBe(false);
    });

    test('wa.me message link is not invalid', () => {
        const result = getWhatsappNumber('https://wa.me/message/ZQ4YRTMO7OUAJ1');
        expect(result.cleanNumberStr).toEqual('https://wa.me/message/ZQ4YRTMO7OUAJ1');
        expect(result.validNonNumber).toBe(true);
    });

    test('Whatsapp channel link is not invalid', () => {
        const result = getWhatsappNumber('https://www.whatsapp.com/channel/0029VaKSecf1HspwcdF1y82f');
        expect(result.cleanNumberStr).toEqual('https://www.whatsapp.com/channel/0029VaKSecf1HspwcdF1y82f');
        expect(result.validNonNumber).toBe(true);
    });

    test('Whatsapp catalog link is not invalid', () => {
        const result = getWhatsappNumber('https://www.whatsapp.com/catalog/34686719341/?app_absent=0');
        expect(result.cleanNumberStr).toEqual('https://www.whatsapp.com/catalog/34686719341/?app_absent=0');
        expect(result.validNonNumber).toBe(true);
    });

    test('Number is extracted from web.whatsapp link', () => {
        const result = getWhatsappNumber('https://web.whatsapp.com/send?phone=+39%20329%206565180');
        expect(result.cleanNumberStr).toEqual('+39 329 6565180');
        expect(result.validNonNumber).toBe(false);
    });

    test('Number is extracted from web.whatsapp link with message', () => {
        const result = getWhatsappNumber('https://web.whatsapp.com/send?phone=41789509077&text=Hallo+123');
        expect(result.cleanNumberStr).toEqual('41789509077');
        expect(result.validNonNumber).toBe(false);
    });

    test('wa.me qr link is valid', () => {
        const result = getWhatsappNumber('https://wa.me/qr/TXXK3INJGQA6O1');
        expect(result.cleanNumberStr).toEqual('https://wa.me/qr/TXXK3INJGQA6O1');
        expect(result.validNonNumber).toBe(true);
    });

    test('wa.me message link is valid', () => {
        const result = getWhatsappNumber('https://wa.me/message/JBVSQ7DEPBKSK1');
        expect(result.cleanNumberStr).toEqual('https://wa.me/message/JBVSQ7DEPBKSK1');
        expect(result.validNonNumber).toBe(true);
    });

    test('Number is extracted from wa.me link with other options', () => {
        const result = getWhatsappNumber('https://wa.me/?phone=493416894769&abid=493416894769');
        expect(result.cleanNumberStr).toEqual('493416894769');
        expect(result.validNonNumber).toBe(false);
    });

    test('chat.whatsapp link is valid', () => {
        const result = getWhatsappNumber('https://chat.whatsapp.com/K8SXtjFUpVdBgJGO8lXze0');
        expect(result.cleanNumberStr).toEqual('https://chat.whatsapp.com/K8SXtjFUpVdBgJGO8lXze0');
        expect(result.validNonNumber).toBe(true);
    });

    test('Number is extracted from api.whatsapp link', () => {
        const result = getWhatsappNumber('https://api.whatsapp.com/send?phone=88332248686');
        expect(result.cleanNumberStr).toEqual('88332248686');
        expect(result.validNonNumber).toBe(false);
    });

    test('Other host is not valid', () => {
        const result = getWhatsappNumber('https://www.instagram.com/friotekaoficial/?hl=es');
        expect(result.cleanNumberStr).toEqual('https://www.instagram.com/friotekaoficial/?hl=es');
        expect(result.validNonNumber).toBe(false);
    });
});


// =====================================================================
// processSingleNumber Tests
// =====================================================================
describe('processSingleNumber', () => {
    // --- GB Tests (London number: 020 7946 0000) ---

    test('GB: consider no spacing to be valid', () => {
        const result = processSingleNumber('+442079460000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
    });

    test('GB: correctly validate and format a simple valid local number', () => {
        const result = processSingleNumber('02079460000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
        expect(result.autoFixable).toBe(true);
    });

    test('GB: correctly validate and format an international valid number', () => {
        const result = processSingleNumber('+44 20 7946 0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: flag a valid number with bad internal spacing as invalid but autoFixable', () => {
        const result = processSingleNumber('020 7946  0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: flag a valid number with extension as valid', () => {
        const result = processSingleNumber('+44 20 7946 0000 x123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
    });

    test('GB: flag a valid number with non-standard extension abbreviated as invalid but autoFixable', () => {
        const result = processSingleNumber('+44 20 7946 0000 ext.123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000 x123');
    });

    test('GB: flag a valid number with non-standard extension as invalid but autoFixable', () => {
        const result = processSingleNumber('+44 20 7946 0000 extension 123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000 x123');
    });

    test('GB: mobile number in phone tag is valid', () => {
        const result = processSingleNumber('+44 7946 123456', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
    });

    test('GB: non-mobile number in mobile tag is invalid', () => {
        const result = processSingleNumber('+44 20 7946 0000', SAMPLE_COUNTRY_CODE_GB, {}, 'mobile');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.typeMismatch).toBe(true);
    });

    test('GB: toll free phone number without country code is invalid', () => {
        const result = processSingleNumber('0800 00 1234', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+44 800 001234');
    });

    test('GB: toll free phone number with country code is valid', () => {
        const result = processSingleNumber('+44 800 00 1234', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
    });

    test('GB: toll free phone number with dashes is fixable to international format', () => {
        const result = processSingleNumber('0800-00-1234', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 800 001234');
    });

    test('GB: toll free phone number with country code and invalid formatting is fixable to international format', () => {
        const result = processSingleNumber('(+44) 0800 00 1234', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 800 001234');
    });

    test('GB: toll free phone number with 00 and country code is fixable to international format', () => {
        const result = processSingleNumber('0044 0800 00 1234', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 800 001234');
    });

    test('GB: a number with tabs is invalid but fixable', () => {
        const result = processSingleNumber('+44 20\t7946\t0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with thin spaces is invalid but fixable', () => {
        const result = processSingleNumber('+44 20 7946 00 00', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with underscores is invalid but fixable', () => {
        const result = processSingleNumber('+44 20_7946_0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with middle dots is invalid but fixable', () => {
        const result = processSingleNumber('+44 20·7946·0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with tildes as spaces is invalid but fixable', () => {
        const result = processSingleNumber('+44~20~7946~0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with pop directional isolate is invalid but fixable', () => {
        const result = processSingleNumber('+44 \u206920 7946 0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with first strong isolate is invalid but fixable', () => {
        const result = processSingleNumber('+44 \u206820 7946 0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    // --- ZA Tests (Johannesburg number: 011 555 1234) ---

    test('ZA: correctly validate and format a simple valid local number', () => {
        // Local ZA format including trunk prefix '0'
        const result = processSingleNumber('011 555 1234', SAMPLE_COUNTRY_CODE_ZA);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+27 11 555 1234');
        expect(result.autoFixable).toBe(true);
    });

    test('ZA: correctly validate and format an international valid number', () => {
        const result = processSingleNumber('+27 11 555 1234', SAMPLE_COUNTRY_CODE_ZA);
        expect(result.isInvalid).toBe(false);
    });

    test('ZA: flag a clearly invalid (too short) number as invalid and unfixable', () => {
        const result = processSingleNumber('011 555', SAMPLE_COUNTRY_CODE_ZA);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
        expect(result.suggestedFix).toBe(null);
    });

    test('ZA: possible phonewords in a country where this is not common is invalid and unfixable', () => {
        const result = processSingleNumber('+27 51 435 GPJA', SAMPLE_COUNTRY_CODE_ZA);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
        expect(result.suggestedFix).toBe(null);
        expect(result.validPhonewords).toBe(false);
    });

    // --- USA Tests (+1 213 373 4253) ---

    test('US: correctly validate and format a simple valid local number', () => {
        const result = processSingleNumber('213 373 4253', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+1-213-373-4253');
        expect(result.autoFixable).toBe(true);
    });

    test('US: bad spacing is not invalid', () => {
        const result = processSingleNumber('+121 337 34253', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(false);
    });

    test('US: dashes is not invalid', () => {
        const result = processSingleNumber('+1-213-373-4253', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(false);
    });

    test('US: toll free number is fixable to international format', () => {
        const result = processSingleNumber('866-590-0601', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+1-866-590-0601');
    });

    test('US: a valid number with extension is valid', () => {
        const result = processSingleNumber('+1 304-845-9810 x403', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(false);
    });

    test('US: flag a valid number with non-standard extension as invalid but autoFixable', () => {
        const result = processSingleNumber('+1-304-845-9810 extension 403', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+1-304-845-9810 x403');
    });

    test('US: fix a phonewords number', () => {
        const result = processSingleNumber('1-870-KAKESNY', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedFix).toBe('+1-870-525-3769');
    });

    test('US: fix a phonewords number in lowercase', () => {
        const result = processSingleNumber('1-870-kakesny', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedFix).toBe('+1-870-525-3769');
    });

    test('US: letters in the middle of a number is not valid phonewords', () => {
        const result = processSingleNumber('1-870-kak-3769', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    // --- PL Tests ---

    test('PL: leading 0 is invaid but fixable', () => {
        const result = processSingleNumber('0586774478', SAMPLE_COUNTRY_CODE_PL);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78');
    });

    test('PL: leading 0 is invaid but too short is invalid', () => {
        const result = processSingleNumber('+48 02787', SAMPLE_COUNTRY_CODE_PL);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('PL: leading 0 is invaid but fixable with country code', () => {
        const result = processSingleNumber('+48 0586774478', SAMPLE_COUNTRY_CODE_PL);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78');
    });

    test('PL: extension as wew. is invalid and fixable', () => {
        const result = processSingleNumber('+48 0586774478 wew. 123', SAMPLE_COUNTRY_CODE_PL);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78 x123');
    });

    test('PL: extension as wewn in brackets is invalid and fixable', () => {
        const result = processSingleNumber('+48 0586774478 (wewn 123)', SAMPLE_COUNTRY_CODE_PL);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78 x123');
    });

    // --- DE Tests ---
    test('DE: DIN format extension is valid', () => {
        const result = processSingleNumber('+49 491 4567-1234', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(false);
    });

    test('DE: DIN format extension with figure dash is invalid and fixable', () => {
        const result = processSingleNumber('+49 491 4567‒1234', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 491 4567-1234');
    });

    test('DE: DIN format extension with 5 digit extension is valid', () => {
        const result = processSingleNumber('+49 491 4567-12345', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(false);
    });

    test('DE: hyphen and DIN format extension is invalid and fixable', () => {
        const result = processSingleNumber('+49 491-4567-1234', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 491 4567-1234');
    });

    test('DE: hyphen and DIN format extension with spaces is invalid and fixable', () => {
        const result = processSingleNumber('+49 491-4567 - 1234', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 491 4567-1234');
    });

    test('DE: hyphens not denoting extension is invalid and fixable', () => {
        const result = processSingleNumber('+49-4761-3163', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 4761 3163');
    });

    test('DE: number starting with 49 is invalid and not fixable', () => {
        const result = processSingleNumber('49 4761 3163', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('DE: number starting with (+49) is valid and fixable', () => {
        const result = processSingleNumber('(+49) 04761 3163', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 4761 3163');
    });

    test('DE: number starting with some other characters then 49 is invalid and unfixable', () => {
        const result = processSingleNumber('-49 521 557666', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('DE: toll free number is fixable to national format', () => {
        const result = processSingleNumber('(0800) 1234 567', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('0800 1234567');
    });

    test('DE: toll free number already in international format is valid', () => {
        const result = processSingleNumber('+49 800 1234 567', SAMPLE_COUNTRY_CODE_DE);
        expect(result.isInvalid).toBe(false);
    });

    // --- FR Tests ---
    test('FR: shared cost number in national format is valid', () => {
        const result = processSingleNumber('0820 39 39 00', SAMPLE_COUNTRY_CODE_FR);
        expect(result.isInvalid).toBe(false);
    });

    test('FR: shared cost number already in international format is valid', () => {
        const result = processSingleNumber('+33 820 39 39 00', SAMPLE_COUNTRY_CODE_FR);
        expect(result.isInvalid).toBe(false);
    });

    // --- IT Tests ---
    test('IT: international number with missing leading zero is invalid and fixable', () => {
        const result = processSingleNumber('+39712345678', 'IT');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+39 071 234 5678');
    });

    test('IT: invalid number in international number with missing leading zero is invalid and unfixable', () => {
        const result = processSingleNumber('+391234', 'IT');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('IT: another number in international number with missing leading zero is invalid and fixable', () => {
        const result = processSingleNumber('+39 90377129', 'IT');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+39 090 377129');
    });

    // --- WhatsApp Tests ---
    test('Whatsapp number is fixable', () => {
        const result = processSingleNumber('27123456789', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('Whatsapp number in partal link is fixable', () => {
        const result = processSingleNumber('wa.me/27123456789', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('Whatsapp number in full link fixable', () => {
        const result = processSingleNumber('https://wa.me/27123456789', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('wa.me message link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://wa.me/message/ZQ4YRTMO7OUAJ1', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('wa.me qr link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://wa.me/qr/ZQ4YRTMO7OUAJ1', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('wa.me catalogue link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://wa.me/c/123456798', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('Whatsapp channel link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://www.whatsapp.com/channel/ABCD1234', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('Whatsapp channel link is invalid in other key', () => {
        const result = processSingleNumber('https://www.whatsapp.com/channel/ABCD1234', SAMPLE_COUNTRY_CODE_ZA, {}, 'contact:mobile');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });
});

// =====================================================================
// validateSingleTag Tests
// =====================================================================
describe('validateSingleTag', () => {
    test('correctly count total numbers processed', () => {
        const result = validateSingleTag(
            '020 1234 5678; +44 20 7946 0000',
            'GB'
        );
        expect(result.numberOfValues).toBe(2);
    });

    test('single valid phone number is valid', () => {
        const result = validateSingleTag(
            '+44 20 1234 5678',
            'GB'
        );
        expect(result.isInvalid).toBe(false);
    });

    test('single invalid phone number is invalid', () => {
        const result = validateSingleTag(
            '020 1234 567', // too short
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
        expect(result.suggestedNumbersList).toEqual([]);
    });

    test('single number in national format is fixable', () => {
        const result = validateSingleTag(
            '01389 123456',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456'])
    });

    test('leading 0 and country code is fixable', () => {
        const result = validateSingleTag(
            '+44 01389 123456',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456'])
    });

    test('leading 0 and extraneous brackets is fixable', () => {
        const result = validateSingleTag(
            '+44 (0) (1389) 123456',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456'])
    });

    test('number with extension is valid', () => {
        const result = validateSingleTag(
            '+44 1389 123456 x104',
            'GB'
        );
        expect(result.isInvalid).toBe(false);
    });

    test('GB: valid number with comma before extension is invalid but autoFixable', () => {
        const result = validateSingleTag('+44 20 7946 0000, ext 123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 20 7946 0000 x123']);
    });

    test('GB: valid number with escaped extension is invalid but autoFixable', () => {
        const result = validateSingleTag('+44 20 7946 0000\\;ext=123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 20 7946 0000 x123']);
    });

    test('GB: valid number with escaped extension in double wrong format is invalid but autoFixable', () => {
        const result = validateSingleTag('+44 20 7946 0000\\;=ext=123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 20 7946 0000 x123']);
    });

    test('using "or" as seperator is fixable', () => {
        const result = validateSingleTag(
            '+44 1389 123456 or +44 1389 123457',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457'])
    });

    test('using "and" as seperator is fixable', () => {
        const result = validateSingleTag(
            '+44 1389 123456 and +44 1389 123457',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457'])
    });

    test('using comma as seperator is fixable', () => {
        const result = validateSingleTag(
            '+44 1389 123456, +44 1389 123457',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457'])
    });

    test('using forward slash as seperator is fixable', () => {
        const result_no_space = validateSingleTag(
            '+44 1389 123456/+44 1389 123457',
            'GB'
        );
        expect(result_no_space.isInvalid).toBe(true);
        expect(result_no_space.isAutoFixable).toBe(true);
        expect(result_no_space.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457'])

        const result_one_space = validateSingleTag(
            '+44 1389 123456/ +44 1389 123457',
            'GB'
        );
        expect(result_one_space.isInvalid).toBe(true);
        expect(result_one_space.isAutoFixable).toBe(true);
        expect(result_one_space.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457'])

        const result_two_spaces = validateSingleTag(
            '+44 1389 123456/ +44 1389 123457',
            'GB'
        );
        expect(result_two_spaces.isInvalid).toBe(true);
        expect(result_two_spaces.isAutoFixable).toBe(true);
        expect(result_two_spaces.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457'])
    });

    test('Valid WhatsApp link with phone number is invalid and fixable', () => {
        const result = validateSingleTag(
            'https://api.whatsapp.com/send?phone=%2B27793145853',
            'ZA',
            {},
            'contact:whatsapp'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+27 79 314 5853']);
    });

    test('Valid WhatsApp link with slash is valid', () => {
        const result = validateSingleTag(
            'https://wa.me/message/ZQ4YRTMO7OUAJ1',
            'GB',
            {},
            'contact:whatsapp'
        );
        expect(result.isInvalid).toBe(false);
    });

    test('fix one fixable number and keep existing valid number', () => {
        const result = validateSingleTag(
            '+44 1389 123456; 01389 123457',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457'])
    });

    test('one valid and one invalid makes the whole thing invalid and unfixable', () => {
        const result = validateSingleTag(
            '+44 1389 123456; +44 1389',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
    });

    test('mobile number and non-mobile number in mobile tag is invalid but fixable', () => {
        const result = validateSingleTag(
            '+44 1389 123456; +44 7496 123456',
            'GB',
            {},
            'mobile'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.mismatchTypeNumbers).toEqual(['+44 1389 123456']);
        expect(result.suggestedNumbersList).toEqual(['+44 7496 123456']);
        expect(result.numberOfValues).toEqual(2);
    });

    test('double plus can be fixed', () => {
        const result = validateSingleTag(
            '++44 1389 123456',
            'GB'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456']);
    });

    test('GB: an incorrect leading plus is fixable', () => {
        const result = validateSingleTag('+20 7946 0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 20 7946 0000']);
    });

    test('FR: a leading plus on a number that is too short but would be valid with an extra country code is not incorrectly fixed', () => {
        const result = validateSingleTag('+33 5 633611', 'FR');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
    });

    test('DE: an ambiguous leading plus is invalid and unfixable', () => {
        const result = validateSingleTag('+40 9104 15566', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
    });

    test('US: number starting 1+ is fixable', () => {
        const result = validateSingleTag('1+951 736 4567', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+1-951-736-4567']);
    });

    test('US: phonewords is fixable', () => {
        const result = validateSingleTag('1-870-KAKESNY', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedNumbersList).toEqual(["+1-870-525-3769"]);
    });

    test('US: give up with multiple phonewords in a single tag', () => {
        const result = validateSingleTag('1-870-KAKESNY; 1-870-KAKESNJ', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
        expect(result.validPhonewords).toBe(false);
    });
});

// =====================================================================
// validateNumbers Tests
// =====================================================================
describe('validateNumbers', () => {
    const COUNTRY_CODE = 'GB';
    const COUNTRY_CODE_DE = 'DE';
    const COUNTRY_CODE_US = 'US';
    let testCounter = 0;
    let tmpFilePath;

    beforeEach(() => {
        testCounter++;
        tmpFilePath = path.join(os.tmpdir(), `validate-numbers-test-${testCounter}.json`);
    });

    afterEach(() => {
        if (fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
        }
    });

    // UK numbers used for testing
    const VALID_LANDLINE = '+44 20 7946 0000';
    const VALID_LANDLINE_NO_SPACE = '+442079460000';
    const FIXABLE_LANDLINE_INPUT = '0207 9460000';
    const FIXABLE_LANDLINE_SUGGESTED_FIX = '+44 20 7946 0000';
    const VALID_LANDLINE_2 = '+44 20 7946 1111';
    const UNFIXABLE_INPUT = '020 794'; // Too short
    const BAD_SEPARATOR_INPUT_COMMA = '020 7946 0000, 07712 900000';
    const BAD_SEPARATOR_INPUT_SLASH = '020 7946 0000/ 07712 900000';
    const BAD_SEPARATOR_INPUT_PIPE = '020 7946 0000 | 07712 900000';
    const BAD_SEPARATOR_FIX = '+44 20 7946 0000; +44 7712 900000';
    const VALID_MOBILE = '+44 7712 900000';
    const VALID_MOBILE_2 = '+44 7712 900001';
    const FIXABLE_MOBILE_INPUT = '07712  900000';
    const FIXABLE_MOBILE_SUGGESTED_FIX = '+44 7712 900000';
    const VALID_TOLL_FREE = '+44 800 001234';

    // DE numbers
    const SLASH_IN_NUMBER_DE = '+498131/275715';
    const SLASH_IN_NUMBER_DE_FIX = '+49 8131 275715';

    // US numbers
    const VALID_US_NUMBER = '+1-202-627-1951';
    const FIXABLE_US_NUMBER = '+1 2026271951';

    test('should correctly identify a single valid number and return zero invalid items', async () => {
        const elements = [
            {
                type: 'node',
                id: 1001,
                tags: { phone: VALID_LANDLINE, name: 'Valid Shop' },
                lat: 51.5,
                lon: 0.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('should identify a single fixable invalid number (no country code) and provide suggested fix', async () => {
        const elements = [
            {
                type: 'way',
                id: 2002,
                tags: { 'contact:phone': FIXABLE_LANDLINE_INPUT, name: 'Fixable Business' },
                center: { lat: 52.0, lon: 1.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];


        expect(invalidItem.id).toBe(2002);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('should identify a fundamentally unfixable number (too short) and mark it as unfixable', async () => {
        const elements = [
            {
                type: 'node',
                id: 3003,
                tags: { mobile: UNFIXABLE_INPUT, name: 'Short Mobile' },
                lat: 53.0,
                lon: 2.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(false);
        expect(invalidItem.invalidNumbers.mobile).toBe(UNFIXABLE_INPUT);
    });

    test('should handle multiple numbers in a single tag using a bad separator (comma)', async () => {
        const elements = [
            {
                type: 'node',
                id: 4004,
                tags: { phone: BAD_SEPARATOR_INPUT_COMMA, name: 'Multiple Contacts' },
                lat: 54.0,
                lon: 3.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(BAD_SEPARATOR_INPUT_COMMA);
        expect(invalidItem.suggestedFixes.phone).toBe(BAD_SEPARATOR_FIX);
    });

    test('should handle multiple numbers in a single tag using a bad separator (pipe)', async () => {
        const elements = [
            {
                type: 'node',
                id: 4004,
                tags: { phone: BAD_SEPARATOR_INPUT_PIPE, name: 'Multiple Contacts' },
                lat: 54.0,
                lon: 3.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(BAD_SEPARATOR_INPUT_PIPE);
        expect(invalidItem.suggestedFixes.phone).toBe(BAD_SEPARATOR_FIX);
    });

    test('should handle multiple numbers in a single tag using a bad separator (slash)', async () => {
        const elements = [
            {
                type: 'node',
                id: 4004,
                tags: { phone: BAD_SEPARATOR_INPUT_SLASH, name: 'Multiple Contacts' },
                lat: 54.0,
                lon: 3.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(BAD_SEPARATOR_INPUT_SLASH);
        expect(invalidItem.suggestedFixes.phone).toBe(BAD_SEPARATOR_FIX);
    });

    test('should not consider a slash as a separator in DE', async () => {
        const elements = [
            {
                type: 'node',
                id: 4004,
                tags: { phone: SLASH_IN_NUMBER_DE, name: 'Slashing Sales' },
                lat: 54.0,
                lon: 3.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_DE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(SLASH_IN_NUMBER_DE);
        expect(invalidItem.suggestedFixes.phone).toBe(SLASH_IN_NUMBER_DE_FIX);
    });

    test('should aggregate results from multiple phone tags on a single element', async () => {
        const elements = [
            {
                type: 'relation',
                id: 5005,
                tags: {
                    'contact:phone': FIXABLE_LANDLINE_INPUT,
                    'contact:mobile': FIXABLE_MOBILE_INPUT,
                    phone: VALID_LANDLINE_2,
                    name: 'Mixed Contact Info',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        // Only the two invalid tags should be recorded in the maps
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
            'contact:mobile': FIXABLE_MOBILE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': FIXABLE_LANDLINE_SUGGESTED_FIX,
            'contact:mobile': FIXABLE_MOBILE_SUGGESTED_FIX,
        });
    });

    test('should correctly process website tag (without protocol) and include protocol in base item', async () => {
        const websiteInput = 'www.test-site.co.uk';
        const elements = [
            {
                type: 'node',
                id: 6006,
                tags: { phone: FIXABLE_LANDLINE_INPUT, website: websiteInput },
                lat: 56.0,
                lon: 5.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.website).toBe(`http://${websiteInput}`);
    });

    test('should not change website tag if it already has a protocol', async () => {
        const websiteInput = 'https://secure.site.com';
        const elements = [
            {
                type: 'node',
                id: 6006,
                tags: { phone: FIXABLE_LANDLINE_INPUT, website: websiteInput },
                lat: 56.0,
                lon: 5.0,
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.website).toBe(websiteInput);
    });

    test('should correctly calculate totalNumbers across multiple elements', async () => {
        const elements = [
            {
                type: 'node',
                id: 7001,
                tags: { phone: VALID_LANDLINE }, // 1 valid number
                lat: 57.0,
                lon: 6.0,
            },
            {
                type: 'way',
                id: 7002,
                tags: { 'contact:phone': FIXABLE_LANDLINE_INPUT }, // 1 number, invalid
                center: { lat: 57.1, lon: 6.1 },
            },
            {
                type: 'relation',
                id: 7003,
                tags: { mobile: BAD_SEPARATOR_INPUT_COMMA }, // 2 numbers, invalid
                center: { lat: 57.2, lon: 6.2 },
            },
            {
                type: 'node',
                id: 7004,
                tags: {}, // 0 numbers
                lat: 57.3,
                lon: 6.3,
            }
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        // 1 (7001) + 1 (7002) + 2 (7003) = 4 total numbers checked
        expect(result.totalNumbers).toBe(4);
        expect(result.invalidCount).toBe(2); // Elements 7002 and 7003 are invalid
    });

    test('should do nothing with mobile=yes and process actual phone number', async () => {
        const elements = [
            {
                type: 'relation',
                id: 5005,
                tags: {
                    'mobile': 'yes',
                    phone: FIXABLE_LANDLINE_INPUT,
                    name: 'Mobile caterer',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'phone': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'phone': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('should fix and move landline number out of mobile tag', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:mobile': FIXABLE_LANDLINE_INPUT,
                    name: 'Landline in Mobile',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_INPUT
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': null,
            'phone': FIXABLE_LANDLINE_SUGGESTED_FIX
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            "contact:mobile": FIXABLE_LANDLINE_SUGGESTED_FIX
        });
    });

    test('should fix and move landline number out of mobile tag and append to existing phone tag', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:mobile': FIXABLE_LANDLINE_INPUT,
                    'phone': VALID_LANDLINE_2,
                    name: 'Landline in Mobile',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_INPUT,
            'phone': VALID_LANDLINE_2,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': null,
            'phone': `${VALID_LANDLINE_2}; ${FIXABLE_LANDLINE_SUGGESTED_FIX}`
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            "contact:mobile": FIXABLE_LANDLINE_SUGGESTED_FIX
        });
    });

    test('should keep mobile number in mobile tag when moving another number out', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:mobile': `${FIXABLE_LANDLINE_INPUT}; ${FIXABLE_MOBILE_INPUT}`,
                    name: 'Confused mobile',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': `${FIXABLE_LANDLINE_INPUT}; ${FIXABLE_MOBILE_INPUT}`
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': FIXABLE_MOBILE_SUGGESTED_FIX,
            'phone': FIXABLE_LANDLINE_SUGGESTED_FIX
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_SUGGESTED_FIX
        });
    });

    test('should remove duplicate number in different tags', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': VALID_LANDLINE,
                    'phone': VALID_LANDLINE,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE,
            'phone': VALID_LANDLINE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null
        });
    });

    test('DE should remove duplicate number with extension in different tags', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': "+49 651 146262-0",
                    'phone': "+49 651 146262-0",
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), "DE", tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': "+49 651 146262-0",
            'phone': "+49 651 146262-0",
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null
        });
    });

    test('FR should remove duplicate valid national numbers in different tags', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': "0 890 64 97 13",
                    'phone': "0 890 64 97 13",
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), "FR", tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': "0 890 64 97 13",
            'phone': "0 890 64 97 13",
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null
        });
    });

    test('should only remove duplicate number with multiple numbers where one is a duplicate to another tag', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:mobile': `${VALID_MOBILE}; ${VALID_MOBILE_2}`,
                    'phone': VALID_MOBILE,
                    name: 'Triple phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:mobile': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': `${VALID_MOBILE}; ${VALID_MOBILE_2}`,
            'phone': VALID_MOBILE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': VALID_MOBILE_2
        });
    });

    test('should only remove duplicate number with multiple numbers where one is a duplicate to another tag, phone and contact:phone', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': '+27 11 984 4050;+27 83 462 3316',
                    'phone': '+27 11 984 4050',
                    name: 'Triple phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': '+27 11 984 4050;+27 83 462 3316',
            'phone': '+27 11 984 4050',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': '+27 83 462 3316'
        });
    });

    test('should remove duplicate number in the same tag', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE}`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE}`
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE
        });
    });

    test('should remove duplicate numbers with different formatting in the same tag', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE_NO_SPACE}`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE
        });
    });

    test('should respect country formatting with duplicate numbers in the same tag', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${VALID_US_NUMBER}; ${VALID_US_NUMBER}`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_US_NUMBER}; ${VALID_US_NUMBER}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_US_NUMBER
        });
    });

    test('should fix duplicate numbers with different formatting in the same tag', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${FIXABLE_LANDLINE_INPUT}; ${VALID_LANDLINE_NO_SPACE}`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${FIXABLE_LANDLINE_INPUT}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE
        });
    });

    test('different extensions are not duplicates', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${VALID_LANDLINE}x123`,
                    'phone': `${VALID_LANDLINE}x456`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('different extensions are not duplicates, US', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${VALID_US_NUMBER} x123`,
                    'phone': `${VALID_US_NUMBER} x456`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('duplicate numbers with extensions should be detected and fixed, US', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${FIXABLE_US_NUMBER} x123`,
                    'phone': `${FIXABLE_US_NUMBER} x123`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${FIXABLE_US_NUMBER} x123`,
            'phone': `${FIXABLE_US_NUMBER} x123`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            'phone': `${VALID_US_NUMBER} x123`
        });
    });

    test('different spacing is still a duplicate', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': VALID_LANDLINE_NO_SPACE,
                    'phone': VALID_LANDLINE,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE_NO_SPACE,
            'phone': VALID_LANDLINE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null
        });
    });

    test('fixable and correct formatting are duplicates', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': FIXABLE_LANDLINE_INPUT,
                    'phone': VALID_LANDLINE,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
            'phone': VALID_LANDLINE
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null
        });
    });

    test('duplicate with bad formatting gets fixed', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': FIXABLE_LANDLINE_INPUT,
                    'phone': VALID_LANDLINE_NO_SPACE,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
            'phone': VALID_LANDLINE_NO_SPACE
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            'phone': VALID_LANDLINE
        });
    });

    test('duplicate with bad formatting gets fixed, respecting country formatting', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': VALID_US_NUMBER,
                    'phone': VALID_US_NUMBER,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_US_NUMBER,
            'phone': VALID_US_NUMBER
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null
        });
    });

    test('duplicate non-mobile numbers in phone and mobile are duplicate, not type mismatch', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'mobile': VALID_LANDLINE,
                    'phone': VALID_LANDLINE,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.hasTypeMismatch).toBe(false);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'mobile': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'mobile': VALID_LANDLINE,
            'phone': VALID_LANDLINE
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'mobile': null
        });
    });

    test('non-mobile number in mobile tag and other duplicate numbers has duplicate and type mismatch', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': VALID_LANDLINE_2,
                    'mobile': VALID_LANDLINE,
                    'phone': VALID_LANDLINE_2,
                    name: 'Triple phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE_2,
            'mobile': VALID_LANDLINE,
            'phone': VALID_LANDLINE_2
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            'mobile': null,
            'phone': `${VALID_LANDLINE_2}; ${VALID_LANDLINE}`
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            "mobile": VALID_LANDLINE
        });
    });

    test('should fix separator and report duplicates for duplicate numbers with incorrect separator', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:phone': `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
                    'phone': `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
                    name: 'Double phone',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(4);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
            'phone': `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            'phone': `${VALID_LANDLINE}; ${VALID_LANDLINE_2}`,
        });
    });

    test('should find and remove duplicates among other numbers in one tag', async () => {
        const elements = [
            {
                type: 'node',
                id: 5775129635,
                tags: {
                    'phone': '+44 1768 779 280;+44 7901854574;+44 7554806119;+44 7554806119;+44 7554806119',
                    name: 'Many phones',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(5);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'phone': '+44 1768 779 280;+44 7901854574;+44 7554806119;+44 7554806119;+44 7554806119',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'phone': '+44 17687 79280; +44 7901 854574; +44 7554 806119',
        });
    });

    test('should fix duplicates in a single tag where number is duplicated in another tag as well', async () => {
        const elements = [
            {
                type: 'node',
                id: 5775129635,
                tags: {
                    'phone': '+44 17687 79280; +441768779280',
                    'contact:phone': '+44 (17687) 79280',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'phone': 'phone',
            'contact:phone': 'phone'
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'phone': '+44 17687 79280; +441768779280',
            'contact:phone': '+44 (17687) 79280',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'phone': '+44 17687 79280',
            'contact:phone': null,
        });
    });

    test('whatsapp number is not duplicate to phone tags', async () => {
        const elements = [
            {
                type: 'way',
                id: 1234,
                tags: {
                    'contact:whatsapp': `${VALID_MOBILE}`,
                    'contact:mobile': `${VALID_MOBILE}`,
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('should fix a fax number on a single element', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'fax': FIXABLE_LANDLINE_INPUT,
                    name: 'Faxable',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'fax': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'fax': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('toll free fax number is valid', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'fax': VALID_TOLL_FREE,
                    name: 'Toll Free Faxable',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('mobile phone fax number is valid', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'fax': VALID_MOBILE,
                    name: 'Toll Free Faxable',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('should fix both phone and fax numbers on a single element', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'phone': FIXABLE_MOBILE_INPUT,
                    'fax': FIXABLE_LANDLINE_INPUT,
                    name: 'Faxable',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'fax': FIXABLE_LANDLINE_INPUT,
            'phone': FIXABLE_MOBILE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'fax': FIXABLE_LANDLINE_SUGGESTED_FIX,
            'phone': FIXABLE_MOBILE_SUGGESTED_FIX,
        });
    });

    test('same number for phone and fax is not duplicate', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'phone': VALID_LANDLINE,
                    'fax': VALID_LANDLINE,
                    name: 'Faxable',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('duplicate numbers in fax tags is invalid and fixable', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'contact:fax': FIXABLE_LANDLINE_INPUT,
                    'fax': FIXABLE_LANDLINE_INPUT,
                    name: 'Double Faxable',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:fax': FIXABLE_LANDLINE_INPUT,
            'fax': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:fax': null,
            'fax': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:fax': 'fax',
        });
    });

    test('phonewords is invalid and fixable and adds phone:mnemonic', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'phone': "1-870-KAKESNY",
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'phone:mnemonic': null,
            'phone': "1-870-KAKESNY",
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'phone:mnemonic': "1-870-KAKESNY",
            'phone': "+1-870-525-3769",
        });
    });

    test('WhatsApp wa.me message link in whatsapp key is valid', async () => {
        const elements = [
            {
                type: 'node',
                id: 123456,
                tags: {
                    'contact:whatsapp': 'https://wa.me/message/ZQ4YRTMO7OUAJ1',
                },
                center: { lat: 55.0, lon: 4.0 },
            },
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidCount).toBe(0);
    });
});

// =====================================================================
// isSafeEdit Tests
// =====================================================================
describe('isSafeEdit', () => {

    // =======================================================
    // Test: Success Scenarios
    // =======================================================

    test('US: should return true for a safe edit where original number matches fixed international format', () => {
        const originalNumber = '(213) 373-1234';
        const newNumber = '+1-213-373-1234';
        const countryCode = 'US';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(true);
    });

    test('GB: should return true for a safe edit where original number matches fixed international format', () => {
        const originalNumber = '020 7946 0000';
        const newNumber = '+44 20 7946 0000';
        const countryCode = 'GB';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(true);
    });

    test('GB: should return true when original number is already international but fixable', () => {
        const originalNumber = '+44.20.7946.0000';
        const newNumber = '+44 20 7946 0000';
        const countryCode = 'GB';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(true);
    });

    test('DE: number containing slashes is a safe fix', () => {
        const originalNumber = '+49 7731 / 49225';
        const newNumber = '+49 7731 49225';
        const countryCode = 'DE';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(true);
    });

    test('CA: should return true for a safe edit with toll free number', () => {
        // Parsed as a US number by deafult, not possible to differentiate country for toll free numbers
        const originalNumber = '18888651234';
        const newNumber = '+1-888-865-1234';
        const countryCode = 'CA';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(true);
    });

    // =======================================================
    // Test: Initial Input Checks
    // =======================================================

    test('should return false if originalNumberStr is missing', () => {
        expect(isSafeEdit(null, '+15551234567', 'US')).toBe(false);
    });

    test('should return false if newNumberStr is missing', () => {
        expect(isSafeEdit('(555) 123-4567', '', 'US')).toBe(false);
    });

    // =======================================================
    // Test: Other symbols check
    // =======================================================

    test('a phone tag containing any disallowed symbol is not a safe edit', () => {
        const originalNumber = '020 7946 0000?';
        const newNumber = '+44 20 7946 0000';
        const countryCode = 'GB';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    test('a phone tag containing other symbols is not a safe edit', () => {
        const originalNumber = '020 7946 0000 "sales"';
        const newNumber = '+44 20 7946 0000';
        const countryCode = 'GB';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    // =======================================================
    // Test: processSingleNumber Failures (Fixability/Match Check)
    // =======================================================

    test('should return false if original number is not autoFixable by processSingleNumber', () => {
        const originalNumber = '(213) 373-1234 "Sales"';
        const newNumber = '+1-213-373-12324';
        const countryCode = 'US';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    test('should return false if suggestedFix does not match newNumberStr (GB)', () => {
        const originalNumber = '020 7946 0000';
        const newNumber = '+449999999999';
        const countryCode = 'GB';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    test('DE: number containing hyphen is not a safe fix', () => {
        const originalNumber = '+49-7736-9219';
        const newNumber = '+49 7731 49225';
        const countryCode = 'DE';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    // =======================================================
    // Test: parsePhoneNumber Failures (New number checks)
    // =======================================================

    test('US: should return false if the new number is invalid', () => {
        const originalNumber = '(555) 123-4567';
        const newNumber = '+1555123';
        const countryCode = 'US';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    test('should return false if the new number belongs to a different country (GB original, but new number is IE)', () => {
        const originalNumber = '020 7946 0000';
        const newNumber = '+353 1 234 5678';
        const countryCode = 'GB';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    test('should return false if the original number suggests a foreign fix which does not match the countryCode', () => {
        const originalNumber = '07700 900000';
        const newNumber = '+447700900000';
        const countryCode = 'US';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });
});

// =====================================================================
// isSafeItemEdit Tests
// =====================================================================
describe('isSafeItemEdit', () => {
    const baseItem = {
        invalidNumbers: new Map(),
        suggestedFixes: new Map(),
        hasTypeMismatch: false,
        mismatchTypeNumbers: new Map(),
        duplicateNumbers: new Map(),
        autoFixable: true,
    };

    const validUSItem = {
        ...baseItem,
        invalidNumbers: new Map([
            ['phone', '(213) 373-1234'],
            ['contact:phone', '(213) 373-5678'],
        ]),
        suggestedFixes: new Map([
            ['phone', '+1-213-373-1234'],
            ['contact:phone', '+1-213-373-5678'],
        ]),
    };

    const validGBItem = {
        ...baseItem,
        invalidNumbers: new Map([
            ['phone', '020 7946 0000'],
        ]),
        suggestedFixes: new Map([
            ['phone', '+44 20 7946 0000'],
        ]),
    };

    // =======================================================
    // Test: Success Scenarios
    // =======================================================

    test('should return true for a US item with multiple safe edits', () => {
        expect(isSafeItemEdit(validUSItem, 'US')).toBe(true);
    });

    test('should return true for a GB item with a single safe edit', () => {
        expect(isSafeItemEdit(validGBItem, 'GB')).toBe(true);
    });

    test('should return true for an item with no edits if all flags are clear', () => {
        expect(isSafeItemEdit(baseItem, 'US')).toBe(true);
    });

    // =======================================================
    // Test: Flag Failures
    // =======================================================

    test('should return false if autoFixable flag is false', () => {
        const item = { ...validUSItem, autoFixable: false };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });

    test('should return false if hasTypeMismatch flag is true', () => {
        const item = { ...validUSItem, hasTypeMismatch: true };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });

    test('should return false if mismatchTypeNumbers map is not empty', () => {
        const item = {
            ...validGBItem,
            mismatchTypeNumbers: new Map([['mobile', '020 1234 5678']]),
        };
        expect(isSafeItemEdit(item, 'GB')).toBe(false);
    });

    test('should return false if duplicateNumbers map is not empty', () => {
        const item = {
            ...validUSItem,
            duplicateNumbers: new Map([['phone', 'contact:phone']]),
        };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });

    // =======================================================
    // Test: Map Structure Failures
    // =======================================================

    test('should return false if invalidNumbers map size is greater than suggestedFixes map size', () => {
        const item = {
            ...validUSItem,
            invalidNumbers: new Map([['phone', '...'], ['contact:phone', '...']]),
            suggestedFixes: new Map([['phone', '...']]), // Missing contact:phone fix
        };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });

    test('should return false if invalidNumbers map size is smaller than suggestedFixes map size', () => {
        const item = {
            ...validUSItem,
            invalidNumbers: new Map([['phone', '...']]), // Missing contact:phone invalid
            suggestedFixes: new Map([['phone', '...'], ['contact:phone', '...']]),
        };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });


    test('should return false if a key from invalidNumbers is missing from suggestedFixes', () => {
        const item = {
            ...validUSItem,
            invalidNumbers: new Map([['phone', '(213) 373-1234'], ['contact:phone', '(213) 373-5678']]),
            suggestedFixes: new Map([['phone', '+1-213-373-1234'], ['mobile', '+1-213-373-5678']]), // contact:phone key is missing
        };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });

    // =======================================================
    // Test: isSafeEdit Failure
    // =======================================================

    test('should return false if even one individual edit fails the isSafeEdit check (foreign fix)', () => {
        const item = {
            ...baseItem,
            invalidNumbers: new Map([
                ['phone', '(213) 373-1234'], // PASSES
                ['phone', '+44-7712-900000'], // FAILS isSafeEdit because it suggests a +44 number
            ]),
            suggestedFixes: new Map([
                ['phone', '+1-213-373-1234'],
                ['phone', '+44 7712 900000'],
            ]),
        };
        const countryCode = 'US';
        expect(isSafeItemEdit(item, countryCode)).toBe(false);
    });

    test('should return false if an edit fails the isSafeEdit check (invalid new number)', () => {
        // This should never happen though
        const item = {
            ...baseItem,
            invalidNumbers: new Map([
                ['phone', '(213) 373-1234'], // PASSES
            ]),
            suggestedFixes: new Map([
                ['phone', '+1213373'], // FAILS isSafeEdit because it's too short to be valid
            ]),
        };
        const countryCode = 'US';
        expect(isSafeItemEdit(item, countryCode)).toBe(false);
    });
});
