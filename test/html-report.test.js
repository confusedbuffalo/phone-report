const { createJosmFixUrl, generateHtmlReport } = require('../src/html-report.js');
const fs = require('fs');

jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    
    // Create a mock WriteStream that is recognized by stream-chain
    const mockWriteStream = () => {
        const Stream = require('stream');
        const writable = new Stream.Writable();
        
        // --- CRUCIAL ADDITIONS ---
        // 1. Mock pipe() to allow chaining
        writable.pipe = jest.fn().mockReturnThis(); 
        
        // 2. Ensure 'finish' event is fired to complete the async test
        writable.on = jest.fn((event, callback) => {
            if (event === 'finish' && callback) {
                // Resolve the asynchronous stream completion
                process.nextTick(callback); 
            }
            return writable;
        });

        // Mock stream methods used by the pipeline
        writable.end = jest.fn((chunk, encoding, callback) => {
            if (callback) callback();
            writable.emit('finish'); 
        });
        writable._write = jest.fn((chunk, encoding, callback) => {
            callback();
        });
        // -------------------------
        
        return writable;
    };

    // Create a mock ReadStream (also needs pipe)
    const mockReadStream = (path) => {
        const Stream = require('stream');
        const readable = new Stream.Readable();
        readable.pipe = jest.fn().mockReturnThis(); // Also needs pipe!
        
        // Push content and end stream
        readable.push(
            path.includes('.json') ? '[]' : '<html><head></head><body>{reportContent}</body></html>'
        );
        readable.push(null); 
        
        return readable;
    };

    return {
        ...actualFs,
        promises: {
            ...actualFs.promises,
            writeFile: jest.fn().mockResolvedValue(),
            copyFile: jest.fn().mockResolvedValue(),
        },
        createReadStream: jest.fn().mockImplementation(mockReadStream),
        createWriteStream: jest.fn().mockImplementation(mockWriteStream),
    };
});

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
        suggestedFixes: {
            'contact:mobile': null,
            'phone': '+44 141 955 0411'
        },
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
        suggestedFixes: {
            'contact:mobile': null,
            'contact:phone': '+44 141 956 6323; +44 141 955 0411',
        },
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
            invalidCount: 0,
            autoFixableCount: 0,
        };
        const tmpFilePath = 'test.json';

        await generateHtmlReport(countryName, subdivisionStats, tmpFilePath, 'en-US', {});

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