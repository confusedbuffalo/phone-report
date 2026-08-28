import { fileURLToPath } from 'url';
import { iso31661 } from 'iso-3166';
import { COUNTRIES } from './constants.js';

/**
 * Extracts every countryCode value present in a country entry's subdivisions.
 * Mirrors fetch-polys.js's getSubdivisionIds — same two shapes (flat 'divisions',
 * nested 'divisionMap'), extracting countryCode instead of relationId. A
 * subdivision entry only carries its own countryCode when it represents a
 * distinct territory (e.g. GB's overseas territories); plain relation-id
 * entries and objects with no countryCode are skipped.
 * @param {object} country A single entry from COUNTRIES.
 * @returns {string[]} Country codes found on this entry's subdivisions.
 */
export function getSubdivisionCountryCodes(country) {
    const extractCode = val => (typeof val === 'object' && val !== null ? val.countryCode : undefined);

    if (country.divisions) {
        return Object.values(country.divisions).map(extractCode).filter(Boolean);
    }

    if (country.divisionMap) {
        return Object.values(country.divisionMap)
            .flatMap(subRegion => Object.values(subRegion).map(extractCode))
            .filter(Boolean);
    }

    return [];
}

/**
 * Collects every unique ISO 3166-1 alpha-2 code present anywhere in COUNTRIES —
 * each entry's own top-level countryCode, plus any distinct territory codes
 * nested under its divisions/divisionMap (e.g. GB's GG, JE, IM, FK, BM).
 * @param {object} countries The COUNTRIES config object.
 * @returns {Set<string>} Every country code currently represented.
 */
export function getAllPresentCountryCodes(countries) {
    const codes = new Set();

    Object.values(countries).forEach(country => {
        if (country.countryCode) codes.add(country.countryCode);
        getSubdivisionCountryCodes(country).forEach(code => codes.add(code));
    });

    return codes;
}

/**
 * Prints the coverage report: total counts, then every missing ISO 3166-1
 * country as a simple table, sorted alphabetically by code.
 */
export function printReport() {
    const presentCodes = getAllPresentCountryCodes(COUNTRIES);
    const missing = iso31661
        .filter(entry => !presentCodes.has(entry.alpha2))
        .sort((a, b) => (a.alpha2 < b.alpha2 ? -1 : 1));

    console.log('==============================================');
    console.log('== COUNTRY COVERAGE REPORT ==');
    console.log('==============================================');
    console.log(`Top-level entries in countries.json: ${Object.keys(COUNTRIES).length}`);
    console.log(`Unique country codes present (incl. nested territories): ${presentCodes.size}`);
    console.log(`Total ISO 3166-1 countries: ${iso31661.length}`);
    console.log(`Missing: ${missing.length}`);

    if (missing.length > 0) {
        console.log('\nCode  Name');
        console.log('----  ----');
        missing.forEach(entry => console.log(`${entry.alpha2}    ${entry.name}`));
    }

    console.log('\n==============================================');
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    printReport();
}
