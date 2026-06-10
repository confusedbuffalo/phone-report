import { isSafeEdit, isSafeItemEdit } from '../src/phone-safe-edits';

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

    test('GB: should return true for a safe edit where for toll free number in international format', () => {
        const originalNumber = '+44 800 00 1234';
        const newNumber = '+44 800 001234';
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
        // Parsed as a US number by default, not possible to differentiate country for toll free numbers
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
        const originalNumber = '07712 900000';
        const newNumber = '+447712900000';
        const countryCode = 'US';

        expect(isSafeEdit(originalNumber, newNumber, countryCode)).toBe(false);
    });

    test('should fix bad but technically not invalid spacing', () => {
        const newNumber = '+44 7712 900000';
        const countryCode = 'GB';

        const originalNumberPlusSpace = '+ 44 7712 900000';
        expect(isSafeEdit(originalNumberPlusSpace, newNumber, countryCode)).toBe(true);

        const originalNumberDoubleSpace = '+44  7712 900000';
        expect(isSafeEdit(originalNumberDoubleSpace, newNumber, countryCode)).toBe(true);

        expect(isSafeEdit('+1-213-373--1234', '+1-213-373-1234', 'US')).toBe(true);
    });

    describe('US: incorrect leading plus is not a safe edit for numbers that would be valid in another country', () => {
        test.each(['+(516) 733-8400', '+516-733-8400', '+516 733 8400', '+516 733-8400'])('%s', numberStr => {
            expect(isSafeEdit(numberStr, '+1-516-733-8400', 'US')).toBe(false);
        });
    });
});

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
        invalidNumbers: new Map([['phone', '020 7946 0000']]),
        suggestedFixes: new Map([['phone', '+44 20 7946 0000']]),
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
            invalidNumbers: new Map([
                ['phone', '...'],
                ['contact:phone', '...'],
            ]),
            suggestedFixes: new Map([['phone', '...']]), // Missing contact:phone fix
        };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });

    test('should return false if invalidNumbers map size is smaller than suggestedFixes map size', () => {
        const item = {
            ...validUSItem,
            invalidNumbers: new Map([['phone', '...']]), // Missing contact:phone invalid
            suggestedFixes: new Map([
                ['phone', '...'],
                ['contact:phone', '...'],
            ]),
        };
        expect(isSafeItemEdit(item, 'US')).toBe(false);
    });

    test('should return false if a key from invalidNumbers is missing from suggestedFixes', () => {
        const item = {
            ...validUSItem,
            invalidNumbers: new Map([
                ['phone', '(213) 373-1234'],
                ['contact:phone', '(213) 373-5678'],
            ]),
            suggestedFixes: new Map([
                ['phone', '+1-213-373-1234'],
                ['mobile', '+1-213-373-5678'],
            ]), // contact:phone key is missing
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
