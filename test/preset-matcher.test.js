const { getBestPreset, getMatchScore, getGeometry } = require('../src/preset-matcher.js');

// 1. Mock the file system to prevent errors when requiring the main file
jest.mock('fs', () => ({
    readFileSync: jest.fn(() => JSON.stringify({})),
    existsSync: jest.fn(() => false)
}));

// --- Test Data ---

// Item with tags for the cable presets
const cableTags = {
    communication: 'line',
    description: 'ZANDVOORT TO ZEEBRUGGE',
    name: 'Concerto 1E',
    operator: 'Interoute',
    'seamark:type': 'cable_submarine',
    submarine: 'yes',
    wikidata: 'Q2490425',
};
const cableItem = {
    type: 'way', // Should result in 'line' geometry
    allTags: cableTags
};

// Item with tags for the defibrillator and indoor presets (point geometry)
const defibrillatorTags = {
    access: 'yes',
    'defibrillator:location': 'Onder het afdak aan Budastraat 27',
    emergency: 'defibrillator', // The specific tag for the high-priority preset
    indoor: 'no', // The tag for the high-base-score, generic preset
    opening_hours: '24/7',
};
const defibrillatorItem = {
    type: 'node', // Should result in 'point' geometry
    allTags: defibrillatorTags
};


// Define the mock presets used for matching, including all conflicting pairs
const mockPresets = {
    // 1. Defibrillator (Specific Match)
    'emergency/defibrillator': {
        id: 'emergency/defibrillator',
        icon: 'maki-defibrillator',
        geometry: ['point', 'vertex'],
        tags: {
            'emergency': 'defibrillator' // Specific match
        },
    },
    // 2. Indoor (High Base Score + Wildcard Match)
    'indoor': {
        id: 'indoor',
        icon: 'temaki-room',
        geometry: ['point', 'vertex', 'line', 'area'],
        tags: {
            'indoor': '*' // Wildcard match
        },
        matchScore: 0.8 // High base score
    },
    // 3. Seamark (Wildcard Match)
    'seamark': {
        id: 'seamark',
        icon: 'maki-harbor',
        geometry: ['point', 'vertex', 'line', 'area'],
        tags: {
            'seamark:type': '*'
        },
    },
    // 4. Line (Generic)
    'line': {
        id: 'line',
        geometry: ['line'],
        tags: {},
        matchScore: 0.1
    },
    // 5. Comm/Cable (Specific Match, highest score)
    'comm/cable': {
        id: 'comm/cable',
        icon: 'iD-icon-communication-cable',
        geometry: ['line'],
        tags: {
            'communication': 'line',
            'submarine': 'yes'
        },
        matchScore: 2
    },
};

// Global helper to inject mock presets into the logic during testing
global.getMockPresets = () => mockPresets;


describe('Preset Matching Logic', () => {

    // Test the specific match score function
    describe('getMatchScore', () => {
        
        test('should prioritize a specific tag match generic match score', () => {
            const geometry = getGeometry(defibrillatorItem); // 'point'
            
            const defibPreset = mockPresets['emergency/defibrillator'];
            expect(getMatchScore(defibPreset, defibrillatorItem.allTags, geometry)).toBe(1.0);
            
            const indoorPreset = mockPresets.indoor;
            expect(getMatchScore(indoorPreset, defibrillatorItem.allTags, geometry)).toBe(0.8);
        });
        
        test('should correctly score the "seamark" preset (Wildcard Match)', () => {
            const geometry = getGeometry(cableItem); // 'line'
            const preset = mockPresets.seamark;
            expect(getMatchScore(preset, cableItem.allTags, geometry)).toBe(0.5);
        });
        
        test('should correctly score the "comm/cable" preset (Specific Match)', () => {
            const geometry = getGeometry(cableItem); // 'line'
            const preset = mockPresets['comm/cable'];
            expect(getMatchScore(preset, cableItem.allTags, geometry)).toBe(2);
        });
    });

    // Test the main function
    describe('getBestPreset', () => {
        
        test('should choose the highly specific preset (defibrillator) over the high-base-score preset (indoor)', () => {
            const bestPreset = getBestPreset(defibrillatorItem, 'en');
            expect(bestPreset.id).toBe('emergency/defibrillator');
            expect(bestPreset.icon).toBe('maki-defibrillator');
        });

        test('should choose the highest scoring specific preset ("comm/cable") over others', () => {
            const bestPreset = getBestPreset(cableItem, 'en');
            expect(bestPreset.id).toBe('comm/cable');
            expect(bestPreset.icon).toBe('iD-icon-communication-cable');
        });

        test('should select "seamark" if it is the highest scorer, beating the generic "line" preset', () => {
            const competitionPresets = {
                'seamark': mockPresets.seamark,      // Score: 1.0
                'line': mockPresets.line             // Score: 0.1
            };
            global.getMockPresets = () => competitionPresets;
            
            const bestPreset = getBestPreset(cableItem, 'en');
            
            expect(bestPreset.id).toBe('seamark');
            expect(bestPreset.icon).toBe('maki-harbor');
        });
    });
});
