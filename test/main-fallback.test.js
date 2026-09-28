import { processDivision } from '../src/main.js';

describe('processDivision failure and fallback handling', () => {
    it('returns valid stats and zero totals when subdivision files are missing and no fallback is available', async () => {
        const fakeCountryData = {
            name: 'Test Country',
            countryCode: 'TC',
            divisions: {
                'Nonexistent Sub': 999999999,
            },
        };

        const result = await processDivision('Test Country', fakeCountryData, {});

        expect(result).toHaveProperty('divisionStats');
        expect(result).toHaveProperty('divisionTotals');

        // Check each report type in divisionStats is an empty array
        expect(result.divisionStats.phone).toEqual([]);
        expect(result.divisionStats.name).toEqual([]);
        expect(result.divisionStats.hours).toEqual([]);

        // Check divisionTotals has 0 for each countType across all reportTypes
        expect(result.divisionTotals.phone.invalidCount).toBe(0);
        expect(result.divisionTotals.phone.totalCount).toBe(0);
        expect(result.divisionTotals.name.invalidCount).toBe(0);
        expect(result.divisionTotals.hours.invalidCount).toBe(0);
    });
});
