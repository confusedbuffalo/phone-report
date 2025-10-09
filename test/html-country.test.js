const { generateCountryIndexHtml } = require('../src/html-country.js');
const { escapeHTML } = require('../src/html-utils.js');
const fs = require('fs');

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn().mockResolvedValue(),
    },
}));

jest.mock('../src/html-utils.js', () => ({
    ...jest.requireActual('../src/html-utils.js'),
    createFooter: () => '<p>mock-footer</p>',
}));

jest.mock('../src/i18n', () => ({
    translate: (key, locale, args) => {
        if (args) return `${key}: ${args.join(',')}`;
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
            totalNumbers: 100,
            invalidCount: 10,
            autoFixableCount: 5,
            groupedDivisionStats: {
                [divisionName]: [{
                    name: 'Subdivision A',
                    slug: 'subdivision-a',
                    invalidCount: 5,
                    totalNumbers: 50
                }]
            },
        };

        await generateCountryIndexHtml(countryData, {});

        // 1. Verify the server-side template escapes the country name
        const writtenContent = fs.promises.writeFile.mock.calls[0][1];
        const escapedCountryName = escapeHTML(countryData.name);
        expect(writtenContent).toContain(`<title>countryReportTitle: ${escapedCountryName}</title>`);

        // 2. Verify the client-side script receives raw, unescaped division names
        const scriptContentRegex = /<script>\s*const groupedDivisionStats = (\{.*?\});/s;
        const match = writtenContent.match(scriptContentRegex);
        expect(match).not.toBeNull();

        const statsJson = match[1];
        const parsedStats = JSON.parse(statsJson);

        // Check that the key is the raw, unescaped name
        expect(parsedStats[divisionName]).toBeDefined();
        expect(Object.keys(parsedStats)[0]).toBe(divisionName);
    });
});