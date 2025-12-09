const path = require('path');
const { translate } = require('./i18n');
const packageInfo = require('../package.json');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const MOBILE_TAGS = ['mobile', 'contact:mobile', 'phone:mobile'];
const NON_MOBILE_TAGS = ['phone', 'contact:phone'];
const PHONE_TAGS = [...MOBILE_TAGS, ...NON_MOBILE_TAGS];
const FAX_TAGS = ['fax', 'contact:fax'];
const OTHER_TAGS = ['contact:whatsapp'];
const ALL_NUMBER_TAGS = [...PHONE_TAGS, ...FAX_TAGS, ...OTHER_TAGS];

/**
 * Defines the preference order for phone-related OpenStreetMap (OSM) keys.
 * A lower number indicates a higher preference (i.e., the key to KEEP).
 * Based on tag usage statistics, accurate as of 2025-11
 * Fax numbers added on the end, they should never be compared to regular phone numbers
 * * Preference Order:
 * 1. phone (0)
 * 2. contact:phone (1)
 * 3. mobile (2)
 * 4. contact:mobile (3)
 * 5. phone:mobile (4)
 * 6. fax (5)
 * 7. contact:fax (6)
 */
const PHONE_TAG_PREFERENCE_ORDER = {
    'phone': 0,
    'contact:phone': 1,
    'mobile': 2,
    'contact:mobile': 3,
    'phone:mobile': 4,
    'fax': 5,
    'contact:fax': 6,
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

const DEFAULT_EDITORS_DESKTOP = ["JOSM"];
const DEFAULT_EDITORS_MOBILE = ["Geo", "Level0"];

const EXCLUSIONS = {
    'FR': { // France
        '3631': { // The phone number to check (must be the core number, no country code or spaces)
            'amenity': 'post_office',
        },
    },
};

// Regex matches common extension prefixes:
// EN: x, ext, extension
// FR/CA: poste
// PL: wew, wewn
// It captures each of everything before the extension marker and everything after
// strings are lowercased before checking against this
const EXTENSION_REGEX = /^(.*?)(\s*\(?(?:x|ext\.?|extension|poste|wewn?\.?)\s*)(\d*)\)?$/;
const ACCEPTABLE_EXTENSION_FORMATS = [' ext. ', ' x', 'x']

// DIN format has hyphen then 1-5 digits for extensions
const DE_EXTENSION_REGEX = /^(.*?)(\s*[-−‐‑‒–—]\s*)([^-]+)$/;

// Define the regex for separators that are definitively "bad" and should trigger a fix report.
const BAD_SEPARATOR_REGEX = /(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

// FR: https://github.com/confusedbuffalo/phone-report/issues/18
// DE: https://community.openstreetmap.org/t/telefonnummer-nebenstelle-kennzeichnen-phonenumbervalidator/137711/19
const TOLL_FREE_AS_NATIONAL_COUNTRIES = ['FR', 'DE']

const NON_STANDARD_COST_TYPES = ['TOLL_FREE', 'SHARED_COST', 'PREMIUM_RATE']

// This regex is used for splitting by data-processor.js. It catches ALL valid and invalid separators:

const SEPARATOR_OPTIONAL_SPACE = [';', ',', '/'];
const SEPARATOR_OPTIONAL_SPACE_DE = [';', ','];
const SEPARATOR_NEED_SPACE = ['or', 'and', 'oder', 'y'];

const escapeRegex = (string) => {
    return string.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
};

const spaceOptionalGroups = SEPARATOR_OPTIONAL_SPACE.map(sep => {
    const escapedSep = escapeRegex(sep);

    if (sep === ';') {
        // Don't split on escaped semicolons, e.g. within "\;ext="
        return `(\\s*(?<!\\\\)(?:${escapedSep})\\s*)`;
    }
    if (sep === ',') {
        // Don't split on commas followed by ",ext" or ", ext"
        return `(\\s*(?:${escapedSep})(?!\\s*ext)\\s*)`;
    }

    return `(\\s*${escapedSep}\\s*)`;
}).join('|');

const spaceOptionalGroupsDe = SEPARATOR_OPTIONAL_SPACE_DE.map(sep => {
    const escapedSep = escapeRegex(sep);
    return `(\\s*${escapedSep}\\s*)`;
}).join('|');

const needSpacesGroups = SEPARATOR_NEED_SPACE.map(sep => {
    const escapedSep = escapeRegex(sep);
    return `(\\s+${escapedSep}\\s+)`;
}).join('|');

const ALL_SEPARATOR_GROUPS = `${spaceOptionalGroups}|${needSpacesGroups}`;
const allGroupsDe = `${spaceOptionalGroupsDe}|${needSpacesGroups}`;

const CAPTURING_GROUP_TO_NON_CAPTURING_REGEX = /\((?!\?)(.*?)\)/g;

// Includes capturing groups to get the separators back
// When used in diff, the groups need to be capturing
const UNIVERSAL_SPLIT_CAPTURE_REGEX = new RegExp(ALL_SEPARATOR_GROUPS, 'gi');
const UNIVERSAL_SPLIT_CAPTURE_REGEX_DE = new RegExp(allGroupsDe, 'gi');

const UNIVERSAL_SPLIT_REGEX = new RegExp(
    ALL_SEPARATOR_GROUPS.replace(CAPTURING_GROUP_TO_NON_CAPTURING_REGEX, '(?:$1)'), 
    'gi'
);
const UNIVERSAL_SPLIT_REGEX_DE = new RegExp(
    allGroupsDe.replace(CAPTURING_GROUP_TO_NON_CAPTURING_REGEX, '(?:$1)'), 
    'gi'
);

// Characters that libphonenumbers does not parse but may be used instead of spaces
const INVALID_SPACING_CHARACTERS_REGEX = /\t|_|·/g

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
const SAFE_EDITS_DIR = path.join(__dirname, '..', 'safe_edits');

const GITHUB_LINK = "https://github.com/confusedbuffalo/phone-report/";
const HOST_URL = 'https://confusedbuffalo.github.io/phone-report/'

const PACKAGE_NAME = packageInfo.name;
const PACKAGE_VERSION = packageInfo.version;
const PACKAGE_STRING = `${PACKAGE_NAME}/${PACKAGE_VERSION}`;

const CHANGESET_TAGS = {
    "comment": "Fix phone number issues: missing country code, incorrect separators, extra characters, duplicate phone numbers",
    "created_by": PACKAGE_STRING,
    "host": HOST_URL
}

const AUTO_CHANGESET_TAGS = {
    "comment": "Automatically fix phone number issues: missing country code, extra punctuation",
    "created_by": `${PACKAGE_NAME}/${PACKAGE_VERSION}`,
    "bot": "yes",
    "automatic": "yes",
    "source_code": GITHUB_LINK,
    "osm_wiki_documentation_page": "https://wiki.openstreetmap.org/wiki/Automated_edits/confusedbuffalo/Fix_basic_phone_number_issues",
}

const NANP_COUNTRY_CODES = [
    'US', // United States
    'CA', // Canada
    'AG', // Antigua and Barbuda
    'AI', // Anguilla
    'AS', // American Samoa
    'BB', // Barbados
    'BM', // Bermuda
    'BS', // Bahamas
    'DM', // Dominica
    'DO', // Dominican Republic
    'GD', // Grenada
    'GU', // Guam
    'JM', // Jamaica
    'KN', // Saint Kitts and Nevis
    'KY', // Cayman Islands
    'LC', // Saint Lucia
    'MP', // Northern Mariana Islands
    'MS', // Montserrat
    'PR', // Puerto Rico
    'SX', // Sint Maarten
    'TC', // Turks and Caicos Islands
    'TT', // Trinidad and Tobago
    'VC', // Saint Vincent and the Grenadines
    'VG', // British Virgin Islands
    'VI', // U.S. Virgin Islands
];

const usTerritoryCodes = new Map([
    ['American Samoa', 'AS'],
    ['Guam', 'GU'],
    ['Puerto Rico', 'PR'],
    ['Northern Mariana Islands', 'MP'],
    ['United States Virgin Islands', 'VI'],
]);

module.exports = {
    PUBLIC_DIR,
    OVERPASS_API_URL,
    MOBILE_TAGS,
    NON_MOBILE_TAGS,
    PHONE_TAGS,
    FAX_TAGS,
    ALL_NUMBER_TAGS,
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
    UNIVERSAL_SPLIT_CAPTURE_REGEX_DE,
    ALL_SEPARATOR_GROUPS,
    SEPARATOR_NEED_SPACE,
    SEPARATOR_OPTIONAL_SPACE,
    SEPARATOR_OPTIONAL_SPACE_DE,
    ICONS_DIR,
    GITHUB_API_BASE_URL,
    GITHUB_ICON_PACKS,
    ICON_ATTRIBUTION,
    HISTORY_DIR,
    SAFE_EDITS_DIR,
    PHONE_TAG_PREFERENCE_ORDER,
    EXTENSION_REGEX,
    DE_EXTENSION_REGEX,
    ACCEPTABLE_EXTENSION_FORMATS,
    CHANGESET_TAGS,
    AUTO_CHANGESET_TAGS,
    GITHUB_LINK,
    HOST_URL,
    NANP_COUNTRY_CODES,
    usTerritoryCodes,
    TOLL_FREE_AS_NATIONAL_COUNTRIES,
    NON_STANDARD_COST_TYPES,
    INVALID_SPACING_CHARACTERS_REGEX
};
