const { createJosmFixUrl, generateHtmlReport } = require('../src/html-report.js');
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

describe('createJosmFixUrl', () => {
    const UNFIXABLE_ITEM = {
        type: 'node',
        id: 12164564580,
        website: null,
        lat: 55.941545,
        lon: -4.3303375,
        couldBeArea: false,
        name: 'Shan Tandoori',
        allTags: {
            'contact:mobile': '+44 141',
        },
        invalidNumbers: { 'contact:mobile': '+44 141' },
        suggestedFixes: { 'contact:mobile': null },
        hasTypeMismatch: false,
        mismatchTypeNumbers: [],
        autoFixable: false
    }

    const FIXABLE_ITEM = {
        type: 'node',
        id: 12164564580,
        website: null,
        lat: 55.941545,
        lon: -4.3303375,
        couldBeArea: false,
        name: 'Shan Tandoori',
        allTags: {
            'contact:phone': '0141 956 6323',
        },
        invalidNumbers: { 'contact:phone': '0141 956 6323' },
        suggestedFixes: { 'contact:phone': '+44 141 956 6323' },
        hasTypeMismatch: false,
        mismatchTypeNumbers: [],
        autoFixable: true,
        phoneTagToUse: "contact:phone"
    }

    const MISMATCH_MOVE_TAG_ITEM = {
        type: 'node',
        id: 12164564580,
        website: null,
        lat: 55.941545,
        lon: -4.3303375,
        couldBeArea: false,
        name: 'Shan Tandoori',
        allTags: {
            'contact:mobile': '+44 141 955 0411',
        },
        invalidNumbers: { 'contact:mobile': '+44 141 955 0411' },
        suggestedFixes: { 'contact:mobile': null },
        hasTypeMismatch: true,
        mismatchTypeNumbers: {'contact:mobile': '+44 141 955 0411'},
        autoFixable: true,
        phoneTagToUse: "phone"
    }

    const MISTMATCH_ADD_TO_TAG_ITEM = {
        type: 'node',
        id: 12164564580,
        website: null,
        lat: 55.941545,
        lon: -4.3303375,
        couldBeArea: false,
        name: 'Shan Tandoori',
        allTags: {
            'contact:mobile': '+44 141 955 0411',
            'contact:phone': '+44 141 956 6323',
        },
        invalidNumbers: { 'contact:mobile': '+44 141 955 0411' },
        suggestedFixes: { 'contact:mobile': null },
        hasTypeMismatch: true,
        mismatchTypeNumbers: {'contact:mobile': '+44 141 955 0411'},
        autoFixable: true,
        phoneTagToUse: "contact:phone"
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should return null if item is not fixable', () => {
        expect(createJosmFixUrl(UNFIXABLE_ITEM)).toBe(null);
    });

    test('should return fix URL', () => {
        const addTags = encodeURIComponent('contact:phone') + '=' + encodeURIComponent('+44 141 956 6323');
        expect(createJosmFixUrl(FIXABLE_ITEM)).toBe(`http://127.0.0.1:8111/load_object?objects=n12164564580&addtags=${addTags}`,);
    });

    test('should remove old tag and add new tag for tag mismatch', () => {
        const addTags = encodeURIComponent('contact:mobile') + '=' + encodeURIComponent('|phone') + '=' + encodeURIComponent('+44 141 955 0411');
        expect(createJosmFixUrl(MISMATCH_MOVE_TAG_ITEM)).toBe(`http://127.0.0.1:8111/load_object?objects=n12164564580&addtags=${addTags}`,);
    });

    test('should remove old tag and append to existing tag for tag mismatch', () => {
        const addTags = encodeURIComponent('contact:mobile') + '=' + encodeURIComponent('|contact:phone') + '=' + encodeURIComponent('+44 141 956 6323; +44 141 955 0411');
        expect(createJosmFixUrl(MISTMATCH_ADD_TO_TAG_ITEM)).toBe(`http://127.0.0.1:8111/load_object?objects=n12164564580&addtags=${addTags}`,);
    });
});


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

        const writtenContent = fs.promises.writeFile.mock.calls[1][1];

        // Check for the escaped subdivision name in the <title>
        const expectedTitle = `<title>countryReportTitle: O&#039;Fallon</title>`;
        expect(writtenContent).toContain(expectedTitle);

        // Check for the escaped subdivision name in the subtitle
        const expectedSubtitle = `<h2 class="page-subtitle">O&#039;Fallon</h2>`;
        expect(writtenContent).toContain(expectedSubtitle);
    });
});