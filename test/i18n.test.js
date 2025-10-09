const fs = require('fs');
const path = require('path');
const { MASTER_KEYS } = require('./i18n.master');
const { translate, getTranslations } = require('../src/i18n.js');

// Helper to load all translation files
const localesDir = path.join(__dirname, '../locales');
const translationFiles = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json'))
    .map(file => ({
        locale: file.replace('.json', ''),
        content: require(path.join(localesDir, file))
    }));

// List of all expected keys
const masterKeys = Object.keys(MASTER_KEYS);

// Regex to find ANY placeholder (%letter)
const PLACEHOLDER_REGEX = /%[a-z]/g;

// Regex to find common, disallowed HTML characters (e.g., <, >, &, ", ')
// Note: This regex *allows* the permitted control sequence '&shy;' for the "phoneNumberReport" key.
const DISALLOWED_HTML_REGEX = /[<>"']/g; // Catches <, >, ", '
const DISALLOWED_HTML_AMPERSAND_REGEX = /&(?!shy;|nbsp;|apos;)/g; // Catches '&' unless followed by 'shy;', 'nbsp;' or 'apos;'

describe('Localization File Integrity Tests', () => {

    // Test 1: Check for missing or extra keys in all locale files
    translationFiles.forEach(({ locale, content }) => {
        const currentKeys = Object.keys(content);

        test(`[${locale}] must contain all master keys and no extra keys`, () => {
            // Check for missing keys
            const missingKeys = masterKeys.filter(key => !currentKeys.includes(key));
            expect(missingKeys).toEqual([]);

            // Check for extra keys
            const extraKeys = currentKeys.filter(key => !masterKeys.includes(key));
            expect(extraKeys).toEqual([]);
        });
    });

    // Test 2: Check for correct placeholder usage in all locale files
    translationFiles.forEach(({ locale, content }) => {

        test(`[${locale}] must use correct placeholders for all keys`, () => {

            // This array will collect all placeholder errors for this locale
            const placeholderErrors = [];

            masterKeys.forEach(key => {
                const requiredPlaceholders = MASTER_KEYS[key];
                const translationString = content[key];

                // Skip if the key is missing (already caught by Test 1, but for safety)
                if (!translationString) return;

                // Find all placeholders used in the current translation string
                const actualPlaceholders = (translationString.match(PLACEHOLDER_REGEX) || [])
                    .map(p => p.toLowerCase()); // Ensure consistent case

                // Check for missing required placeholders
                requiredPlaceholders.forEach(requiredP => {
                    if (!actualPlaceholders.includes(requiredP)) {
                        placeholderErrors.push({
                            key,
                            type: 'MISSING',
                            placeholder: requiredP,
                            translation: translationString
                        });
                    }
                });

                // Check for unexpected/extra placeholders
                actualPlaceholders.forEach(actualP => {
                    if (!requiredPlaceholders.includes(actualP)) {
                        placeholderErrors.push({
                            key,
                            type: 'EXTRA',
                            placeholder: actualP,
                            translation: translationString
                        });
                    }
                });
            });

            // If the error array is not empty, fail the test and show the details
            expect(placeholderErrors).toEqual([]);
        });
    });

    // Test 3: Check for disallowed HTML characters in all locale files
    translationFiles.forEach(({ locale, content }) => {

        test(`[${locale}] must not contain disallowed HTML characters`, () => {
            const htmlErrors = [];

            masterKeys.forEach(key => {
                const translationString = content[key];

                // Skip if the key is missing
                if (!translationString) return;

                // Check for general disallowed characters: <, >, ", '
                const generalMatches = translationString.match(DISALLOWED_HTML_REGEX);
                if (generalMatches) {
                    htmlErrors.push({
                        key,
                        type: 'DISALLOWED_CHARACTERS',
                        characters: generalMatches.join(''),
                        translation: translationString
                    });
                    // Once a general match is found, skip the ampersand check for this string
                    return;
                }

                // Check for ampersands '&' that are NOT followed by 'shy;'
                const ampersandMatches = translationString.match(DISALLOWED_HTML_AMPERSAND_REGEX);
                if (ampersandMatches) {
                    htmlErrors.push({
                        key,
                        type: 'DISALLOWED_AMPERSAND',
                        // Report the raw match which will be '&'
                        characters: ampersandMatches.join(''),
                        translation: translationString
                    });
                }
            });

            // If the error array is not empty, fail the test and show the details
            expect(htmlErrors).toEqual([]);
        });
    });
});

describe('i18n Module Functionality', () => {

    describe('translate', () => {
        test('should return the correct translation for a given key and locale', () => {
            expect(translate('backToAllCountries', 'fr-FR')).toBe('Retour à tous les pays');
            expect(translate('backToAllCountries', 'en-GB')).toBe('Back to all countries');
        });

        test('should fall back to the default locale (en) for a non-existent locale', () => {
            expect(translate('backToAllCountries', 'xx-XX')).toBe('Back to all countries');
        });

        test('should return a MISSING_KEY string for a non-existent key', () => {
            expect(translate('this_key_does_not_exist', 'en-GB')).toBe('MISSING_KEY:this_key_does_not_exist');
        });

        test('should handle simple single-argument substitution for %c', () => {
            const expected = 'OSM Phone Number Validation Report - Testland';
            const master = require('../locales/en.json').countryReportTitle;
            expect(master).toContain('%c'); // Ensure master key is correct
            expect(translate('countryReportTitle', 'en', ['Testland'])).toBe(expected);
        });

        test('should handle single-argument substitution for %e', () => {
            const expected = 'Edit in JOSM';
            const master = require('../locales/en.json').editIn;
            expect(master).toContain('%e'); // Ensure master key is correct
            expect(translate('editIn', 'en', ['JOSM'])).toBe(expected);
        });

        test('should handle single-argument substitution for %p', () => {
            const expected = '12.34% of total';
            const master = require('../locales/en.json').invalidPercentageOfTotal;
            expect(master).toContain('%p'); // Ensure master key is correct
            expect(translate('invalidPercentageOfTotal', 'en', ['12.34'])).toBe(expected);
        });

        test('should handle multi-argument substitution for invalidNumbersOutOf', () => {
            const expected = '10 invalid numbers (5 potentially fixable) out of 100';
            const master = require('../locales/en.json').invalidNumbersOutOf;
            expect(master).toContain('%i');
            expect(master).toContain('%f');
            expect(master).toContain('%t');
            expect(translate('invalidNumbersOutOf', 'en', ['10', '5', '100'])).toBe(expected);
        });

        test('should handle multi-argument substitution for dataSourcedTemplate', () => {
            const expected = 'Data sourced on Date at Time UTC (Now)';
            const master = require('../locales/en.json').dataSourcedTemplate;
            expect(master).toContain('%d');
            expect(master).toContain('%t');
            expect(master).toContain('%z');
            expect(master).toContain('%a');
            expect(translate('dataSourcedTemplate', 'en', ['Date', 'Time', 'UTC', 'Now'])).toBe(expected);
        });

        test('should handle numeric substitution for timeAgo keys', () => {
            const expectedPlural = '5&nbsp;hours ago';
            const expectedSingular = '1&nbsp;hour ago';
            const masterPlural = require('../locales/en.json').timeAgoHoursPlural;
            const masterSingular = require('../locales/en.json').timeAgoHour;
            expect(masterPlural).toContain('%n');
            expect(masterSingular).toContain('%n');
            expect(translate('timeAgoHoursPlural', 'en', ['5'])).toBe(expectedPlural);
            expect(translate('timeAgoHour', 'en', ['1'])).toBe(expectedSingular);
        });
    });

    describe('getTranslations', () => {
        test('should return the complete translation dictionary for a given locale', () => {
            const translations = getTranslations('fr-FR');
            expect(translations.backToAllCountries).toBe('Retour à tous les pays');
            expect(translations.name).toBe('Nom');
        });

        test('should fall back to the default locale (en) for a non-existent locale', () => {
            const defaultTranslations = getTranslations('en');
            const fallbackTranslations = getTranslations('xx-XX');
            expect(fallbackTranslations).toEqual(defaultTranslations);
            expect(fallbackTranslations.name).toBe('Name');
        });

        test('should return the English dictionary when requesting the base "en" locale', () => {
            const enTranslations = getTranslations('en');
            expect(enTranslations.name).toBe('Name');
        });
    });
});