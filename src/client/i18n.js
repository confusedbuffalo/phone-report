import { translations, locale } from './config.js';

/**
 * Translates a key into the current locale using the provided translations.
 * Supports named placeholders using {key} syntax.
 *
 * @param {string} key - The translation key.
 * @param {Object} substitutions - An object containing values for placeholders.
 * @returns {string} The translated string or a missing key indicator.
 */
export function translate(key, substitutions = {}) {
    const translation = translations[key] || 'MISSING_KEY:' + key;
    return translation.replace(/{(\w+)}/g, (match, p1) => {
        return substitutions[p1] !== undefined ? substitutions[p1] : match;
    });
}

/**
 * Returns the current locale.
 * @returns {string}
 */
export function getLocale() {
    return locale;
}
