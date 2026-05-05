const { generateCountryIndexHtml } = require('../src/html-country.js');
const { escapeHTML } = require('../src/html-utils.js');
const fs = require('fs');

// Mock dependencies
jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    return {
        ...actualFs,
        promises: {
            ...actualFs.promises,
            writeFile: jest.fn().mockResolvedValue(),
        },
        readFileSync: jest.fn((filePath, encoding) => {
            // data-processor relies on preset-matcher, mock that
            if (filePath.includes('presets')) {
                return JSON.stringify({ presets: [] });
            }
            
            // Otherwise, let the real fs read the template for eta
            return actualFs.readFileSync(filePath, encoding);
        }),
        existsSync: jest.fn((filePath) => {
            return actualFs.existsSync(filePath);
        }),
    };
});

jest.mock('../src/html-utils.js', () => ({
    ...jest.requireActual('../src/html-utils.js'),
    createFooter: () => '<p>mock-footer</p>',
}));

jest.mock('../src/i18n', () => ({
    translate: (key, locale, args) => {
        if (args) return `${key}: ${args.join(',')}`;
        if (key === 'osmPhoneNumberValidation' && locale === 'nl-NL') return 'OSM Telefoon&shy;nummer&shy;validatie';
        return key;
    },
}));

describe('generateCountryIndexHtml', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should correctly escape HTML in templates but pass raw names to the client script", async () => {
        const divisionName = "Provence-Alpes-Côte d'Azur";
        const countryData = {
            name: "France",
            slug: 'france',
            locale: 'fr-FR',
            totalCount: 100,
            invalidCount: 10,
            autoFixableCount: 5,
            groupedDivisionStats: {
                [divisionName]: [{
                    name: 'Subdivision A',
                    slug: 'subdivision-a',
                    invalidCount: 5,
                    totalCount: 50
                }]
            },
        };

        await generateCountryIndexHtml('phone', countryData);

        // Verify the server-side template escapes the country name
        const writtenContent = fs.promises.writeFile.mock.calls[0][1];
        const escapedCountryName = escapeHTML(countryData.name);
        expect(writtenContent).toContain(`<title>countryReportTitle: ${escapedCountryName}</title>`);

        // Verify the client-side script receives raw, unescaped division names
        const scriptContentRegex = /<script>\s*const groupedDivisionStats = (\{.*?\});/s;
        const match = writtenContent.match(scriptContentRegex);
        expect(match).not.toBeNull();

        const statsJson = match[1];
        const parsedStats = JSON.parse(statsJson);

        // Check that the key is the raw, unescaped name
        expect(parsedStats[divisionName]).toBeDefined();
        expect(Object.keys(parsedStats)[0]).toBe(divisionName);
    });

    it("should correctly not escape shy hyphens in headings", async () => {
        const divisionName = "Europees Nederland";
        const countryData = {
            name: "Nederland",
            slug: 'nederland',
            locale: 'nl-NL',
            totalCount: 100,
            invalidCount: 10,
            autoFixableCount: 5,
            groupedDivisionStats: {
                [divisionName]: [{
                    name: 'Subdivision A',
                    slug: 'subdivision-a',
                    invalidCount: 5,
                    totalCount: 50
                }]
            },
        };

        await generateCountryIndexHtml('phone', countryData);

        // Verify the server-side template escapes the country name
        const writtenContent = fs.promises.writeFile.mock.calls[0][1];
        const escapedCountryName = escapeHTML(countryData.name);
        expect(writtenContent).toContain(`<h1 class="page-title">OSM Telefoon&shy;nummer&shy;validatie</h1>`);
    });
});