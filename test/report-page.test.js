// --- MOCKING ENVIRONMENT SETUP ---

// Mock Global Constants
global.DEFAULT_EDITORS_MOBILE = ['iD_mock'];
global.DEFAULT_EDITORS_DESKTOP = ['JOSM_mock', 'iD_mock'];
global.STORAGE_KEY = 'mock_storage_key';
global.ALL_EDITOR_IDS = ['JOSM_mock', 'iD_mock', 'RapiD_mock'];
global.OSM_EDITORS = {}; // Not strictly needed for createJosmFixUrl
global.FIX_IN_JOSM_STR = 'Fix in JOSM';
global.FIXABLE_STR = 'Fixable';
global.WEBSITE_STR = 'Website';
global.FIXABLE_NUMBERS_STR = 'Fixable Numbers';
global.FIXABLE_DESCRIPTION_STR = 'Fixable Description';
global.INVALID_NUMBERS_STR = 'Invalid Numbers';
global.INVALID_DESCRIPTION_STR = 'Invalid Description';
global.NO_INVALID_STR = 'No Invalid';
global.invalidItemsClient = []; // Mock to prevent renderNumbers() from crashing

// Mock Browser Globals
global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};

global.window = {
    // Mock window.matchMedia for isMobileView()
    matchMedia: jest.fn().mockImplementation(query => ({
        matches: false, // Default to desktop view
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
    // Mock fetch for openInJosm()
    fetch: jest.fn(() => Promise.resolve({ ok: true })),
};

global.document = {
    // Mock getElementById to return an object with necessary methods/properties
    getElementById: jest.fn().mockImplementation((id) => ({ 
        addEventListener: jest.fn(),
        classList: { toggle: jest.fn(), add: jest.fn() },
        contains: jest.fn(),
        innerHTML: '',
        insertAdjacentHTML: jest.fn(),
        style: {},
    })),
    // Mock event listeners
    addEventListener: jest.fn(),
    // Mock querySelectorAll for applyEditorVisibility() and renderNumbers()
    querySelectorAll: jest.fn().mockReturnValue([]),
    // Mock createElement for other DOM operations if needed
    createElement: jest.fn(),
};

// Mock console to silence logs/errors during test run
global.console = { 
    log: jest.fn(), 
    error: jest.fn(), 
    warn: jest.fn() 
};

const { createJosmFixUrl } = require('../src/client/report-page.js');

describe('createJosmFixUrl', () => {
    const UNFIXABLE_ITEM = {
        type: 'node',
        id: 12164564580,
        osmUrl: 'https://www.openstreetmap.org/node/12164564580',
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
        osmUrl: 'https://www.openstreetmap.org/node/12164564580',
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
        osmUrl: 'https://www.openstreetmap.org/node/12164564580',
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
        osmUrl: 'https://www.openstreetmap.org/node/12164564580',
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
