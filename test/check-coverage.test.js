import { getSubdivisionCountryCodes, getAllPresentCountryCodes } from '../src/check-coverage.js';
import { COUNTRIES } from '../src/constants.js';
import { iso31661 } from 'iso-3166';

describe('getSubdivisionCountryCodes', () => {
    test('returns [] when a country has no divisions or divisionMap', () => {
        expect(getSubdivisionCountryCodes({ countryCode: 'FI' })).toEqual([]);
    });

    test('skips plain relation-id entries and objects with no countryCode, under flat divisions', () => {
        const country = {
            divisions: {
                RegionA: 123456,
                RegionB: { relationId: 654321, pbfUrl: 'https://example.com/b.osm.pbf' },
                RegionC: { relationId: 111111, countryCode: 'CX' },
            },
        };
        expect(getSubdivisionCountryCodes(country)).toEqual(['CX']);
    });

    test('extracts countryCode from nested divisionMap entries', () => {
        const country = {
            divisionMap: {
                StateA: {
                    DistrictA: { relationId: 1 },
                    DistrictB: { relationId: 2, countryCode: 'BE-VLG' },
                },
                StateB: {
                    DistrictC: 3,
                },
            },
        };
        expect(getSubdivisionCountryCodes(country)).toEqual(['BE-VLG']);
    });
});

describe('getAllPresentCountryCodes', () => {
    test("includes each country's own top-level countryCode", () => {
        const countries = {
            Finland: { countryCode: 'FI', divisions: { Uusimaa: 1 } },
            Greece: { countryCode: 'GR', divisions: { Attica: 2 } },
        };
        const codes = getAllPresentCountryCodes(countries);
        expect(codes).toEqual(new Set(['FI', 'GR']));
    });

    test('includes distinct territory codes nested under divisions/divisionMap', () => {
        const countries = {
            'British Crown Dependencies and Overseas Territories': {
                countryCode: 'GB',
                divisions: {
                    Anguilla: { relationId: 1, countryCode: 'AI' },
                    Bermuda: { relationId: 2, countryCode: 'BM' },
                },
            },
        };
        const codes = getAllPresentCountryCodes(countries);
        expect(codes).toEqual(new Set(['GB', 'AI', 'BM']));
    });

    test('mutation check: a country missing its countryCode is not silently counted', () => {
        const countries = { Nowhere: { divisions: { RegionA: 1 } } };
        const codes = getAllPresentCountryCodes(countries);
        expect(codes.size).toBe(0);
    });
});

describe('coverage report against the real countries.json', () => {
    // countries.json legitimately mixes two kinds of countryCode: a plain ISO 3166-1
    // alpha-2 (a genuinely distinct country/territory, e.g. GB's overseas
    // territories) and an ISO 3166-2 subdivision code, alpha-2 country prefix plus a
    // suffix (a distinct-locale region within the same country, e.g. Belgium's
    // BE-VLG/BE-BRU/BE-WAL, Canada's CA-QC, Spain's ES-CT, GB's GB-SCO/GB-WLS/etc).
    // Both are valid; every code's leading two letters must still be a real country.
    // Structural, not count-based, so it doesn't need updating as countries are added.
    test('every present code is, or starts with, a real ISO 3166-1 alpha-2 code', () => {
        const validCodes = new Set(iso31661.map(entry => entry.alpha2));
        const codes = getAllPresentCountryCodes(COUNTRIES);
        codes.forEach(code => {
            expect(validCodes.has(code.slice(0, 2))).toBe(true);
        });
    });
});
