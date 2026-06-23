import { processSingleNumber } from '../../src/phone-processor';

describe('processSingleNumber', () => {
    // --- GB Tests (London number: 020 7946 0000) ---

    test('GB: consider no spacing to be valid', () => {
        const result = processSingleNumber('+442079460000', 'GB');
        expect(result.isInvalid).toBe(false);
    });

    test('GB: consider space after plus to be invalid and fixable', () => {
        const result = processSingleNumber('+ 44 20 79 46 00 00', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
        expect(result.autoFixable).toBe(true);
    });

    test('GB: double space is invalid and fixable', () => {
        const result = processSingleNumber('+44  20 79 46 00 00', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
        expect(result.autoFixable).toBe(true);
    });

    test('GB: correctly validate and format a simple valid local number', () => {
        const result = processSingleNumber('02079460000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
        expect(result.autoFixable).toBe(true);
    });

    test('GB: correctly validate and format an international valid number', () => {
        const result = processSingleNumber('+44 20 7946 0000', 'GB');
        expect(result.isInvalid).toBe(false);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: flag a valid number with bad internal spacing as invalid but autoFixable', () => {
        const result = processSingleNumber('020 7946  0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: flag a valid number with extension as valid', () => {
        const result = processSingleNumber('+44 20 7946 0000 x123', 'GB');
        expect(result.isInvalid).toBe(false);
    });

    test('GB: flag a valid number with non-standard extension abbreviated as invalid but autoFixable', () => {
        const result = processSingleNumber('+44 20 7946 0000 ext.123', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000 x123');
    });

    test('GB: flag a valid number with non-standard extension as invalid but autoFixable', () => {
        const result = processSingleNumber('+44 20 7946 0000 extension 123', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000 x123');
    });

    test('GB: mobile number in phone tag is valid', () => {
        const result = processSingleNumber('+44 7946 123456', 'GB');
        expect(result.isInvalid).toBe(false);
    });

    test('GB: non-mobile number in mobile tag is invalid', () => {
        const result = processSingleNumber('+44 20 7946 0000', 'GB', {}, 'mobile');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.typeMismatch).toBe(true);
    });

    test('GB: toll free phone number without country code is valid', () => {
        const result = processSingleNumber('0800 00 1234', 'GB');
        expect(result.isInvalid).toBe(false);
    });

    test('GB: toll free phone number with country code is valid', () => {
        const result = processSingleNumber('+44 800 00 1234', 'GB');
        expect(result.isInvalid).toBe(false);
    });

    test('GB: toll free phone number with dashes is fixable to national format', () => {
        const result = processSingleNumber('0800-00-1234', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('0800 001234');
    });

    test('GB: toll free phone number with country code and invalid formatting is fixable to international format', () => {
        const result = processSingleNumber('(+44) 0800 00 1234', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 800 001234');
    });

    test('GB: toll free phone number with 00 and country code is fixable to international format', () => {
        const result = processSingleNumber('0044 0800 00 1234', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 800 001234');
    });

    test('GB: a number with tabs is invalid but fixable', () => {
        const result = processSingleNumber('+44 20\t7946\t0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with thin spaces is invalid but fixable', () => {
        const result = processSingleNumber('+44 20 7946 00 00', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with underscores is invalid but fixable', () => {
        const result = processSingleNumber('+44 20_7946_0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with middle dots is invalid but fixable', () => {
        const result = processSingleNumber('+44 20·7946·0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with tildes as spaces is invalid but fixable', () => {
        const result = processSingleNumber('+44~20~7946~0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with pop directional isolate is invalid but fixable', () => {
        const result = processSingleNumber('+44 \u206920 7946 0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with first strong isolate is invalid but fixable', () => {
        const result = processSingleNumber('+44 \u206820 7946 0000', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: a number with left to right isolate and pop directional formatting is invalid but fixable', () => {
        const result = processSingleNumber('+44 \u202D20 7946 0000\u202C', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    // --- ZA Tests (Johannesburg number: 011 555 1234) ---

    test('ZA: correctly validate and format a simple valid local number', () => {
        // Local ZA format including trunk prefix '0'
        const result = processSingleNumber('011 555 1234', 'ZA');
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+27 11 555 1234');
        expect(result.autoFixable).toBe(true);
    });

    test('ZA: correctly validate and format an international valid number', () => {
        const result = processSingleNumber('+27 11 555 1234', 'ZA');
        expect(result.isInvalid).toBe(false);
    });

    test('ZA: flag a clearly invalid (too short) number as invalid and unfixable', () => {
        const result = processSingleNumber('011 555', 'ZA');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
        expect(result.suggestedFix).toBe(null);
    });

    test('ZA: possible phonewords in a country where this is not common is invalid and unfixable', () => {
        const result = processSingleNumber('+27 51 435 GPJA', 'ZA');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
        expect(result.suggestedFix).toBe(null);
        expect(result.validPhonewords).toBe(false);
    });

    // --- USA Tests (+1 213 373 4253) ---

    test('US: correctly validate and format a simple valid local number', () => {
        const result = processSingleNumber('213 373 4253', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+1-213-373-4253');
        expect(result.autoFixable).toBe(true);
    });

    test('US: bad spacing is not invalid', () => {
        const result = processSingleNumber('+121 337 34253', 'US');
        expect(result.isInvalid).toBe(false);
    });

    test('US: dashes is not invalid', () => {
        const result = processSingleNumber('+1-213-373-4253', 'US');
        expect(result.isInvalid).toBe(false);
    });

    test('US: consecutive dashes is invalid and fixable', () => {
        const result = processSingleNumber('+1-213--373-4253', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+1-213-373-4253');
        expect(result.autoFixable).toBe(true);
    });

    test('US: toll free number is fixable to international format', () => {
        const result = processSingleNumber('866-590-0601', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+1-866-590-0601');
    });

    test('US: a valid number with extension is valid', () => {
        const result = processSingleNumber('+1 304-845-9810 x403', 'US');
        expect(result.isInvalid).toBe(false);
    });

    test('US: flag a valid number with non-standard extension as invalid but autoFixable', () => {
        const result = processSingleNumber('+1-304-845-9810 extension 403', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+1-304-845-9810 x403');
    });

    test('US: fix a phonewords number', () => {
        const result = processSingleNumber('1-870-KAKESNY', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedFix).toBe('+1-870-525-3769');
    });

    test('US: fix a phonewords number in lowercase', () => {
        const result = processSingleNumber('1-870-kakesny', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedFix).toBe('+1-870-525-3769');
    });

    test('US: letters in the middle of a number is not valid phonewords', () => {
        const result = processSingleNumber('1-870-kak-3769', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('AU: fix a phonewords number', () => {
        const result = processSingleNumber('1300-TICKET', 'AU');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedFix).toBe('1300 842 538');
    });

    test('NZ: fix a phonewords number', () => {
        const result = processSingleNumber('0800-PHONES', 'NZ');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedFix).toBe('0800 746 637');
    });

    test('SG: fix a phonewords number', () => {
        const result = processSingleNumber('1800-SINGAPO', 'SG'); // 7 letters
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedFix).toBe('1800 746 4276');
    });

    // --- PL Tests ---

    test('PL: leading 0 is invalid but fixable', () => {
        const result = processSingleNumber('0586774478', 'PL');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78');
    });

    test('PL: leading 0 is invalid but too short is invalid', () => {
        const result = processSingleNumber('+48 02787', 'PL');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('PL: leading 0 is invalid but fixable with country code', () => {
        const result = processSingleNumber('+48 0586774478', 'PL');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78');
    });

    test('PL: leading 0 is invalid but fixable with country code and extension', () => {
        const result = processSingleNumber('+48 0586774478 ext. 3', 'PL');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78 x3');
    });

    test('PL: all 0s is invalid ("possible" number, but not "valid" number)', () => {
        const result = processSingleNumber('0000000000', 'PL');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('PL: extension as wew. is invalid and fixable', () => {
        const result = processSingleNumber('+48 0586774478 wew. 123', 'PL');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78 x123');
    });

    test('PL: extension as wewn in brackets is invalid and fixable', () => {
        const result = processSingleNumber('+48 0586774478 (wewn 123)', 'PL');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+48 58 677 44 78 x123');
    });

    // --- DE Tests ---
    test('DE: DIN format extension is valid', () => {
        const result = processSingleNumber('+49 491 4567-1234', 'DE');
        expect(result.isInvalid).toBe(false);
    });

    test('DE: DIN format extension with figure dash is invalid and fixable', () => {
        const result = processSingleNumber('+49 491 4567‒1234', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 491 4567-1234');
    });

    test('DE: DIN format extension with 5 digit extension is valid', () => {
        const result = processSingleNumber('+49 491 4567-12345', 'DE');
        expect(result.isInvalid).toBe(false);
    });

    test('DE: hyphen and DIN format extension is invalid and fixable', () => {
        const result = processSingleNumber('+49 491-4567-1234', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 491 4567-1234');
    });

    test('DE: hyphen and DIN format extension with spaces is invalid and fixable', () => {
        const result = processSingleNumber('+49 491-4567 - 1234', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 491 4567-1234');
    });

    test('DE: hyphens not denoting extension is invalid and fixable', () => {
        const result = processSingleNumber('+49-4761-3163', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 4761 3163');
    });

    test('DE: number starting with 49 is invalid and not fixable', () => {
        const result = processSingleNumber('49 4761 3163', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('DE: number starting with (+49) is valid and fixable', () => {
        const result = processSingleNumber('(+49) 04761 3163', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+49 4761 3163');
    });

    test('DE: number starting with some other characters than 49 is invalid and unfixable', () => {
        const result = processSingleNumber('-49 521 557666', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    test('DE: toll free number is fixable to national format', () => {
        const result = processSingleNumber('(0800) 1234 567', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('0800 1234567');
    });

    test('DE: toll free number with extension in national format is valid', () => {
        const result = processSingleNumber('0800 1234 567-123', 'DE');
        expect(result.isInvalid).toBe(false);
    });

    test('DE: toll free number already in international format is invalid and fixable to national format', () => {
        const result = processSingleNumber('+49 800 1234 567', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('0800 1234567');
    });

    test('DE: shared cost number with extension in national format is fixable to international format', () => {
        const result = processSingleNumber('0180 4 370037-358', 'DE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+49 180 4 370037-358');
    });

    test('DE: shared cost number with extension in international format is valid', () => {
        const result = processSingleNumber('+49 180 4 370037-358', 'DE');
        expect(result.isInvalid).toBe(false);
    });

    test('AT: toll free number is valid and fixable to national format', () => {
        const result = processSingleNumber('800 8481 0000', 'AT');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('0800 84810000');
    });

    // --- FR Tests ---
    test('FR: shared cost number in national format is valid', () => {
        const result = processSingleNumber('0820 39 39 00', 'FR');
        expect(result.isInvalid).toBe(false);
    });

    test('FR: shared cost number in international format is invalid and fixable to national format', () => {
        const result = processSingleNumber('+33 820 39 39 00', 'FR');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('0 820 39 39 00');
    });

    test('FR/RE: toll free number in international format is valid in a different country', () => {
        const result = processSingleNumber('+33 800 39 39 00', 'RE');
        expect(result.isInvalid).toBe(false);
        expect(result.foreign).toBe('FR');
    });

    test('FR/US: toll free number in international format is valid in a different country', () => {
        const result = processSingleNumber('+1-800-331-1234', 'FR');
        expect(result.isInvalid).toBe(false);
        expect(result.foreign).toBe('US');
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

    // --- MA Tests ---
    test('MA: no spacing is fixable', () => {
        const result = processSingleNumber('+212522312345', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+212 5 22 31 23 45');
    });

    test('MA: no spacing after country code but other spacing is fixable', () => {
        const result = processSingleNumber('+2125223 12345', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+212 5 22 31 23 45');
    });

    test('MA: space after plus is fixable', () => {
        const result = processSingleNumber('+ 212 5 22 31 23 45', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+212 5 22 31 23 45');
    });

    test('MA: unusual spacing is valid', () => {
        const result = processSingleNumber('+212 522 312 345', 'MA');
        expect(result.isInvalid).toBe(false);
    });

    // --- TW Tests ---
    test('TW: Hash format extension is valid', () => {
        const result = processSingleNumber('+886 2 2938 2300#630', 'TW');
        expect(result.isInvalid).toBe(false);
    });

    test('TW: Standard format extension is valid', () => {
        const result = processSingleNumber('+886 2 2938 2300 ext. 630', 'TW');
        expect(result.isInvalid).toBe(false);
    });

    test('TW: Extension using tilde is invalid and fixable', () => {
        const result = processSingleNumber('+886 2 2938 2300~630', 'TW');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+886 2 2938 2300#630');
    });

    test('TW: Chinese extension is invalid and fixable', () => {
        const result = processSingleNumber('+886 2 2938 2300分機630', 'TW');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+886 2 2938 2300#630');
    });

    test('TW: Hash extension with space is valid', () => {
        const result = processSingleNumber('+886 2 2938 2300 #630', 'TW');
        expect(result.isInvalid).toBe(false);
    });

    // --- National Toll Free Tests ---
    test('SE: Toll free number in national format is fixed to spaces', () => {
        const result = processSingleNumber('0771-369-123', 'SE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('077 136 91 23');
    });

    test('BR: Shared cost number in national format is fixed to spaces', () => {
        const result = processSingleNumber('4001-1234', 'BR');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('4001 1234');
    });

    test('PE: Toll free number in national format is fixed to spaces or brackets', () => {
        const result = processSingleNumber('0800-12345', 'PE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('0800 12345');
    });

    test('VE: Toll free number in national format is fixed to spaces', () => {
        const result = processSingleNumber('0800-1234567', 'VE');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('0800 1234567');
    });

    test('TR: UAN number in national format is valid', () => {
        const result = processSingleNumber('444 1234', 'TR');
        expect(result.isInvalid).toBe(false);
    });

    test('TR: UAN number in international format is fixed to national format', () => {
        const result = processSingleNumber('+90 444 1234', 'TR');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('4441234');
    });

    // --- AR Tests ---
    describe('AR: All spaces as separators is valid', () => {
        test.each([
            '+54 11 4551 1234',
            '+54 11 45511234',
            '+54 1145511234',
            '+54 388 423 1234',
            '+54 388 4231234',
            '+54 3884231234',
            '+54 3543 43 1234',
            '+54 3543 431234',
            '+54 9 11 4551 1234',
            '+54 9 388 423 1234',
            '+54 9 3543 43 1234',
            '0800 123 4567',
        ])('%s', numberStr => {
            const result = processSingleNumber(numberStr, 'AR');
            expect(result.isInvalid).toBe(false);
        });
    });

    describe('AR: Hyphen before the final group is valid', () => {
        test.each([
            '+54 11 4551-1234',
            '+54 388 423-1234',
            '+54 3543 43-1234',
            '+54 9 11 4551-1234',
            '+54 9 388 423-1234',
            '+54 9 3543 43-1234',
        ])('%s', numberStr => {
            const result = processSingleNumber(numberStr, 'AR');
            expect(result.isInvalid).toBe(false);
        });
    });

    describe('AR: Hyphens in other positions is invalid and fixable to all spaces', () => {
        test.each([
            { numberStr: '+54 11-4551 1234', suggestedFix: '+54 11 4551 1234' },
            { numberStr: '+54 11-4551-1234', suggestedFix: '+54 11 4551 1234' },
            { numberStr: '+54 388-423 1234', suggestedFix: '+54 388 423 1234' },
            { numberStr: '+54 388-423-1234', suggestedFix: '+54 388 423 1234' },
            { numberStr: '+54 3543-43 1234', suggestedFix: '+54 3543 43 1234' },
            { numberStr: '+54 3543-43-1234', suggestedFix: '+54 3543 43 1234' },
            { numberStr: '+54-3543-43 1234', suggestedFix: '+54 3543 43 1234' },
            { numberStr: '0800-123-4567', suggestedFix: '0800 123 4567' },
        ])('%s', ({ numberStr, suggestedFix }) => {
            const result = processSingleNumber(numberStr, 'AR');
            expect(result.isInvalid).toBe(true);
            expect(result.autoFixable).toBe(true);
            expect(result.suggestedFix).toEqual(suggestedFix);
        });
    });

    // --- BR Tests ---
    describe('BR: All spaces as separators is valid', () => {
        test.each([
            '+55 55 98473 1234',
            '+55 55 984731234',
            '+55 55984731234',
            '+55 51 3221 4616',
            '+55 51 32214616',
            '+55 513221 4616',
            '+55 84 9 9130 7963',
            '+55 84 9 91307963',
            '+55 84 991307963',
            '+55 84991307963',
        ])('%s', numberStr => {
            const result = processSingleNumber(numberStr, 'BR');
            expect(result.isInvalid).toBe(false);
        });
    });

    describe('BR: Hyphen before the final group is valid', () => {
        test.each([
            '+55 55 98473-1234',
            '+55 5598473-1234',
            '+55 51 3221-4616',
            '+55 513221-4616',
            '+55 84 9 9130-7963',
            '+55 84 99130-7963',
            '+55 8499130-7963',
        ])('%s', numberStr => {
            const result = processSingleNumber(numberStr, 'BR');
            expect(result.isInvalid).toBe(false);
        });
    });

    describe('BR: Hyphens in other positions is invalid and fixable to all spaces', () => {
        test.each([
            { numberStr: '+55 55-98473-1234', suggestedFix: '+55 55 98473 1234' },
            { numberStr: '+55 51-3221 1234', suggestedFix: '+55 51 3221 1234' },
            { numberStr: '+55 51322112-34', suggestedFix: '+55 51 3221 1234' },
            { numberStr: '+55-51-3221-1234', suggestedFix: '+55 51 3221 1234' },
            { numberStr: '+55-84-9-9130-1234', suggestedFix: '+55 84 99130 1234' },
            { numberStr: '+55-84-9-9130 1234', suggestedFix: '+55 84 99130 1234' },
            { numberStr: '+55 84 9-9130-1234', suggestedFix: '+55 84 99130 1234' },
        ])('%s', ({ numberStr, suggestedFix }) => {
            const result = processSingleNumber(numberStr, 'BR');
            expect(result.isInvalid).toBe(true);
            expect(result.autoFixable).toBe(true);
            expect(result.suggestedFix).toEqual(suggestedFix);
        });
    });

    describe('ID: number starting with 62 is invalid and not fixable', () => {
        test.each(['62435123456', '*62435123456', '62 435 123456'])('%s', numberStr => {
            const result = processSingleNumber(numberStr, 'ID');
            expect(result.isInvalid).toBe(true);
            expect(result.autoFixable).toBe(false);
        });
    });

    describe('ID: number starting with +62 and invalid in some way is still fixable', () => {
        test.each(['+62(435)123456', '*+62435123456', '(+62) 435 123456'])('%s', numberStr => {
            const result = processSingleNumber(numberStr, 'ID');
            expect(result.isInvalid).toBe(true);
            expect(result.autoFixable).toBe(true);
            expect(result.suggestedFix).toEqual('+62 435 123456');
        });
    });

    describe('ID: hyphens are a valid spacing character', () => {
        test.each(['+62 435-123456', '+62-435-123456', '+62-435-123-456', '+62 435-123-456', '+62 435-123456'])(
            '%s',
            numberStr => {
                const result = processSingleNumber(numberStr, 'ID');
                expect(result.isInvalid).toBe(false);
            }
        );
    });

    // --- WhatsApp Tests ---
    test('Whatsapp number is fixable', () => {
        const result = processSingleNumber('27123456789', 'ZA', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('Whatsapp number in partal link is fixable', () => {
        const result = processSingleNumber('wa.me/27123456789', 'ZA', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('Whatsapp number in full link is fixable', () => {
        const result = processSingleNumber('https://wa.me/27123456789', 'ZA', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('Whatsapp number with encoded plus in full link is fixable', () => {
        const result = processSingleNumber(
            'https://api.whatsapp.com/send?phone=%2B27123456789',
            'ZA',
            {},
            'contact:whatsapp'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('Whatsapp number in full link is fixable even in different country', () => {
        const result = processSingleNumber('https://wa.me/27123456789', 'GB', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+27 12 345 6789');
    });

    test('Valid WhatsApp link with toll free phone number is invalid and fixable to international format', () => {
        const result = processSingleNumber(
            'https://api.whatsapp.com/send?phone=5508000874000',
            'BR',
            {},
            'contact:whatsapp'
        );
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+55 800 087 4000');
    });

    test('wa.me message link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://wa.me/message/ZQ4YRTMO7OUAJ1', 'ZA', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('wa.me qr link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://wa.me/qr/ZQ4YRTMO7OUAJ1', 'ZA', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('wa.me catalogue link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://wa.me/c/123456798', 'ZA', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('Whatsapp channel link is valid in whatsapp key', () => {
        const result = processSingleNumber('https://www.whatsapp.com/channel/ABCD1234', 'ZA', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('Whatsapp channel link is invalid in other key', () => {
        const result = processSingleNumber('https://www.whatsapp.com/channel/ABCD1234', 'ZA', {}, 'contact:mobile');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    // --- Foreign number tests ---
    test('Valid GB number assuming US country code is valid foreign', () => {
        const result = processSingleNumber('+442079460000', 'US');
        expect(result.isInvalid).toBe(false);
        expect(result.foreign).toBe('GB');
    });

    test('Valid GB number assuming GB country code is not foreign', () => {
        const result = processSingleNumber('+442079460000', 'GB');
        expect(result.isInvalid).toBe(false);
        expect(result.foreign).toBe(null);
    });

    test('Valid toll free number is not foreign in non-US NANP country', () => {
        const result = processSingleNumber('+1-888-865-1234', 'CA');
        expect(result.isInvalid).toBe(false);
        expect(result.foreign).toBe(null);
    });

    test('Should fix number with zero width joiner', () => {
        const result = processSingleNumber('+1-88\u200D8-865-1234', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toEqual('+1-888-865-1234');
    });

    test('Toll free number with extension is valid in NANP', () => {
        const result = processSingleNumber('+1-800-331-1234 x1', 'US');
        expect(result.isInvalid).toBe(false);
    });
});
