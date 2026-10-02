import fs from 'fs';
import path from 'path';
import os from 'os';
import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import {
    processDivision,
    shouldSkipDownload,
    recordDownloadFailure,
    createClientTranslations,
    getSubdivisions,
    parseOsmTimestamp,
    createGeoJsonElementStream,
    saveCountryHistory,
} from '../src/main.js';
import { BUILD_DIR, HISTORY_DIR } from '../src/constants.js';

describe('src/main.js test suite', () => {
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

    describe('download failure tracking', () => {
        it('handles null or invalid URLs gracefully', () => {
            expect(shouldSkipDownload(null)).toBe(false);
            expect(shouldSkipDownload('')).toBe(false);
            expect(shouldSkipDownload('not-a-url')).toBe(false);

            // recordDownloadFailure on invalid inputs should not throw
            expect(() => recordDownloadFailure(null)).not.toThrow();
            expect(() => recordDownloadFailure('invalid-url')).not.toThrow();
        });

        it('tracks download failures per server hostname and triggers skip on threshold (5)', () => {
            const testUrl = 'https://download-server-test.example.com/data.pbf';

            expect(shouldSkipDownload(testUrl)).toBe(false);

            for (let i = 1; i <= 4; i++) {
                recordDownloadFailure(testUrl);
                expect(shouldSkipDownload(testUrl)).toBe(false);
            }

            // 5th failure reaches threshold
            recordDownloadFailure(testUrl);
            expect(shouldSkipDownload(testUrl)).toBe(true);

            // another URL on same host should also be skipped
            const otherUrl = 'https://download-server-test.example.com/other.pbf';
            expect(shouldSkipDownload(otherUrl)).toBe(true);
        });

        it('skips queued downloads when server failure threshold is reached after reserveSpace', async () => {
            const { downloadPbf, DiskSpaceManager } = await import('../src/osm-download.js');
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const mockSpaceManager = new DiskSpaceManager(process.cwd(), 1.5, 1);
            // Lock active tickets so subsequent reserveSpace gets queued
            mockSpaceManager.activeTickets = 1;

            const url = 'https://queue-skip-test.example.com/file.pbf';

            const downloadPromise = downloadPbf(url, undefined, mockSpaceManager, shouldSkipDownload);

            // Simulate failures reaching threshold while queued
            for (let i = 0; i < 5; i++) {
                recordDownloadFailure(url);
            }

            // Release active ticket so queued task acquires reservation
            mockSpaceManager.activeTickets = 0;
            mockSpaceManager.checkQueue();

            await expect(downloadPromise).rejects.toThrow(
                `Skipping queued download for ${url} because server failure threshold was reached while waiting in queue.`
            );

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining(`Skipping queued download for ${url}`)
            );

            warnSpy.mockRestore();
        });
    });

    describe('createClientTranslations', () => {
        it('uses specific translations when present, falling back to default translations when missing', () => {
            const defaultTranslations = {
                title: 'Title in English',
                button: 'Click me',
                missingKey: 'Default fallback value',
            };

            const fullTranslations = {
                title: 'Titre en français',
                button: 'Cliquez ici',
            };

            const result = createClientTranslations(fullTranslations, defaultTranslations);

            expect(result).toEqual({
                title: 'Titre en français',
                button: 'Cliquez ici',
                missingKey: 'Default fallback value',
            });
        });

        it('returns exact default translations if fullTranslations is empty', () => {
            const defaultTranslations = { key1: 'Val1', key2: 'Val2' };
            const result = createClientTranslations({}, defaultTranslations);

            expect(result).toEqual(defaultTranslations);
        });
    });

    describe('getSubdivisions', () => {
        it('formats single level divisions correctly', () => {
            const countryData = {
                name: 'CountryA',
                countryCode: 'CA',
                divisions: {
                    Region1: 100,
                    Region2: {
                        relationId: 200,
                        countryCode: 'CA-QC',
                        pbfUrl: 'http://example.com/r2.pbf',
                        timestamp: '2025-01-01T00:00:00Z',
                    },
                },
            };

            const result = getSubdivisions(countryData, 'CountryA');

            expect(result).toEqual([
                {
                    name: 'Region1',
                    id: 100,
                    countryCode: 'CA',
                },
                {
                    name: 'Region2',
                    id: 200,
                    countryCode: 'CA-QC',
                    pbfUrl: 'http://example.com/r2.pbf',
                    timestamp: '2025-01-01T00:00:00Z',
                },
            ]);
        });

        it('formats multi-level divisionMap subdivisions correctly', () => {
            const countryData = {
                name: 'CountryB',
                countryCode: 'US',
                divisionMap: {
                    State1: {
                        County1: 300,
                    },
                },
            };

            const result = getSubdivisions(countryData, 'State1');

            expect(result).toEqual([
                {
                    name: 'County1',
                    id: 300,
                    countryCode: 'US',
                },
            ]);
        });

        it('returns empty array when divisionName is missing in divisionMap', () => {
            const countryData = {
                name: 'CountryB',
                countryCode: 'US',
                divisionMap: {
                    State1: { County1: 300 },
                },
            };

            const result = getSubdivisions(countryData, 'NonExistentState');
            expect(result).toEqual([]);
        });

        it('logs error and returns empty array when configuration has no divisions or divisionMap', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const countryData = { name: 'InvalidCountry', countryCode: 'XX' };

            const result = getSubdivisions(countryData, 'Division1');
            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                'Data for InvalidCountry set up incorrectly, no divisions or divisionMap found'
            );

            consoleSpy.mockRestore();
        });
    });

    describe('parseOsmTimestamp', () => {
        it('returns null for empty or invalid timestamp strings', () => {
            expect(parseOsmTimestamp(null)).toBeNull();
            expect(parseOsmTimestamp('')).toBeNull();
            expect(parseOsmTimestamp('invalid-date')).toBeNull();
        });

        it('returns a valid Date object for valid ISO timestamp strings', () => {
            const iso = '2025-05-10T14:30:00.000Z';
            const result = parseOsmTimestamp(iso);

            expect(result).toBeInstanceOf(Date);
            expect(result.toISOString()).toBe(iso);
        });
    });

    describe('createGeoJsonElementStream', () => {
        let tempFile;

        afterEach(() => {
            if (tempFile && fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        });

        it('splits GeoJSON by record separator (\\x1e) and yields unique elements', async () => {
            tempFile = path.join(os.tmpdir(), `stream-test-${uuidv4()}.geojsonseq`);

            const feature1 = { type: 'Feature', properties: { '@id': 1, '@type': 'node', name: 'A' } };
            const feature2 = { type: 'Feature', properties: { '@id': 2, '@type': 'way', name: 'B' } };
            // Duplicate of feature 1
            const feature1Dup = { type: 'Feature', properties: { '@id': 1, '@type': 'node', name: 'A-dup' } };

            const content = `\x1e${JSON.stringify(feature1)}\n\x1e${JSON.stringify(feature2)}\n\x1e${JSON.stringify(
                feature1Dup
            )}\n`;

            fs.writeFileSync(tempFile, content);

            const stream = createGeoJsonElementStream(tempFile);
            const features = [];
            for await (const feat of stream) {
                features.push(feat);
            }

            expect(features).toHaveLength(2);
            expect(features[0].properties.name).toBe('A');
            expect(features[1].properties.name).toBe('B');
        });

        it('handles features without properties metadata gracefully without deduplicating', async () => {
            tempFile = path.join(os.tmpdir(), `stream-test-${uuidv4()}.geojsonseq`);

            const featureNoMeta = { type: 'Feature', properties: {} };
            const content = `\x1e${JSON.stringify(featureNoMeta)}\n\x1e${JSON.stringify(featureNoMeta)}\n`;

            fs.writeFileSync(tempFile, content);

            const stream = createGeoJsonElementStream(tempFile);
            const features = [];
            for await (const feat of stream) {
                features.push(feat);
            }

            expect(features).toHaveLength(2);
        });
    });

    describe('saveCountryHistory', () => {
        const countrySlug = 'historytestcountry';
        const reportType = 'phone';
        const historyCountryDir = path.join(HISTORY_DIR, reportType, countrySlug);

        beforeEach(() => {
            if (!fs.existsSync(historyCountryDir)) {
                fs.mkdirSync(historyCountryDir, { recursive: true });
            }
        });

        afterEach(() => {
            if (fs.existsSync(historyCountryDir)) {
                fs.rmSync(historyCountryDir, { recursive: true, force: true });
            }
        });

        it('saves country stats to todays history file and recalculates totals', () => {
            const countryStats = {
                name: 'History Test Country',
                slug: countrySlug,
                groupedDivisionStats: {
                    Division1: [
                        {
                            divisionSlug: 'division1',
                            slug: 'sub1',
                            invalidCount: 2,
                            autoFixableCount: 1,
                            safeEditCount: 0,
                            totalCount: 10,
                        },
                        {
                            divisionSlug: 'division1',
                            slug: 'sub2',
                            invalidCount: 3,
                            autoFixableCount: 0,
                            safeEditCount: 1,
                            totalCount: 15,
                        },
                    ],
                },
            };

            saveCountryHistory(reportType, countryStats);

            const today = new Date().toISOString().split('T')[0];
            const historyFile = path.join(historyCountryDir, `${today}.json`);

            expect(fs.existsSync(historyFile)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            expect(savedData.invalidCount).toBe(5);
            expect(savedData.autoFixableCount).toBe(1);
            expect(savedData.safeEditCount).toBe(1);
            expect(savedData.totalCount).toBe(25);
        });

        it('falls back to previous history stats when a division has totalCount === 0', () => {
            // Write a previous history file
            const prevHistoryFile = path.join(historyCountryDir, '2026-01-01.json');
            const prevStats = {
                divisionSlug: 'division1',
                slug: 'sub1',
                name: 'Sub 1',
                invalidCount: 10,
                autoFixableCount: 4,
                safeEditCount: 2,
                totalCount: 50,
            };

            fs.writeFileSync(
                prevHistoryFile,
                JSON.stringify({
                    groupedDivisionStats: {
                        Division1: [prevStats],
                    },
                })
            );

            // Current stats where sub1 failed/has totalCount 0
            const currentCountryStats = {
                name: 'History Test Country',
                slug: countrySlug,
                groupedDivisionStats: {
                    Division1: [
                        {
                            divisionSlug: 'division1',
                            slug: 'sub1',
                            name: 'Sub 1',
                            invalidCount: 0,
                            autoFixableCount: 0,
                            safeEditCount: 0,
                            totalCount: 0,
                        },
                    ],
                },
            };

            saveCountryHistory(reportType, currentCountryStats);

            const today = new Date().toISOString().split('T')[0];
            const historyFile = path.join(historyCountryDir, `${today}.json`);

            const savedData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));

            expect(savedData.groupedDivisionStats.Division1[0]).toEqual(prevStats);
            expect(savedData.totalCount).toBe(50);
            expect(savedData.invalidCount).toBe(10);
            expect(savedData.autoFixableCount).toBe(4);
            expect(savedData.safeEditCount).toBe(2);
        });
    });
});
