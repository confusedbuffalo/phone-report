const {
    safeName,
    stripExtension,
    checkExclusions,
    processSingleNumber,
    validateNumbers,
    getFeatureTypeName,
    isDisused,
    validateSingleTag,
    phoneTagToUse,
    keyToRemove
} = require('../src/data-processor');

const SAMPLE_COUNTRY_CODE_GB = 'GB';
const SAMPLE_COUNTRY_CODE_US = 'US';
const SAMPLE_COUNTRY_CODE_ZA = 'ZA';
const SAMPLE_COUNTRY_CODE_PL = 'PL';

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
// stripExtension Tests
// =====================================================================
describe('stripExtension', () => {
    test('should strip an extension prefixed by "x"', () => {
        expect(stripExtension('020 7946 0000 x123')).toBe('020 7946 0000');
    });

    test('should strip an extension prefixed by "ext"', () => {
        expect(stripExtension('+44 20 7946 0000 ext. 456')).toBe('+44 20 7946 0000');
    });

    test('should return the original string if no extension is present', () => {
        expect(stripExtension('0800 123 4567')).toBe('0800 123 4567');
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
 * * @param {string} nationalNumber - The core national number of the phone number.
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
    const otherNumber = '1234'; // Non-excluded number
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

    test('GB: flag a valid number with non-standard extension as invalid but autoFixable', () => {
        const result = processSingleNumber('+44 20 7946 0000 ext.123', SAMPLE_COUNTRY_CODE_GB);
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

    // --- USA Tests (+1 213 373 4253) ---

    test('US: correctly validate and format a simple valid local number', () => {
        const result = processSingleNumber('213 373 4253', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+1 213-373-4253');
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

    test('PL: leading 0 is invaid but fixable', () => {
        const result = processSingleNumber('0586774478', SAMPLE_COUNTRY_CODE_PL);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78');
    });

    test('PL: leading 0 is invaid but fixable with country code', () => {
        const result = processSingleNumber('+48 0586774478', SAMPLE_COUNTRY_CODE_PL);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78');
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
});

// =====================================================================
// validateNumbers Tests
// =====================================================================
describe('validateNumbers', () => {
    const COUNTRY_CODE = 'GB';

    // UK numbers used for testing
    const VALID_LANDLINE = '+44 20 7946 0000';
    const VALID_LANDLINE_NO_SPACE = '+442079460000';
    const FIXABLE_LANDLINE_INPUT = '0207 9460000';
    const FIXABLE_LANDLINE_SUGGESTED_FIX = '+44 20 7946 0000';
    const VALID_LANDLINE_2 = '+44 20 7946 1111';
    const UNFIXABLE_INPUT = '020 794'; // Too short
    const BAD_SEPARATOR_INPUT = '020 7946 0000, 07712 900000';
    const BAD_SEPARATOR_FIX = '+44 20 7946 0000; +44 7712 900000';
    const VALID_MOBILE = '+44 7712 900000';
    const FIXABLE_MOBILE_INPUT = '07712  900000';
    const FIXABLE_MOBILE_SUGGESTED_FIX = '+44 7712 900000';

    test('should correctly identify a single valid number and return zero invalid items', () => {
        const elements = [
            {
                type: 'node',
                id: 1001,
                tags: { phone: VALID_LANDLINE, name: 'Valid Shop' },
                lat: 51.5,
                lon: 0.0,
            },
        ];

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidNumbers).toHaveLength(0);
    });

    test('should identify a single fixable invalid number (no country code) and provide suggested fix', () => {
        const elements = [
            {
                type: 'way',
                id: 2002,
                tags: { 'contact:phone': FIXABLE_LANDLINE_INPUT, name: 'Fixable Business' },
                center: { lat: 52.0, lon: 1.0 },
            },
        ];

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.id).toBe(2002);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('should identify a fundamentally unfixable number (too short) and mark it as unfixable', () => {
        const elements = [
            {
                type: 'node',
                id: 3003,
                tags: { mobile: UNFIXABLE_INPUT, name: 'Short Mobile' },
                lat: 53.0,
                lon: 2.0,
            },
        ];

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(false);
        expect(invalidItem.invalidNumbers.mobile).toBe(UNFIXABLE_INPUT);
    });

    test('should handle multiple numbers in a single tag using a bad separator (comma)', () => {
        const elements = [
            {
                type: 'node',
                id: 4004,
                tags: { phone: BAD_SEPARATOR_INPUT, name: 'Multiple Contacts' },
                lat: 54.0,
                lon: 3.0,
            },
        ];

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(BAD_SEPARATOR_INPUT);
        expect(invalidItem.suggestedFixes.phone).toBe(BAD_SEPARATOR_FIX);
    });

    test('should aggregate results from multiple phone tags on a single element', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(3);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

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

    test('should correctly process website tag (without protocol) and include protocol in base item', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.website).toBe(`http://${websiteInput}`);
    });

    test('should not change website tag if it already has a protocol', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.website).toBe(websiteInput);
    });

    test('should correctly calculate totalNumbers across multiple elements', () => {
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
                tags: { mobile: BAD_SEPARATOR_INPUT }, // 2 numbers, invalid
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        // 1 (7001) + 1 (7002) + 2 (7003) = 4 total numbers checked
        expect(result.totalNumbers).toBe(4);
        expect(result.invalidNumbers).toHaveLength(2); // Elements 7002 and 7003 are invalid
    });

    test('should do nothing with mobile=yes and process actual phone number', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'phone': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'phone': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('should fix and move landline number out of mobile tag', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(1);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_INPUT
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': null,
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            "contact:mobile": FIXABLE_LANDLINE_SUGGESTED_FIX
        });
    });

    test('should keep mobile number in mobile tag when moving another number out', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': `${FIXABLE_LANDLINE_INPUT}; ${FIXABLE_MOBILE_INPUT}`
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': FIXABLE_MOBILE_SUGGESTED_FIX
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_SUGGESTED_FIX
        });
    });

    test('should remove duplicate number in different tags', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': VALID_LANDLINE
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            'phone': VALID_LANDLINE
        });
    });

    test('should remove duplicate number in the same tag', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE}`,
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE}`
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE
        });
    });

    test('should remove duplicate numbers with different formatting in the same tag', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE
        });
    });

    test('should fix duplicate numbers with different formatting in the same tag', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': `${FIXABLE_LANDLINE_INPUT}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${FIXABLE_LANDLINE_INPUT}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE
        });
    });

    test('different extensions are not duplicates', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(0);
    });

    test('different spacing is still a duplicate', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': VALID_LANDLINE_NO_SPACE
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE_NO_SPACE
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            'phone': VALID_LANDLINE
        });
    });

    test('fixable and correct formatting are duplicates', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            'phone': VALID_LANDLINE
        });
    });

    test('duplicate non-mobile numbers in phone and mobile are duplicate, not type mismatch', () => {
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

        const result = validateNumbers(elements, COUNTRY_CODE);

        expect(result.totalNumbers).toBe(2);
        expect(result.invalidNumbers).toHaveLength(1);
        const invalidItem = result.invalidNumbers[0];

        expect(invalidItem.hasTypeMismatch).toBe(false);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'mobile': VALID_LANDLINE
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'mobile': VALID_LANDLINE
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'mobile': null,
            'phone': VALID_LANDLINE
        });
    });
});