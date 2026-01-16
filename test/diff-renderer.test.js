const { UNIVERSAL_SPLIT_CAPTURE_REGEX, UNIVERSAL_SPLIT_CAPTURE_REGEX_DIN } = require('../src/constants');
const {
    normalize,
    consolidatePlusSigns,
    replaceInvisibleChars,
    diffPhoneNumbers,
    mergeDiffs,
    getDiffHtml,
    getDiffTagsHtml,
} = require('../src/diff-renderer');

// --- Test Suites ---

describe('Phone Diff Helper Functions', () => {

    test('normalize should remove all non-digits', () => {
        expect(normalize('+44 (0) 1234-567 890')).toBe('4401234567890');
        expect(normalize('0471 124 380')).toBe('0471124380');
        expect(normalize('32 471 12 43 80')).toBe('32471124380');
    });

    test('consolidatePlusSigns should merge lone "+" with the following segment', () => {
        const input1 = ['+', '32 58 515 592', '; ', '+', '32 473 792 951'];
        const expected1 = ['+32 58 515 592', '; ', '+32 473 792 951'];
        expect(consolidatePlusSigns(input1)).toEqual(expected1);

        // Case 2: Standard number, no issue
        const input2 = ['0471 124 380', ' / ', '+32 471 12 43 80'];
        expect(consolidatePlusSigns(input2)).toEqual(input2);

        // Case 3: Leading '+' at the start (should not be treated as lone separator)
        const input3 = ['+32 123 456'];
        expect(consolidatePlusSigns(input3)).toEqual(['+32 123 456']);
    });
});

describe('replaceInvisibleChars', () => {

    test('should handle an empty string', () => {
        expect(replaceInvisibleChars("")).toBe("");
    });

    test('should return the original string if no invisible characters are present', () => {
        const text = "123-456-7890";
        expect(replaceInvisibleChars(text)).toBe(text);
    });

    test('should preserve regular spaces and visible characters', () => {
        const text = "Hello World 123";
        expect(replaceInvisibleChars(text)).toBe("Hello World 123");
    });

    // Test for core Zero-Width characters (U+200B, U+200C, U+200D)
    test('should replace Zero Width Space (U+200B) with ␣', () => {
        // "123(ZWSP)456"
        const input = "123\u200B456";
        const expected = "123␣456";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    test('should replace Zero Width Non-Joiner (U+200C) with ␣', () => {
        // "123(ZWNJ)456"
        const input = "123\u200C456";
        const expected = "123␣456";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    test('should replace Zero Width Joiner (U+200D) with ␣', () => {
        // "123(ZWJ)456"
        const input = "123\u200D456";
        const expected = "123␣456";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    // Test for Directional Marks (U+200E, U+200F)
    test('should replace Left-to-Right Mark (U+200E) with ␣', () => {
        // "ABC(LRM)DEF"
        const input = "ABC\u200E DEF";
        const expected = "ABC␣ DEF";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    test('should replace Right-to-Left Mark (U+200F) with ␣', () => {
        // "GHI(RLM)JKL"
        const input = "GHI\u200FJKL";
        const expected = "GHI␣JKL";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    // Test for Byte Order Mark / ZWNBSP (U+FEFF)
    test('should replace Byte Order Mark (U+FEFF) with ␣', () => {
        // (BOM)START(BOM)END
        const input = "\uFEFFSTART\uFEFFEND";
        const expected = "␣START␣END";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    test('should replace Soft Hyphen (U+00AD) with ␣', () => {
        // "MNO(SFT)PQR"
        const input = "MNO\u00ADPQR";
        const expected = "MNO␣PQR";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    test('should replace tab character with ␣', () => {
        // "MNO(SFT)PQR"
        const input = "MNO\tPQR";
        const expected = "MNO␣PQR";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    test('should replace thin space character with ␣', () => {
        // "MNO(SFT)PQR"
        const input = "MNO PQR";
        const expected = "MNO␣PQR";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    test('should replace pop directional isolate (U+2069) character with ␣', () => {
        // "MNO(PDI)PQR"
        const input = "MNO\u2069PQR";
        const expected = "MNO␣PQR";
        expect(replaceInvisibleChars(input)).toBe(expected);
    });

    // Test for multiple characters, including ranges from the pattern
    test('should replace a mixed sequence of invisible characters with multiple ␣ symbols', () => {
        // ZWSP, ZWJ, LRE (U+202A), Invisible Times (U+2062)
        const input = "A\u200B\u200D\u202A B\u2062C";
        const expected = "A␣␣␣ B␣C"; // 4 replacements
        expect(replaceInvisibleChars(input)).toBe(expected);
    });
});


describe('diffPhoneNumbers (Single Number Diff Logic)', () => {
    const originalGood = '+4 12'
    const originalLeadingZero = '012';
    const suggestedLeadingZero = originalGood;

    const originalLeadingZeroDiff = [
        { value: '0', removed: true },
        { value: '1', removed: false, added: false },
        { value: '2', removed: false, added: false },
    ]
    const suggestedLeadingZeroDiff = [
        { value: '+', added: true },
        { value: '4', added: true },
        { value: ' ', added: true },
        { value: '1', removed: false, added: false },
        { value: '2', removed: false, added: false },
    ]

    const originalExtraZero = '+4 012'
    const originalExtraZeroDiff = [
        { value: '+', removed: false, added: false },
        { value: '4', removed: false, added: false },
        { value: ' ', removed: false, added: false },
        { value: '0', removed: true },
        { value: '1', removed: false, added: false },
        { value: '2', removed: false, added: false },
    ]
    const suggestedExtraZeroDiff = [
        { value: '+', removed: false, added: false },
        { value: '4', removed: false, added: false },
        { value: ' ', removed: false, added: false },
        { value: '1', removed: false, added: false },
        { value: '2', removed: false, added: false },
    ]

    test('basic phone number diff test', () => {
        const result = diffPhoneNumbers(originalLeadingZero, suggestedLeadingZero);

        expect(result.originalDiff).toEqual(originalLeadingZeroDiff)
        expect(result.suggestedDiff).toEqual(suggestedLeadingZeroDiff)
    });

    test('basic phone number diff test with leading plus', () => {
        const result = diffPhoneNumbers(originalExtraZero, suggestedLeadingZero);

        expect(result.originalDiff).toEqual(originalExtraZeroDiff)
        expect(result.suggestedDiff).toEqual(suggestedExtraZeroDiff)
    });

    test('should correctly identify prefix addition/removal and formatting changes (0 removal, 32 addition)', () => {
        const original = '0471 124 380';
        const suggested = '+32 471 12 43 80';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: '0' and space after 4 removed. Other digits and spaces unchanged.
        const expectedOriginal = [
            { value: '0', removed: true },
            { value: '4', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: true },
            { value: '3', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: '0', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: '+32 ' and space after 3 added. Other digits and spaces unchanged.
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '3', added: true },
            { value: '2', added: true },
            { value: ' ', added: true },
            { value: '4', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: ' ', added: true },
            { value: '4', removed: false, added: false },
            { value: '3', removed: false, added: false },
            { value: ' ', added: true },
            { value: '8', removed: false, added: false },
            { value: '0', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });


    test('should correctly handle complex formatting changes (+44 example)', () => {
        const original = '+44 (0) 1234 5678';
        const suggested = '+44 1234 5678';

        const result = diffPhoneNumbers(original, suggested);

        // Only change is removing brackets, 0 and a space
        const expectedOriginal = [
            { value: '+', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '(', removed: true },
            { value: '0', removed: true },
            { value: ')', removed: true },
            { value: ' ', removed: true },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '3', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '8', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Suggested: everything present is unchanged.
        const expectedSuggested = [
            { value: '+', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '3', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '8', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should correctly handle US number without country code adding country code (+1- example)', () => {
        const original = '8596352440';
        const suggested = '+1-859-635-2440';

        const result = diffPhoneNumbers(original, suggested);

        // Everything present is unchanged
        const expectedOriginal = [
            { value: '8', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '3', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '0', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // + and dashes are added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '1', added: true },
            { value: '-', added: true },
            { value: '8', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '-', added: true },
            { value: '6', removed: false, added: false },
            { value: '3', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '-', added: true },
            { value: '2', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '0', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should not mark + as added when text is removed', () => {
        const original = 'Mobile: +44 7767 407 561';
        const suggested = '+44 7767 407561';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: Text and extra space removed
        const expectedOriginal = [
            { value: 'M', removed: true },
            { value: 'o', removed: true },
            { value: 'b', removed: true },
            { value: 'i', removed: true },
            { value: 'l', removed: true },
            { value: 'e', removed: true },
            { value: ':', removed: true },
            { value: ' ', removed: true },
            { value: '+', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '0', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: ' ', removed: true },
            { value: '5', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '1', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: All unchanged
        const expectedSuggested = [
            { value: '+', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '0', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '1', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should mark prefix as new, even when its first digit is the same as the first digit after 0 in the original', () => {
        const original = '0398';
        const suggested = '+32 398';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: 0 removed
        const expectedOriginal = [
            { value: '0', removed: true },
            { value: '3', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '8', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: +32 added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '3', added: true },
            { value: '2', added: true },
            { value: ' ', added: true },
            { value: '3', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '8', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should mark prefix as new, even when it is the same as the first digits of the original', () => {
        const original = '3912';
        const suggested = '+39 3912';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: 0 removed
        const expectedOriginal = [
            { value: '3', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: +32 added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '3', added: true },
            { value: '9', added: true },
            { value: ' ', added: true },
            { value: '3', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should mark prefix as new, even when its first digit is the same as the first digit in the original (no leading 0)', () => {
        const original = '327';
        const suggested = '+39 327';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: 0 removed
        const expectedOriginal = [
            { value: '3', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '7', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: +32 added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '3', added: true },
            { value: '9', added: true },
            { value: ' ', added: true },
            { value: '3', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '7', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should mark leading 0 as removed, even when prefix has a 0', () => {
        const original = '0123';
        const suggested = '+90 123';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: 0 removed
        const expectedOriginal = [
            { value: '0', removed: true },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '3', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: +32 added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '9', added: true },
            { value: '0', added: true },
            { value: ' ', added: true },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '3', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should not mark leading 0 as removed when adding a prefix and number actually starts with 0', () => {
        const original = '0981.82002';
        const suggested = '+39 0981 82002';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: . removed
        const expectedOriginal = [
            { value: '0', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '.', removed: true },
            { value: '8', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '0', removed: false, added: false },
            { value: '0', removed: false, added: false },
            { value: '2', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: +39 and space added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '3', added: true },
            { value: '9', added: true },
            { value: ' ', added: true },
            { value: '0', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: ' ', added: true },
            { value: '8', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '0', removed: false, added: false },
            { value: '0', removed: false, added: false },
            { value: '2', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should mark only + as added when only + is added', () => {
        const original = '390789754216';
        const suggested = '+39 0789 754216';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: nothing changed
        const expectedOriginal = [
            { value: '3', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '0', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '6', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: + and spaces added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '3', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: ' ', added: true },
            { value: '0', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: '9', removed: false, added: false },
            { value: ' ', added: true },
            { value: '7', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: '6', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });

    test('should cope with brackets and zero removed and plus added', () => {
        const original = '(48)058';
        const suggested = '+48 58';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: (, ) and 0 removed
        const expectedOriginal = [
            { value: '(', removed: true },
            { value: '4', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: ')', removed: true },
            { value: '0', removed: true },
            { value: '5', removed: false, added: false },
            { value: '8', removed: false, added: false },
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)

        // Check Suggested Diff: + and spaces added
        const expectedSuggested = [
            { value: '+', added: true },
            { value: '4', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: ' ', added: true },
            { value: '5', removed: false, added: false },
            { value: '8', removed: false, added: false },
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });
});


describe('mergeDiffs', () => {
    test('merge simple diff', () => {
        const original = [
            { value: '0', removed: true },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
        ]
        const expectedMerged = [
            { value: '0', removed: true },
            { value: '12', removed: false, added: false },
        ]
        expect(mergeDiffs(original)).toEqual(expectedMerged)
    });

    test('merge multiple unchanged and removals diff', () => {
        const original = [
            { value: '+', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '(', removed: true },
            { value: '0', removed: true },
            { value: ')', removed: true },
            { value: ' ', removed: true },
            { value: '1', removed: false, added: false },
            { value: '2', removed: false, added: false },
            { value: '3', removed: false, added: false },
            { value: '4', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '6', removed: false, added: false },
            { value: '7', removed: false, added: false },
            { value: '8', removed: false, added: false },
        ]
        const expectedMerged = [
            { value: '+44 ', removed: false, added: false },
            { value: '(0) ', removed: true },
            { value: '1234 5678', removed: false, added: false },
        ]
        expect(mergeDiffs(original)).toEqual(expectedMerged)
    });

    test('merge various multiple additions and unchanged', () => {
        const original = [
            { value: '+', added: true },
            { value: '3', added: true },
            { value: '2', added: true },
            { value: ' ', added: true },
            { value: '5', removed: false, added: false },
            { value: '8', removed: false, added: false },
            { value: ' ', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: '1', removed: false, added: false },
            { value: ' ', added: true },
            { value: '5', removed: false, added: false },
            { value: '5', removed: false, added: false },
            { value: ' ', added: true },
            { value: '9', removed: false, added: false },
            { value: '2', removed: false, added: false },
        ]
        const expectedMerged = [
            { value: '+32 ', added: true },
            { value: '58 51', removed: false, added: false },
            { value: ' ', added: true },
            { value: '55', removed: false, added: false },
            { value: ' ', added: true },
            { value: '92', removed: false, added: false },
        ]
        expect(mergeDiffs(original)).toEqual(expectedMerged)
    });
});


describe('getDiffTagsHtml', () => {

    test('should correctly diff different tags', () => {
        const oldTag = 'mobile';
        const newTag = 'phone';

        const result = getDiffTagsHtml(oldTag, newTag);

        const expectedOld = '<span class="diff-removed">mobile</span>';
        expect(result.oldTagDiff).toBe(expectedOld);

        const expectedNew = '<span class="diff-added">phone</span>';
        expect(result.newTagDiff).toBe(expectedNew);
    });

    test('should correctly diff change of contact suffix', () => {
        const oldTag = 'contact:mobile';
        const newTag = 'contact:phone';

        const result = getDiffTagsHtml(oldTag, newTag);

        const expectedOld = '<span class="diff-unchanged">contact:</span><span class="diff-removed">mobile</span>';
        expect(result.oldTagDiff).toBe(expectedOld);

        const expectedNew = '<span class="diff-unchanged">contact:</span><span class="diff-added">phone</span>';
        expect(result.newTagDiff).toBe(expectedNew);
    });

    test('should correctly diff change from contact:mobile to phone', () => {
        const oldTag = 'contact:mobile';
        const newTag = 'phone';

        const result = getDiffTagsHtml(oldTag, newTag);

        const expectedOld = '<span class="diff-removed">contact:mobile</span>';
        expect(result.oldTagDiff).toBe(expectedOld);

        const expectedNew = '<span class="diff-added">phone</span>';
        expect(result.newTagDiff).toBe(expectedNew);
    });
});


describe('getDiffHtml', () => {

    // Single number, adding country code
    test('should correctly diff one number', () => {
        const original = '023 456 7890';
        const suggested = '+37 23 456 7890';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">0</span><span class="diff-unchanged">23&nbsp;456&nbsp;7890</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+37&nbsp;</span><span class="diff-unchanged">23&nbsp;456&nbsp;7890</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    // Number with dashes in original and suggested
    test('should correctly diff two numbers with dashes and format change', () => {
        const original = '(347) 456-7890';
        const suggested = '+1 347-456-7890';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">(</span><span class="diff-unchanged">347</span><span class="diff-removed">)&nbsp;</span><span class="diff-unchanged">456-7890</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+1&nbsp;</span><span class="diff-unchanged">347</span><span class="diff-added">-</span><span class="diff-unchanged">456-7890</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    // Simple two numbers, semicolon separated, with 0 removal
    test('should correctly diff two semicolon-separated numbers', () => {
        const original = '+32 058 515 592;+32 0473 792 951';
        const suggested = '+32 58 51 55 92; +32 473 79 29 51';

        const result = getDiffHtml(original, suggested);

        // Original '0' marked removed.
        const expectedOriginalN1 = '<span class="diff-unchanged">+32&nbsp;</span><span class="diff-removed">0</span><span class="diff-unchanged">58&nbsp;515</span><span class="diff-removed">&nbsp;</span><span class="diff-unchanged">592;';
        const expectedOriginalN2 = '+32&nbsp;</span><span class="diff-removed">0</span><span class="diff-unchanged">473&nbsp;792</span><span class="diff-removed">&nbsp;</span><span class="diff-unchanged">951</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalN2);

        // Suggested: added space after semicolon and space either side of 55 and of 29.
        const expectedSuggestedN1 = '<span class="diff-unchanged">+32&nbsp;58&nbsp;51</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">55</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">92;';
        const expectedSuggestedN2 = '</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">+32&nbsp;473&nbsp;79</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">29</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">51</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedN2);
    });

    // Different separator in original
    test('should correctly handle complex separators like " / " and digit addition', () => {
        const original = '0123 / 4567';
        const suggested = '+90 123; +90 4567';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">0</span><span class="diff-unchanged">123&nbsp;</span><span class="diff-removed">/&nbsp;</span><span class="diff-unchanged">4567</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+90&nbsp;</span><span class="diff-unchanged">123</span><span class="diff-added">;</span><span class="diff-unchanged">&nbsp;</span><span class="diff-added">+90&nbsp;</span><span class="diff-unchanged">4567</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should correctly handle change from 00 to +', () => {
        const original = '003235024353;0032485610715';
        const suggested = '+32 3 502 43 53; +32 485 61 07 15';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">00</span><span class="diff-unchanged">3235024353;</span><span class="diff-removed">00</span><span class="diff-unchanged">32485610715</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggestedN1 = '<span class="diff-added">+</span><span class="diff-unchanged">32</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">3</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">502</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">43</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">53;</span>';
        const expectedSuggestedN2 = '<span class="diff-added">&nbsp;+</span><span class="diff-unchanged">32</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">485</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">61</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">07</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">15</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedN2);
    });

    test('should correctly handle change from 00 to + with text prefix', () => {
        const original = 'tel:003235024353';
        const suggested = '+32 3 502 43 53';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">tel:00</span><span class="diff-unchanged">3235024353</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+</span><span class="diff-unchanged">32</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">3</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">502</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">43</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">53</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should mark removed number as removed', () => {
        const original = '+32 58 51 55 92; +32 473 792 951';
        const suggested = '+32 58 51 55 92';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">+32&nbsp;58&nbsp;51&nbsp;55&nbsp;92</span><span class="diff-removed">;&nbsp;+32&nbsp;473&nbsp;792&nbsp;951</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+32&nbsp;58&nbsp;51&nbsp;55&nbsp;92</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should mark added number as added', () => {
        const original = '+32 58 51 55 92';
        const suggested = '+32 58 51 55 92; +32 473 792 951';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">+32&nbsp;58&nbsp;51&nbsp;55&nbsp;92</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+32&nbsp;58&nbsp;51&nbsp;55&nbsp;92</span><span class="diff-added">;&nbsp;+32&nbsp;473&nbsp;792&nbsp;951</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should handle empty value and number added', () => {
        const original = null;
        const suggested = '+32 58 51 55 92';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = null;
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+32&nbsp;58&nbsp;51&nbsp;55&nbsp;92</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should handle empty value and number removed', () => {
        const original = '+32 58 51 55 92';
        const suggested = null;

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">+32&nbsp;58&nbsp;51&nbsp;55&nbsp;92</span>';;
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = null;
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('IT: should correctly show spaces as added', () => {
        const original = '0708676778';
        const suggested = '+39 070 867 6778';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">0708676778</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+39&nbsp;</span><span class="diff-unchanged">070</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">867</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">6778</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('US: should correctly diff numbers when double separator is used', () => {
        const original = '787-728-1111//787-265-2525';
        const suggested = '+1-787-728-1111; +1-787-265-2525';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">787-728-1111</span><span class="diff-removed">//</span><span class="diff-unchanged">787-265-2525</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+1-</span><span class="diff-unchanged">787-728-1111</span><span class="diff-added">;&nbsp;+1-</span><span class="diff-unchanged">787-265-2525</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should diff correct numbers when first one of multiple is removed (e.g. due to duplicate)', () => {
        const original = '+27 11 984;+27 83 462';
        const suggested = '+27 83 462';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">+27&nbsp;11&nbsp;984;</span><span class="diff-unchanged">+27&nbsp;83&nbsp;462</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+27&nbsp;83&nbsp;462</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should show diff for phone number within whatsapp link with country code being added', () => {
        const original = 'https://api.whatsapp.com/send?phone=0123456789';
        const suggested = '+27 12 345 6789';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">https://api.whatsapp.com/send?phone=0</span><span class="diff-unchanged">123456789</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+27&nbsp;</span><span class="diff-unchanged">12</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">345</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">6789</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should show diff for phone number within whatsapp link', () => {
        const original = 'https://api.whatsapp.com/send?phone=+27123456789';
        const suggested = '+27 12 345 6789';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">https://api.whatsapp.com/send?phone=</span><span class="diff-unchanged">+27123456789</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+27</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">12</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">345</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">6789</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should show diff for phone number within whatsapp link with encoded plus', () => {
        const original = 'https://api.whatsapp.com/send?phone=%2B27123456789';
        const suggested = '+27 12 345 6789';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">https://api.whatsapp.com/send?phone=%2B</span><span class="diff-unchanged">27123456789</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+</span><span class="diff-unchanged">27</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">12</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">345</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">6789</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should show diff for phone number within whatsapp wa.me', () => {
        const original = 'wa.me/27123456789';
        const suggested = '+27 12 345 6789';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">wa.me/</span><span class="diff-unchanged">27123456789</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+</span><span class="diff-unchanged">27</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">12</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">345</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">6789</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should correctly diff converting double space to single space', () => {
        const original = '+1-209-123-4567  x123';
        const suggested = '+1-209-123-4567 x123';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">+1-209-123-4567&nbsp;</span><span class="diff-removed">&nbsp;</span><span class="diff-unchanged">x123</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+1-209-123-4567&nbsp;x123</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should correctly diff comma separated extension', () => {
        const original = '+1-209-123-4567, ext 123';
        const suggested = '+1-209-123-4567 x123';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">+1-209-123-4567</span><span class="diff-removed">,</span><span class="diff-unchanged">&nbsp;</span><span class="diff-removed">e</span><span class="diff-unchanged">x</span><span class="diff-removed">t&nbsp;</span><span class="diff-unchanged">123</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+1-209-123-4567&nbsp;x123</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should correctly diff escaped extension', () => {
        const original = '+1-209-123-4567\\;ext=123';
        const suggested = '+1-209-123-4567 x123';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">+1-209-123-4567</span><span class="diff-removed">\\;e</span><span class="diff-unchanged">x</span><span class="diff-removed">t=</span><span class="diff-unchanged">123</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+1-209-123-4567</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">x123</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should correctly diff escaped extension in double wrong format', () => {
        const original = '+1-209-123-4567\\;=ext=123';
        const suggested = '+1-209-123-4567 x123';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-unchanged">+1-209-123-4567</span><span class="diff-removed">\\;=e</span><span class="diff-unchanged">x</span><span class="diff-removed">t=</span><span class="diff-unchanged">123</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-unchanged">+1-209-123-4567</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">x123</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    test('should correctly diff brackets around the start of the number', () => {
        const original = '(0222) 226 2002';
        const suggested = '+90 222 226 20 02';

        const result = getDiffHtml(original, suggested);

        const expectedOriginal = '<span class="diff-removed">(0</span><span class="diff-unchanged">222</span><span class="diff-removed">)</span><span class="diff-unchanged">&nbsp;226&nbsp;2002</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        const expectedSuggested = '<span class="diff-added">+90&nbsp;</span><span class="diff-unchanged">222&nbsp;226&nbsp;20</span><span class="diff-added">&nbsp;</span><span class="diff-unchanged">02</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });
});