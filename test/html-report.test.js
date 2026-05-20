import { jest } from '@jest/globals';

// Mock fs module
jest.unstable_mockModule('fs', () => {
    const originalFs = jest.requireActual('fs');
    const Stream = jest.requireActual('stream');
    const promises = {
        writeFile: jest.fn().mockResolvedValue(),
    };

    return {
        ...originalFs,
        promises: promises,
        default: {
            ...originalFs,
            promises: promises,
            createReadStream: jest.fn().mockImplementation(() => {
                const readable = new Stream.Readable();
                readable.push('[]');
                readable.push(null);
                return readable;
            }),
            createWriteStream: jest.fn().mockImplementation(() => {
                const writable = new Stream.Writable({
                    highWaterMark: 16,
                });

                writable._write = (chunk, encoding, callback) => {
                    callback();
                };

                const originalEnd = writable.end;
                writable.end = function (...args) {
                    originalEnd.apply(this, args);

                    process.nextTick(() => {
                        writable.emit('finish');
                    });
                };

                return writable;
            }),
        },
    };
});

const fs = (await import('fs')).default;
const Stream = (await import('stream')).default;

jest.unstable_mockModule('../src/i18n.js', () => ({
    translate: (key, locale, args) => {
        if (args) return `${key}: ${Object.values(args).join(',')}`;
        return key;
    },
    getTranslations: locale => ({}),
}));

jest.unstable_mockModule('../src/diff-renderer.js', () => ({
    getPhoneDiffHtml: (original, suggested) => ({
        oldDiff: original,
        newDiff: suggested,
    }),
    getHoursDiffHtml: (original, suggested) => ({
        oldDiff: original,
        newDiff: suggested,
    }),
    getDiffTagsHtml: (oldTag, newTag) => ({
        oldTagDiff: oldTag,
        newTagDiff: newTag,
    }),
}));

jest.unstable_mockModule('../src/icon-manager.js', () => ({
    IconManager: jest.fn().mockImplementation(() => {
        return {
            getIconHtml: () => '<i>icon</i>',
            generateSvgSprite: () => '<svg></svg>',
            clearIconSprite: jest.fn(),
        };
    }),
}));

const actualDataProcessor = await import('../src/data-processor.js');
jest.unstable_mockModule('../src/data-processor.js', () => ({
    ...actualDataProcessor,
    getFeatureTypeName: item => item.name || 'Unknown Feature',
    getFeatureIcon: () => 'iD-icon-point',
    isDisused: () => false,
}));

const { createJosmFixUrl, generateHtmlReport } = await import('../src/html-report.js');

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
        autoFixable: false,
    };

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
        phoneTagToUse: 'contact:phone',
    };

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
        suggestedFixes: {
            'contact:mobile': null,
            phone: '+44 141 955 0411',
        },
        hasTypeMismatch: true,
        mismatchTypeNumbers: { 'contact:mobile': '+44 141 955 0411' },
        autoFixable: true,
        phoneTagToUse: 'phone',
    };

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
        suggestedFixes: {
            'contact:mobile': null,
            'contact:phone': '+44 141 956 6323; +44 141 955 0411',
        },
        hasTypeMismatch: true,
        mismatchTypeNumbers: { 'contact:mobile': '+44 141 955 0411' },
        autoFixable: true,
        phoneTagToUse: 'contact:phone',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should return null if item is not fixable', () => {
        expect(createJosmFixUrl(UNFIXABLE_ITEM)).toBe(null);
    });

    test('should return fix URL', () => {
        const addTags = encodeURIComponent('contact:phone') + '=' + encodeURIComponent('+44 141 956 6323');
        expect(createJosmFixUrl(FIXABLE_ITEM)).toBe(
            `http://127.0.0.1:8111/load_object?objects=n12164564580&relation_members=true&addtags=${addTags}`
        );
    });

    test('should remove old tag and add new tag for tag mismatch', () => {
        const addTags =
            encodeURIComponent('contact:mobile') +
            '=' +
            encodeURIComponent('|phone') +
            '=' +
            encodeURIComponent('+44 141 955 0411');
        expect(createJosmFixUrl(MISMATCH_MOVE_TAG_ITEM)).toBe(
            `http://127.0.0.1:8111/load_object?objects=n12164564580&relation_members=true&addtags=${addTags}`
        );
    });

    test('should remove old tag and append to existing tag for tag mismatch', () => {
        const addTags =
            encodeURIComponent('contact:mobile') +
            '=' +
            encodeURIComponent('|contact:phone') +
            '=' +
            encodeURIComponent('+44 141 956 6323; +44 141 955 0411');
        expect(createJosmFixUrl(MISTMATCH_ADD_TO_TAG_ITEM)).toBe(
            `http://127.0.0.1:8111/load_object?objects=n12164564580&relation_members=true&addtags=${addTags}`
        );
    });
});

describe('generateHtmlReport', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should correctly escape country and subdivision names with special characters', async () => {
        const countryData = {
            countryName: 'St. Kitts & Nevis',
            locale: 'en-US',
            officialLanguages: ['en'],
        };
        const subdivisionStats = {
            name: "O'Fallon",
            divisionSlug: 'st-clair-county',
            slug: 'ofallon',
            totalCount: 10,
            invalidCount: 0,
            autoFixableCount: 0,
            foreignCount: 0,
        };
        const tmpFilePath = 'test.json';

        await generateHtmlReport('phone', countryData, subdivisionStats, tmpFilePath, {});

        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify that fs.promises.writeFile was called
        expect(fs.promises.writeFile).toHaveBeenCalled();

        const writtenContent = fs.promises.writeFile.mock.calls[0][1];

        // Check for the escaped subdivision name in the <title>
        const expectedTitle = `<title>countryReportTitle: O&#039;Fallon</title>`;
        expect(writtenContent).toContain(expectedTitle);

        // Check for the escaped subdivision name in the subtitle
        const expectedSubtitle = `<h2 class="page-subtitle">O&#039;Fallon</h2>`;
        expect(writtenContent).toContain(expectedSubtitle);

        // Check for the official languages in the config
        expect(writtenContent).toContain('"officialLanguages":["en"]');
    });
});

const { getLengthProblemText } = await import('../src/html-report.js');

describe('generateHtmlReport', () => {
    test('Label short number as too short', async () => {
        const result = getLengthProblemText('12345', 'en', 'GB');
        expect(result).toEqual('tooShort');
    });

    test('Label long number as too long', async () => {
        const result = getLengthProblemText('0123456789012', 'en', 'GB');
        expect(result).toEqual('tooLong');
    });

    test('Multiple numbers should not get a label', async () => {
        const semicolonResult = getLengthProblemText('012345;098765', 'en', 'GB');
        expect(semicolonResult).toEqual('');

        const orResult = getLengthProblemText('012345 or 098765', 'en', 'GB');
        expect(orResult).toEqual('');

        const slashResult = getLengthProblemText('012345 / 098765', 'en', 'GB');
        expect(slashResult).toEqual('');
    });
});
