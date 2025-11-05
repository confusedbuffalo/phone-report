const path = require('path');
const { translate } = require('./i18n');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const MOBILE_TAGS = ['mobile', 'contact:mobile', 'phone:mobile'];
const NON_MOBILE_TAGS = ['phone', 'contact:phone'];
const PHONE_TAGS = [...MOBILE_TAGS, ...NON_MOBILE_TAGS];

/**
 * Defines the preference order for phone-related OpenStreetMap (OSM) keys.
 * A lower number indicates a higher preference (i.e., the key to KEEP).
 * Based on tag usage statistics, accurate as of 2025-11
 * * Preference Order:
 * 1. phone (0)
 * 2. contact:phone (1)
 * 3. mobile (2)
 * 4. contact:mobile (3)
 * 5. phone:mobile (3)
 */
const PHONE_TAG_PREFERENCE_ORDER = {
    'phone': 0,
    'contact:phone': 1,
    'mobile': 2,
    'contact:mobile': 3,
    'phone:mobile': 4
};

const WEBSITE_TAGS = ['website', 'contact:website'];

const COUNTRIES = require(path.join(__dirname, 'data', 'countries.json'));

// Order matters: first found one is preferred
// These are only used if the element has no name
const FEATURE_TAGS = [
    'amenity', 'shop', 'tourism', 'leisure', 'emergency', 'building',
    'craft', 'aeroway', 'railway', 'healthcare', 'highway', 'military',
    'man_made', 'public_transport', 'landuse', 'natural', 'barrier', 'historic'
];

const HISTORIC_AND_DISUSED_PREFIXES = [
    'disused', 'historic', 'was', 'abandoned'
]

const OSM_EDITORS = {
    "JOSM": {
        getEditLink: function (item) {
            const baseUrl = 'http://127.0.0.1:8111/load_object';
            return `${baseUrl}?objects=${item.type[0]}${item.id}`;
        },
        editInString: (locale) => translate('editIn', locale, ["JOSM"]),
        onClick: function (editorId) {
            return `openInJosm(OSM_EDITORS['${editorId}'].getEditLink(item), event)`
        }
    },
    "iD": {
        getEditLink: function (item) {
            const baseUrl = 'https://www.openstreetmap.org/edit?editor=id';
            return `${baseUrl}&${item.type}=${item.id}#map=19/${item.lat}/${item.lon}`;
        },
        editInString: (locale) => translate('editIn', locale, ["iD"]),
    },
    "Rapid": {
        getEditLink: function (item) {
            const baseUrl = 'https://rapideditor.org/edit#map=19';
            return `${baseUrl}/${item.lat}/${item.lon}&id=${item.type[0]}${item.id}`;
        },
        editInString: (locale) => translate('editIn', locale, ["Rapid"]),
    },
    "Level0": {
        getEditLink: function (item) {
            const baseUrl = 'https://level0.osmz.ru/?url=';
            return `${baseUrl}${item.type}/${item.id}`;
        },
        editInString: (locale) => translate('editIn', locale, ["Level0"]),
    },
    "Geo": {
        getEditLink: function (item) {
            const baseUrl = 'geo:';
            return `${baseUrl}${item.lat},${item.lon}`;
        },
        editInString: (locale) => translate('openLocation', locale),
    },
};

const ALL_EDITOR_IDS = Object.keys(OSM_EDITORS);

const DEFAULT_EDITORS_DESKTOP = ["iD", "JOSM"];
const DEFAULT_EDITORS_MOBILE = ["Geo", "Level0"];

const EXCLUSIONS = {
    'FR': { // France
        '3631': { // The phone number to check (must be the core number, no country code or spaces)
            'amenity': 'post_office',
        },
    },
};

// Define the regex for separators that are definitively "bad" and should trigger a fix report.
const BAD_SEPARATOR_REGEX = /(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

// This regex is used for splitting by data-processor.js. It catches ALL valid and invalid separators:
// Raw semicolon (';'), semicolon with optional space ('; ?'), comma, slash, 'or' or 'and'.
const UNIVERSAL_SPLIT_REGEX = /(?:; ?)|(?:\s*,\s*)|(?:\s*\/\s*)|(?:\s+or\s+)|(?:\s+and\s+)|(?:\s+oder\s+)/gi;
const UNIVERSAL_SPLIT_REGEX_DE = /(?:; ?)|(?:\s*,\s*)|(?:\s+or\s+)|(?:\s+and\s+)|(?:\s+oder\s+)/gi;

// When used in diff, the groups need to be capturing
const UNIVERSAL_SPLIT_CAPTURE_REGEX = /(; ?)|(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

const ICON_ATTRIBUTION = [
    {
        name: 'Font Awesome Icons',
        license: '(CC BY 4.0)',
        license_link: 'https://github.com/FortAwesome/Font-Awesome/blob/7.x/LICENSE.txt',
        link: 'https://fontawesome.com'
    },
    {
        name: 'Maki Icons',
        license: '(CC0 1.0)',
        license_link: 'https://creativecommons.org/publicdomain/zero/1.0/',
        link: 'https://github.com/mapbox/maki'
    },
    {
        name: 'Temaki icons',
        license: '(CC0 1.0)',
        license_link: 'https://creativecommons.org/publicdomain/zero/1.0/',
        link: 'https://github.com/rapideditor/temaki'
    },
    {
        name: 'Röntgen icons',
        attribution: 'by Sergey Vartanov',
        license: '(CC BY 4.0)',
        license_link: 'https://creativecommons.org/licenses/by/4.0/',
        link: 'https://github.com/enzet/Roentgen'
    },
    {
        name: 'iD icons',
        attribution: 'Copyright (c) 2017, iD Contributors',
        license: 'ISC License',
        license_link: 'https://github.com/openstreetmap/iD/blob/develop/LICENSE.md',
        link: 'https://github.com/openstreetmap/iD/tree/develop/svg/iD-sprite'
    }
]

const GITHUB_ICON_PACKS = {
    'roentgen': {
        owner: 'enzet',
        repo: 'Roentgen',
        folder_path: 'icons',
        output_sub_dir: 'roentgen',
    },
    'iD-preset': {
        owner: 'openstreetmap',
        repo: 'iD',
        folder_path: 'svg/iD-sprite/presets',
        output_sub_dir: 'iD',
    },
    'iD-icon': {
        owner: 'openstreetmap',
        repo: 'iD',
        folder_path: 'svg/iD-sprite/icons',
        output_sub_dir: 'iD' // same as presets, shouldn't be any filename clashes though
    }
}

const ICONS_DIR = path.join(__dirname, '..', 'icons');
const GITHUB_API_BASE_URL = 'https://api.github.com/repos';

const HISTORY_DIR = path.join(__dirname, '..', 'history');

module.exports = {
    PUBLIC_DIR,
    OVERPASS_API_URL,
    MOBILE_TAGS,
    NON_MOBILE_TAGS,
    PHONE_TAGS,
    WEBSITE_TAGS,
    COUNTRIES,
    FEATURE_TAGS,
    HISTORIC_AND_DISUSED_PREFIXES,
    OSM_EDITORS,
    ALL_EDITOR_IDS,
    DEFAULT_EDITORS_DESKTOP,
    DEFAULT_EDITORS_MOBILE,
    EXCLUSIONS,
    BAD_SEPARATOR_REGEX,
    UNIVERSAL_SPLIT_REGEX,
    UNIVERSAL_SPLIT_REGEX_DE,
    UNIVERSAL_SPLIT_CAPTURE_REGEX,
    ICONS_DIR,
    GITHUB_API_BASE_URL,
    GITHUB_ICON_PACKS,
    ICON_ATTRIBUTION,
    HISTORY_DIR,
    PHONE_TAG_PREFERENCE_ORDER
};
