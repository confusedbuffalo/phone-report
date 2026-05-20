// i18n.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const locales = {};
const LOCALE_DIR = path.join(__dirname, '../locales');
const DEFAULT_LOCALE = 'en';

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
 * @param {Object.<string, string|number>} [substitutions={}] - Object for named placeholders.
 * @returns {string} The translated string.
 */
export function translate(key, locale, substitutions = {}) {
    const translation = locales[locale]?.[key] || locales[DEFAULT_LOCALE]?.[key] || `MISSING_KEY:${key}`;

    return translation.replace(/{(\w+)}/g, (match, p1) => {
        return substitutions[p1] !== undefined ? substitutions[p1] : match;
    });
}

/**
 * Gets the entire translation dictionary for a locale, filling in missing keys from the default locale.
 * @param {string} locale - The target locale (e.g., 'fr-FR').
 * @returns {Object} The translation dictionary with fallback keys.
 */
export function getTranslations(locale) {
    const defaultDict = locales[DEFAULT_LOCALE] || {};
    const requestedDict = locales[locale] || {};

    // Merge them: requested keys will overwrite default keys
    return {
        ...defaultDict,
        ...requestedDict,
    };
}
