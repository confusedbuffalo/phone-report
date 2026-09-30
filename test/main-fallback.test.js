import fs from 'fs';
import path from 'path';
import { processDivision } from '../src/main.js';
import { BUILD_DIR, HISTORY_DIR } from '../src/constants.js';

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

    it('returns cached fallback stats for single-level division structure when PBF is missing', async () => {
        const countryName = 'NorgeTest';
        const divisionName = countryName;
        const subName = 'Telemark';
        const reportType = 'phone';

        const buildDir = path.join(BUILD_DIR, reportType, 'norgetest');
        const historyDir = path.join(HISTORY_DIR, reportType, 'norgetest');

        fs.mkdirSync(buildDir, { recursive: true });
        fs.mkdirSync(historyDir, { recursive: true });

        const cachedJsonPath = path.join(buildDir, 'telemark.json');
        fs.writeFileSync(cachedJsonPath, JSON.stringify([]));

        const mockStats = {
            name: subName,
            divisionSlug: 'norgetest',
            slug: 'telemark',
            timestamp: new Date().toISOString(),
            invalidCount: 5,
            autoFixableCount: 2,
            foreignCount: 0,
            safeEditCount: 1,
            totalCount: 20,
        };

        const historyFilePath = path.join(historyDir, '2026-01-01.json');
        fs.writeFileSync(
            historyFilePath,
            JSON.stringify({
                groupedDivisionStats: {
                    [divisionName]: [mockStats],
                },
            })
        );

        try {
            const fakeCountryData = {
                name: countryName,
                countryCode: 'NO',
                divisions: {
                    [subName]: 405156,
                },
            };

            const result = await processDivision(divisionName, fakeCountryData, {});

            expect(result.divisionStats.phone).toHaveLength(1);
            expect(result.divisionStats.phone[0]).toEqual(mockStats);
            expect(result.divisionTotals.phone.invalidCount).toBe(5);
            expect(result.divisionTotals.phone.totalCount).toBe(20);
        } finally {
            if (fs.existsSync(cachedJsonPath)) fs.unlinkSync(cachedJsonPath);
            if (fs.existsSync(historyFilePath)) fs.unlinkSync(historyFilePath);
            if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
            if (fs.existsSync(historyDir)) fs.rmSync(historyDir, { recursive: true, force: true });
        }
    });

    it('returns cached fallback stats for multi-level divisionMap structure when PBF is missing', async () => {
        const countryName = 'USATest';
        const divisionName = 'California';
        const subName = 'Alameda';
        const reportType = 'phone';

        const buildDir = path.join(BUILD_DIR, reportType, 'usatest', 'california');
        const historyDir = path.join(HISTORY_DIR, reportType, 'usatest');

        fs.mkdirSync(buildDir, { recursive: true });
        fs.mkdirSync(historyDir, { recursive: true });

        const cachedJsonPath = path.join(buildDir, 'alameda.json');
        fs.writeFileSync(cachedJsonPath, JSON.stringify([]));

        const mockStats = {
            name: subName,
            divisionSlug: 'california',
            slug: 'alameda',
            timestamp: new Date().toISOString(),
            invalidCount: 3,
            autoFixableCount: 1,
            foreignCount: 0,
            safeEditCount: 0,
            totalCount: 15,
        };

        const historyFilePath = path.join(historyDir, '2026-01-01.json');
        fs.writeFileSync(
            historyFilePath,
            JSON.stringify({
                groupedDivisionStats: {
                    [divisionName]: [mockStats],
                },
            })
        );

        try {
            const fakeCountryData = {
                name: countryName,
                countryCode: 'US',
                divisionMap: {
                    [divisionName]: {
                        [subName]: 111111,
                    },
                },
            };

            const result = await processDivision(divisionName, fakeCountryData, {});

            expect(result.divisionStats.phone).toHaveLength(1);
            expect(result.divisionStats.phone[0]).toEqual(mockStats);
            expect(result.divisionTotals.phone.invalidCount).toBe(3);
            expect(result.divisionTotals.phone.totalCount).toBe(15);
        } finally {
            if (fs.existsSync(cachedJsonPath)) fs.unlinkSync(cachedJsonPath);
            if (fs.existsSync(historyFilePath)) fs.unlinkSync(historyFilePath);
            if (fs.existsSync(path.join(BUILD_DIR, reportType, 'usatest'))) {
                fs.rmSync(path.join(BUILD_DIR, reportType, 'usatest'), { recursive: true, force: true });
            }
            if (fs.existsSync(historyDir)) fs.rmSync(historyDir, { recursive: true, force: true });
        }
    });
});
