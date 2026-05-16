// i18n.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const locales = {};
const LOCALE_DIR = path.join(__dirname, '../locales');
const DEFAULT_LOCALE = 'en';

/**
 * A mapping of translation keys to their expected placeholder tokens.
 * This is used by the `translate` function to perform positional replacements.
 * @type {Object.<string, string[]>}
 */
const KEY_PLACEHOLDERS = {
    'invalidNumbersOutOf': ['%i', '%f', '%t'],
    'incompleteNamesOutOf': ['%i', '%t'],
    'invalidHoursOutOf': ['%i', '%f', '%t'],
    'invalidPercentageOfTotal': ['%p'],
    'fixablePercentageOfInvalid': ['%p'],
    'reportSubtitleForCountry': ['%c'],
    'reportSubtitleNamesForCountry': ['%c'],
    'reportSubtitleHoursForCountry': ['%c'],
    'countryReportTitle': ['%c'],
    'countryReportTitleNames': ['%c'],
    'countryReportTitleHours': ['%c'],
    'editIn': ['%e'],
    'numberDetailsNamesDataFrom': ['%o'],
    'dataSourcedTemplate': ['%d', '%t', '%z', '%a']
};

// Load all translation files
try {
    const files = fs.readdirSync(LOCALE_DIR);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const locale = file.replace('.json', '');
            try {
                const content = fs.readFileSync(path.join(LOCALE_DIR, file), 'utf8');
                locales[locale] = JSON.parse(content);
            } catch (parseError) {
                console.error(`Error parsing translation file ${file}:`, parseError);
            }
        }
    });
} catch (error) {
    console.error(`Could not load locales from ${LOCALE_DIR}:`, error);
}

/**
 * Gets a translated string for a given key and locale, with optional placeholders.
 * @param {string} key - The key in the JSON file.
 * @param {string} locale - The target locale.
 * @param {Array<string>} [args=[]] - Array of strings for positional placeholders.
 * @returns {string} The translated string.
 */
export function translate(key, locale, args = []) {
    const translation = locales[locale]?.[key] || locales[DEFAULT_LOCALE]?.[key] || `MISSING_KEY:${key}`;
    const placeholders = KEY_PLACEHOLDERS[key];

    // If no placeholders are defined for this key or the number of arguments doesn't match, return the raw translation.
    if (!placeholders || args.length !== placeholders.length) {
        return translation;
    }

    let output = translation;

    // Perform positional replacement based on the defined placeholders.
    placeholders.forEach((placeholder, index) => {
        if (args[index] !== undefined) {
            let value = args[index];
            // Special handling for percentage keys that expect a '%' suffix.
            if (placeholder === '%p') {
                value = `${value}%`;
            }
            output = output.replace(placeholder, value);
        }
    });

    return output;
}

/**
 * Gets the entire translation dictionary for a locale.
 * @param {string} locale - The target locale (e.g., 'fr-FR').
 * @returns {Object} The translation dictionary or an empty object.
 */
export function getTranslations(locale) {
    // Fallback to the default locale if the specific one is missing
    return locales[locale] || locales[DEFAULT_LOCALE] || {};
}
