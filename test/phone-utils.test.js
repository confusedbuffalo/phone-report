import {
    checkExclusions,
    convertPhonewordToDigits,
    getNumberAndExtension,
    getWhatsappNumber,
    insertMissingBrazilianNine,
    keyToRemove,
    parseStandardExtension,
    phoneTagToUse,
} from '../src/phone-utils';

describe('phoneTagToUse', () => {
    test('should return phone if no other tags are present', () => {
        expect(phoneTagToUse({})).toBe('phone');
    });

    test('should return contact:phone if it is present', () => {
        expect(phoneTagToUse({ 'contact:phone': '01234' })).toBe('contact:phone');
    });

    test('should return phone if both phone and contact:phone are present', () => {
        expect(phoneTagToUse({ 'contact:phone': '01234', phone: '06789' })).toBe('phone');
    });

    test('should return phone if it is present', () => {
        expect(phoneTagToUse({ phone: '01234' })).toBe('phone');
    });

    test('should not be affected by other tags', () => {
        expect(phoneTagToUse({ phone: '01234', mobile: '07123' })).toBe('phone');
    });
});

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

describe('convertPhonewordToDigits', () => {
    test('should convert uppercase phonewords to digits', () => {
        expect(convertPhonewordToDigits('1-800-FLOWERS')).toBe('1-800-3569377');
    });

    test('should convert lowercase phonewords to digits', () => {
        expect(convertPhonewordToDigits('1-800-flowers')).toBe('1-800-3569377');
    });

    test('should handle mixed case phonewords', () => {
        expect(convertPhonewordToDigits('1-800-Flowers')).toBe('1-800-3569377');
    });

    test('should leave non-alphabetic characters unchanged', () => {
        expect(convertPhonewordToDigits('1-800-4-YOU!')).toBe('1-800-4-968!');
    });

    test('should convert the entire alphabet correctly', () => {
        expect(convertPhonewordToDigits('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('22233344455566677778889999');
    });
});

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
    const GP = 'GP';
    const DE = 'DE'; // Non-excluded country
    const excludedNumber = '3631';
    const excludedNumberWithExtra = 'tel: 3631';
    const otherNumber = '4321'; // Non-excluded number
    const requiredTags = { amenity: 'post_office' };
    const irrelevantTags = { shop: 'bank', operator: 'La Banque Postale' };
    const emptyTags = {};

    // --- SUCCESS CASES: Should return the exclusion object ---

    test('should return exclusion result when country, number and tags match: FR', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const expected = {
            isInvalid: false,
            autoFixable: true,
            suggestedFix: excludedNumber,
        };
        expect(checkExclusions(phoneNumber, excludedNumber, FR, requiredTags)).toEqual(expected);
    });

    test('should return exclusion result when country, number and tags match: GP', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, GP);
        const expected = {
            isInvalid: false,
            autoFixable: true,
            suggestedFix: excludedNumber,
        };
        expect(checkExclusions(phoneNumber, excludedNumber, GP, requiredTags)).toEqual(expected);
    });

    test('should return fix result when country and tags match but extras on the number', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const expected = {
            isInvalid: true,
            autoFixable: true,
            suggestedFix: excludedNumber,
        };
        expect(checkExclusions(phoneNumber, excludedNumberWithExtra, FR, requiredTags)).toEqual(expected);
    });

    test('should return exclusion result when number and tags match, even with extra irrelevant tags', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const combinedTags = { ...requiredTags, ...irrelevantTags };
        const expected = {
            isInvalid: false,
            autoFixable: true,
            suggestedFix: excludedNumber,
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

    test('should return null when the required OSM tag value is incorrect', () => {
        const phoneNumber = mockPhoneNumber('115', DE);
        expect(checkExclusions(phoneNumber, '115', DE, { office: 'yes' })).toBeNull();
    });

    test('should return null when the required OSM tag is missing (empty tags)', () => {
        // Correct country and number, but no tags are passed
        const phoneNumber = mockPhoneNumber('115', DE);
        expect(checkExclusions(phoneNumber, '115', FR, emptyTags)).toBeNull();
    });

    test('should return null when no phoneNumber object is provided', () => {
        // Should handle the case where parsePhoneNumber failed and returned null
        expect(checkExclusions(null, null, FR, requiredTags)).toBeNull();
    });
});

describe('getNumberAndExtension', () => {
    // --- DE/AT (Germany/Austria) Specific Tests (DIN Format) ---

    describe('DE and AT Country Code (DIN Format)', () => {
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

    // --- TW (Taiwan) Specific Tests (Hash Format) ---

    describe('TW Country Code (Hash Format)', () => {
        test('should correctly parse hash-style extension when core number is valid', () => {
            expect(getNumberAndExtension('+886 2 2938 2300#630', 'TW')).toEqual({
                coreNumber: '+886 2 2938 2300',
                extension: '630',
                hasStandardExtension: true,
            });
        });

        test('should correctly parse hash-style extension with spaces around hash', () => {
            expect(getNumberAndExtension('+886 2 2938 2300 #630', 'TW')).toEqual({
                coreNumber: '+886 2 2938 2300',
                extension: '630',
                hasStandardExtension: true,
            });

            expect(getNumberAndExtension('+886 2 2938 2300# 630', 'TW')).toEqual({
                coreNumber: '+886 2 2938 2300',
                extension: '630',
                hasStandardExtension: true,
            });

            expect(getNumberAndExtension('+886 2 2938 2300 # 630', 'TW')).toEqual({
                coreNumber: '+886 2 2938 2300',
                extension: '630',
                hasStandardExtension: true,
            });
        });

        test('should parse tilde extension and mark as non-standard', () => {
            expect(getNumberAndExtension('+886 2 2938 2300~630', 'TW')).toEqual({
                coreNumber: '+886 2 2938 2300',
                extension: '630',
                hasStandardExtension: false,
            });
        });

        test('should parse Chinese extension and mark as non-standard', () => {
            expect(getNumberAndExtension('+886 2 2938 2300分機630', 'TW')).toEqual({
                coreNumber: '+886 2 2938 2300',
                extension: '630',
                hasStandardExtension: false,
            });
        });

        test('should fall back to standard extension parsing and mark as valid', () => {
            expect(getNumberAndExtension('+886 2 2938 2300 ext. 630', 'TW')).toEqual({
                coreNumber: '+886 2 2938 2300',
                extension: '630',
                hasStandardExtension: true,
            });
        });
    });

    // --- Standard (Fallback) Tests (Any Country Code other than DIN or TW) ---

    describe('Standard Format', () => {
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

describe('parseStandardExtension', () => {
    test('should parse an extension prefixed by "x"', () => {
        const result = parseStandardExtension('020 7946 0000 x123');
        expect(result.coreNumber).toEqual('020 7946 0000');
        expect(result.extension).toEqual('123');
        expect(result.hasStandardExtension).toBe(true);
    });

    test('should parse an extension prefixed by "x" without spaces', () => {
        const result = parseStandardExtension('020 7946 0000x123');
        expect(result.coreNumber).toEqual('020 7946 0000');
        expect(result.extension).toEqual('123');
        expect(result.hasStandardExtension).toBe(true);
    });

    test('should parse a non-standard extension prefixed by "x" with trailing space', () => {
        const result = parseStandardExtension('020 7946 0000 x 123');
        expect(result.coreNumber).toEqual('020 7946 0000');
        expect(result.extension).toEqual('123');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by uppercase "X"', () => {
        const result = parseStandardExtension('020 7946 0000 X123');
        expect(result.coreNumber).toEqual('020 7946 0000');
        expect(result.extension).toEqual('123');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse an extension prefixed by "ext."', () => {
        const result = parseStandardExtension('+44 20 7946 0000 ext. 456');
        expect(result.coreNumber).toEqual('+44 20 7946 0000');
        expect(result.extension).toEqual('456');
        expect(result.hasStandardExtension).toBe(true);
    });

    test('should parse a non-standard extension prefixed by "ext." without trailing space', () => {
        const result = parseStandardExtension('+44 20 7946 0000 ext.456');
        expect(result.coreNumber).toEqual('+44 20 7946 0000');
        expect(result.extension).toEqual('456');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "EXT." in uppercase', () => {
        const result = parseStandardExtension('+44 20 7946 0000 EXT. 456');
        expect(result.coreNumber).toEqual('+44 20 7946 0000');
        expect(result.extension).toEqual('456');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "ext" (without a dot)', () => {
        const result = parseStandardExtension('+44 20 7946 0000 ext456');
        expect(result.coreNumber).toEqual('+44 20 7946 0000');
        expect(result.extension).toEqual('456');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "extension"', () => {
        const result = parseStandardExtension('+44 20 7946 0000 extension 456');
        expect(result.coreNumber).toEqual('+44 20 7946 0000');
        expect(result.extension).toEqual('456');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "EXTENSION" in uppercase', () => {
        const result = parseStandardExtension('+44 20 7946 0000 EXTENSION 456');
        expect(result.coreNumber).toEqual('+44 20 7946 0000');
        expect(result.extension).toEqual('456');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "w."', () => {
        const result = parseStandardExtension('+48 22 825 91 00 w. 106');
        expect(result.coreNumber).toEqual('+48 22 825 91 00');
        expect(result.extension).toEqual('106');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "wew."', () => {
        const result = parseStandardExtension('+48 22 825 91 00 wew.106');
        expect(result.coreNumber).toEqual('+48 22 825 91 00');
        expect(result.extension).toEqual('106');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "wewn"', () => {
        const result = parseStandardExtension('+48 22 825 91 00 wewn 106');
        expect(result.coreNumber).toEqual('+48 22 825 91 00');
        expect(result.extension).toEqual('106');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a non-standard extension prefixed by "poste"', () => {
        const result = parseStandardExtension('+1-819-755-4833 poste 5421');
        expect(result.coreNumber).toEqual('+1-819-755-4833');
        expect(result.extension).toEqual('5421');
        expect(result.hasStandardExtension).toBe(false);
    });

    test('should parse a number without extension and return the original string', () => {
        const result = parseStandardExtension('0800 123 4567');
        expect(result.coreNumber).toEqual('0800 123 4567');
        expect(result.extension).toBeNull();
        expect(result.hasStandardExtension).toBeNull();
    });

    test('should parse a number with extension marker but no extension', () => {
        const result = parseStandardExtension('0800 123 4567 x');
        expect(result.coreNumber).toEqual('0800 123 4567');
        expect(result.extension).toBeNull();
        expect(result.hasStandardExtension).toBeNull();
    });
});

describe('insertMissingBrazilianNine', () => {
    test('insert missing 9 ', () => {
        const result = insertMissingBrazilianNine('+558891234567');
        expect(result).toEqual('+5588991234567');
    });

    test('return original when state code not followed by 8 or 9 ', () => {
        const result = insertMissingBrazilianNine('+558831234567');
        expect(result).toEqual('+558831234567');
    });

    test('return original for too short a number ', () => {
        const result = insertMissingBrazilianNine('+558812345');
        expect(result).toEqual('+558812345');
    });

    test('return original for different country code ', () => {
        const result = insertMissingBrazilianNine('+448812345678');
        expect(result).toEqual('+448812345678');
    });
});
