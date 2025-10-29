const { generateHtmlReport } = require('../src/html-report.js');
const fs = require('fs');

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn().mockResolvedValue(),
    },
    readFileSync: jest.fn().mockReturnValue('{}'),
    existsSync: jest.fn().mockReturnValue(false),
}));

jest.mock('../src/i18n', () => ({
    translate: (key, locale, args) => {
        if (args) return `${key}: ${args.join(',')}`;
        return key;
    },
}));

jest.mock('../src/diff-renderer.js', () => ({
    getDiffHtml: (original, suggested) => ({
        oldDiff: original,
        newDiff: suggested,
    }),
}));

jest.mock('../src/icon-manager.js', () => ({
    getIconHtml: () => '<i>icon</i>',
    generateSvgSprite: () => '<svg></svg>',
    clearIconSprite: jest.fn(),
}));

jest.mock('../src/data-processor.js', () => ({
    ...jest.requireActual('../src/data-processor.js'),
    getFeatureTypeName: (item) => item.name || 'Unknown Feature',
    getFeatureIcon: () => 'iD-icon-point',
    isDisused: () => false,
}));

describe('generateHtmlReport', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should correctly escape country and subdivision names with special characters', async () => {
        const countryName = "St. Kitts & Nevis";
        const subdivisionStats = {
            name: "O'Fallon",
            divisionSlug: 'st-clair-county',
            slug: 'ofallon',
            totalNumbers: 10,
            invalidCount: 1,
            autoFixableCount: 1,
        };
        const invalidNumbers = [];

        await generateHtmlReport(countryName, subdivisionStats, invalidNumbers, 'en-US', {});

        // Verify that fs.promises.writeFile was called
        expect(fs.promises.writeFile).toHaveBeenCalled();

        const writtenContent = fs.promises.writeFile.mock.calls[0][1];

        // Check for the escaped subdivision name in the <title>
        const expectedTitle = `<title>countryReportTitle: O&#039;Fallon</title>`;
        expect(writtenContent).toContain(expectedTitle);

        // Check for the escaped subdivision name in the subtitle
        const expectedSubtitle = `<h2 class="page-subtitle">O&#039;Fallon</h2>`;
        expect(writtenContent).toContain(expectedSubtitle);
    });
});