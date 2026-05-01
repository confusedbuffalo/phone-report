const {
    safeName,
    isDisused,
} = require('../src/data-processor');

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

describe("isDisused", () => {
    // Disused
    test('disused object is disused', () => {
        expect(isDisused({ allTags: { 'disused:amenity': 'cafe' } })).toBe(true)
    });

    test('historic object is disused', () => {
        expect(isDisused({ allTags: { 'historic:amenity': 'cafe' } })).toBe(true)
    });

    test('was object is disused', () => {
        expect(isDisused({ allTags: { 'was:amenity': 'cafe' } })).toBe(true)
    });

    test('abandoned object is disused', () => {
        expect(isDisused({ allTags: { 'abandoned:amenity': 'cafe' } })).toBe(true)
    });

    // Not disused
    test('regular object is not disused', () => {
        expect(isDisused({ allTags: { 'amenity': 'cafe' } })).toBe(false)
    });

    test('regular object with old disused tags is not disused', () => {
        expect(isDisused({ allTags: { 'amenity': 'cafe', 'was:amenity': 'place_of_worship' } })).toBe(false)
    });

    test('empty tags is not disused', () => {
        expect(isDisused({ allTags: {} })).toBe(false)
    });
});
