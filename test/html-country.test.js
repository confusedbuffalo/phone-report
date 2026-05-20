import { jest } from '@jest/globals';
import { escapeHTML } from '../src/html-utils.js';

// Mock dependencies
jest.unstable_mockModule('fs', () => {
    const actualFs = jest.requireActual('fs');
    const promises = {
        writeFile: jest.fn().mockResolvedValue(),
    };
    return {
        ...actualFs,
        promises: promises,
        default: {
            ...actualFs,
            promises: promises,
            readFileSync: jest.fn((filePath, encoding) => {
                // data-processor relies on preset-matcher, mock that
                if (filePath.includes('presets')) {
                    return JSON.stringify({ presets: [] });
                }

                // Otherwise, let the real fs read the template for eta
                return actualFs.readFileSync(filePath, encoding);
            }),
            existsSync: jest.fn(filePath => {
                return actualFs.existsSync(filePath);
            }),
        },
    };
});

const fs = (await import('fs')).default;

jest.unstable_mockModule('../src/i18n.js', () => ({
    translate: (key, locale, args) => {
        if (args) return `${key}: ${Object.values(args).join(',')}`;
        if (key === 'osmPhoneNumberValidation' && locale === 'nl-NL') return 'OSM Telefoon&shy;nummer&shy;validatie';
        return key;
    },
    getTranslations: locale => {
        return {
            exampleKey: 'Example Translation',
            currentLocale: locale,
        };
    },
}));

const { generateCountryIndexHtml } = await import('../src/html-country.js');

describe('generateCountryIndexHtml', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should correctly escape HTML in templates but pass raw names to the client script', async () => {
        const divisionName = "Provence-Alpes-Côte d'Azur";
        const countryData = {
            name: 'France',
            slug: 'france',
            locale: 'fr-FR',
            totalCount: 100,
            invalidCount: 10,
            autoFixableCount: 5,
            groupedDivisionStats: {
                [divisionName]: [
                    {
                        name: 'Subdivision A',
                        slug: 'subdivision-a',
                        invalidCount: 5,
                        totalCount: 50,
                    },
                ],
            },
        };

        await generateCountryIndexHtml('phone', countryData);

        // Verify the server-side template escapes the country name
        const writtenContent = fs.promises.writeFile.mock.calls[0][1];
        const escapedCountryName = escapeHTML(countryData.name);
        expect(writtenContent).toContain(`<title>countryReportTitle: ${escapedCountryName}</title>`);

        // Verify the client-side script receives raw, unescaped division names in the config
        const scriptContentRegex = /<script>\s*window\.__CONFIG__ = (\{.*?\});/s;
        const match = writtenContent.match(scriptContentRegex);
        expect(match).not.toBeNull();

        const configJson = match[1];
        const parsedConfig = JSON.parse(configJson);

        // Check that the key is the raw, unescaped name
        expect(parsedConfig.groupedDivisionStats[divisionName]).toBeDefined();
        expect(Object.keys(parsedConfig.groupedDivisionStats)[0]).toBe(divisionName);
    });

    it('should correctly not escape shy hyphens in headings', async () => {
        const divisionName = 'Europees Nederland';
        const countryData = {
            name: 'Nederland',
            slug: 'nederland',
            locale: 'nl-NL',
            totalCount: 100,
            invalidCount: 10,
            autoFixableCount: 5,
            groupedDivisionStats: {
                [divisionName]: [
                    {
                        name: 'Subdivision A',
                        slug: 'subdivision-a',
                        invalidCount: 5,
                        totalCount: 50,
                    },
                ],
            },
        };

        await generateCountryIndexHtml('phone', countryData);

        // Verify the server-side template escapes the country name
        const writtenContent = fs.promises.writeFile.mock.calls[0][1];
        const escapedCountryName = escapeHTML(countryData.name);
        expect(writtenContent).toContain(`<h1 class="page-title">OSM Telefoon&shy;nummer&shy;validatie</h1>`);
    });
});
