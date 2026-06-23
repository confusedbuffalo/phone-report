import { validateSingleTag } from '../../src/phone-processor';

describe('validateSingleTag', () => {
    test('correctly count total numbers processed', () => {
        const result = validateSingleTag('020 1234 5678; +44 20 7946 0000', 'GB');
        expect(result.numberOfValues).toBe(2);
    });

    test('single valid phone number is valid', () => {
        const result = validateSingleTag('+44 20 1234 5678', 'GB');
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
        const result = validateSingleTag('01389 123456', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456']);
    });

    test('leading 0 and country code is fixable', () => {
        const result = validateSingleTag('+44 01389 123456', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456']);
    });

    test('leading 0 and extraneous brackets is fixable', () => {
        const result = validateSingleTag('+44 (0) (1389) 123456', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456']);
    });

    test('number with extension is valid', () => {
        const result = validateSingleTag('+44 1389 123456 x104', 'GB');
        expect(result.isInvalid).toBe(false);
    });

    test('GB: valid number with comma before extension is invalid but autoFixable', () => {
        const result = validateSingleTag('+44 20 7946 0000, ext 123', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 20 7946 0000 x123']);
    });

    test('GB: valid number with escaped extension is invalid but autoFixable', () => {
        const result = validateSingleTag('+44 20 7946 0000\\;ext=123', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 20 7946 0000 x123']);
    });

    test('GB: valid number with escaped extension in double wrong format is invalid but autoFixable', () => {
        const result = validateSingleTag('+44 20 7946 0000\\;=ext=123', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 20 7946 0000 x123']);
    });

    test('using "or" as separator is fixable', () => {
        const result = validateSingleTag('+44 1389 123456 or +44 1389 123457', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);
    });

    test('using "and" as separator is fixable', () => {
        const result = validateSingleTag('+44 1389 123456 and +44 1389 123457', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);
    });

    test('using "ou" as separator is fixable', () => {
        const result = validateSingleTag('+44 1389 123456 ou +44 1389 123457', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);
    });

    test('using comma as separator is fixable', () => {
        const result = validateSingleTag('+44 1389 123456, +44 1389 123457', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);
    });

    test('using forward slash as separator is fixable', () => {
        const result_no_space = validateSingleTag('+44 1389 123456/+44 1389 123457', 'GB');
        expect(result_no_space.isInvalid).toBe(true);
        expect(result_no_space.isAutoFixable).toBe(true);
        expect(result_no_space.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);

        const result_one_space = validateSingleTag('+44 1389 123456/ +44 1389 123457', 'GB');
        expect(result_one_space.isInvalid).toBe(true);
        expect(result_one_space.isAutoFixable).toBe(true);
        expect(result_one_space.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);

        const result_two_spaces = validateSingleTag('+44 1389 123456/ +44 1389 123457', 'GB');
        expect(result_two_spaces.isInvalid).toBe(true);
        expect(result_two_spaces.isAutoFixable).toBe(true);
        expect(result_two_spaces.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);
    });

    test('using forward slash as separator is fixable in AT where slash is usually a spacing character', () => {
        const result = validateSingleTag('+43 664 1234567 / +43 3332 12345', 'AT');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+43 664 1234567', '+43 3332 12345']);
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
        const result = validateSingleTag('https://wa.me/message/ZQ4YRTMO7OUAJ1', 'GB', {}, 'contact:whatsapp');
        expect(result.isInvalid).toBe(false);
    });

    test('fix one fixable number and keep existing valid number', () => {
        const result = validateSingleTag('+44 1389 123456; 01389 123457', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+44 1389 123456', '+44 1389 123457']);
    });

    test('one valid and one invalid makes the whole thing invalid and unfixable', () => {
        const result = validateSingleTag('+44 1389 123456; +44 1389', 'GB');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
    });

    test('mobile number and non-mobile number in mobile tag is invalid but fixable', () => {
        const result = validateSingleTag('+44 1389 123456; +44 7496 123456', 'GB', {}, 'mobile');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.mismatchTypeNumbers).toEqual(['+44 1389 123456']);
        expect(result.suggestedNumbersList).toEqual(['+44 7496 123456']);
        expect(result.numberOfValues).toEqual(2);
    });

    test('double plus can be fixed', () => {
        const result = validateSingleTag('++44 1389 123456', 'GB');
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

    test('GP: an incorrect leading plus is fixable', () => {
        const result = validateSingleTag('+590 82 00 00', 'GP');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+590 590 82 00 00']);
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

    describe('US: incorrect leading plus in front of number that would be valid in a different coutry is fixable to +1 if it looks like standard NANP format', () => {
        test.each(['+(516) 733-8400', '+516-733-8400', '+516 733 8400', '+516 733-8400'])('%s', numberStr => {
            const result = validateSingleTag(numberStr, 'US');
            expect(result.isInvalid).toBe(true);
            expect(result.isAutoFixable).toBe(true);
            expect(result.suggestedNumbersList).toEqual(['+1-516-733-8400']);
        });
    });

    test('US: incorrect leading plus for number actually in different country in NANP is fixable if it looks like NANP format', () => {
        // This is a number for CA
        const result = validateSingleTag('+647-937-1234', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+1-647-937-1234']);
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
        expect(result.suggestedNumbersList).toEqual(['+1-870-525-3769']);
    });

    test('AU: phonewords is fixable', () => {
        const result = validateSingleTag('1300-TICKET', 'AU');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.validPhonewords).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['1300 842 538']);
    });

    test('US: give up with multiple phonewords in a single tag', () => {
        const result = validateSingleTag('1-870-KAKESNY; 1-870-KAKESNJ', 'US');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
        expect(result.validPhonewords).toBe(false);
    });

    test('fix slash used to denote multiple endings to a number', () => {
        const result = validateSingleTag('+212522941234/45', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+212 5 22 94 12 34', '+212 5 22 94 12 45']);
    });

    test('fix slash used to denote multiple endings to a number (1 digit)', () => {
        const result = validateSingleTag('+212522941234/5', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+212 5 22 94 12 34', '+212 5 22 94 12 35']);
    });

    test('fix slash used to denote multiple endings to a number (4 digits)', () => {
        const result = validateSingleTag('+212522941234/3579', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.suggestedNumbersList).toEqual(['+212 5 22 94 12 34', '+212 5 22 94 35 79']);
    });

    test('slash cannot denote alternate ending longer than 4 digits', () => {
        const result = validateSingleTag('+212522941234/56789', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
    });

    describe('fix slash used for multiple endings after area code in BR', () => {
        test.each([
            { tagStr: '+55 27 3259 1234/3259 4321', numberList: ['+55 27 3259 1234', '+55 27 3259 4321'] },
            { tagStr: '+55 27 3259 1234 /3259 4321', numberList: ['+55 27 3259 1234', '+55 27 3259 4321'] },
            { tagStr: '+55 27 3259 1234 / 3259 4321', numberList: ['+55 27 3259 1234', '+55 27 3259 4321'] },
            { tagStr: '(28) 3524-1234 / 3524-4321', numberList: ['+55 28 3524 1234', '+55 28 3524 4321'] },
        ])('%s', ({ tagStr, numberList }) => {
            const result = validateSingleTag(tagStr, 'BR');
            expect(result.isInvalid).toBe(true);
            expect(result.isAutoFixable).toBe(true);
            expect(result.suggestedNumbersList).toEqual(numberList);
        });
    });

    test('slash as alternate endings is invalid if the core number is invalid', () => {
        const result = validateSingleTag('+21252294123/31', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
    });

    test('give up if slash might be used to denote more than two options for endings', () => {
        const result = validateSingleTag('+212522941234/35/46', 'MA');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
    });

    test('Should find foreign number when assuming a different country code', () => {
        const result = validateSingleTag('+44 2079460000', 'US');
        expect(result.isInvalid).toBe(false);
        expect(result.validForeignNumbersMap.size).toEqual(1);

        const expected = new Map([['+44 2079460000', 'GB']]);
        expect(result.validForeignNumbersMap).toEqual(expected);
    });

    test('Should find foreign number among valid number for the country', () => {
        const result = validateSingleTag('+44 2079460000; +1-304-845-9810', 'US');
        expect(result.isInvalid).toBe(false);
        expect(result.validForeignNumbersMap.size).toEqual(1);

        const expected = new Map([['+44 2079460000', 'GB']]);
        expect(result.validForeignNumbersMap).toEqual(expected);
    });
});
