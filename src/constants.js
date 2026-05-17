import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { translate } from './i18n.js';
import { validateNumbers } from './phone-processor.js';
import { validateNames } from './names-processor.js';
import { validateOpeningHours } from './opening-hours-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

export const REPORT_TYPES = ['phone', 'name', 'hours'];

export const BUILD_DIR = {
    phone: path.join(__dirname, '..', 'public'),
    name: path.join(__dirname, '..', 'names_build'),
    hours: path.join(__dirname, '..', 'hours_build'),
};

export const COUNT_TYPES = {
    phone: ['invalidCount', 'autoFixableCount', 'foreignCount', 'safeEditCount', 'totalCount'],
    name: ['invalidCount', 'missingNamesCount', 'totalCount'],
    hours: ['invalidCount', 'autoFixableCount', 'totalCount'],
};

export const VALIDATORS = {
    phone: validateNumbers,
    name: validateNames,
    hours: validateOpeningHours,
};

export const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export const MOBILE_TAGS = ['mobile', 'contact:mobile', 'phone:mobile'];
export const NON_MOBILE_TAGS = ['phone', 'contact:phone'];
export const PHONE_TAGS = [...MOBILE_TAGS, ...NON_MOBILE_TAGS];
export const FAX_TAGS = ['fax', 'contact:fax'];
export const OTHER_TAGS = ['contact:whatsapp'];
export const ALL_NUMBER_TAGS = [...PHONE_TAGS, ...FAX_TAGS, ...OTHER_TAGS];

export const HOURS_POINT_OR_RANGE_TAGS = ['collection_times', 'service_times'];
export const HOURS_RANGE_TAGS = [
    'opening_hours',
    'opening_hours:atm',
    'opening_hours:bar',
    'opening_hours:delivery',
    'opening_hours:drive_through',
    'opening_hours:kitchen',
    'opening_hours:lifeguard',
    'opening_hours:office',
    'opening_hours:pharmacy',
    'opening_hours:reception',
    'opening_hours:self_service',
    'opening_hours:store',
    'opening_hours:workshop',
    'happy_hours',
];
export const ALL_HOURS_TAGS = [...HOURS_POINT_OR_RANGE_TAGS, ...HOURS_RANGE_TAGS];

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
export const PHONE_TAG_PREFERENCE_ORDER = {
    phone: 0,
    'contact:phone': 1,
    mobile: 2,
    'contact:mobile': 3,
    'phone:mobile': 4,
    fax: 5,
    'contact:fax': 6,
};

export const WEBSITE_TAGS = ['website', 'contact:website'];

export const COUNTRIES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'countries.json'), 'utf8'));

// Order matters: first found one is preferred
// These are only used if the element has no name
export const FEATURE_TAGS = [
    'amenity',
    'shop',
    'tourism',
    'leisure',
    'emergency',
    'building',
    'craft',
    'aeroway',
    'railway',
    'healthcare',
    'highway',
    'military',
    'man_made',
    'public_transport',
    'landuse',
    'natural',
    'barrier',
    'historic',
];

export const HISTORIC_AND_DISUSED_PREFIXES = ['disused', 'historic', 'was', 'abandoned'];

export const OSM_EDITORS = {
    JOSM: {
        getEditLink: function (item) {
            const baseUrl = 'http://127.0.0.1:8111/load_object';
            return `${baseUrl}?objects=${item.type[0]}${item.id}&relation_members=true`;
        },
        editInString: locale => translate('editIn', locale, ['JOSM']),
        onClick: function (editorId) {
            return `openInJosm(OSM_EDITORS['${editorId}'].getEditLink(item), event)`;
        },
    },
    iD: {
        getEditLink: function (item) {
            const baseUrl = 'https://www.openstreetmap.org/edit?editor=id';
            return `${baseUrl}&${item.type}=${item.id}#map=19/${item.lat}/${item.lon}`;
        },
        editInString: locale => translate('editIn', locale, ['iD']),
    },
    Rapid: {
        getEditLink: function (item) {
            const baseUrl = 'https://rapideditor.org/edit#map=19';
            return `${baseUrl}/${item.lat}/${item.lon}&id=${item.type[0]}${item.id}`;
        },
        editInString: locale => translate('editIn', locale, ['Rapid']),
    },
    Level0: {
        getEditLink: function (item) {
            const baseUrl = 'https://level0.osmz.ru/?url=';
            return `${baseUrl}${item.type}/${item.id}`;
        },
        editInString: locale => translate('editIn', locale, ['Level0']),
    },
    Geo: {
        getEditLink: function (item) {
            const baseUrl = 'geo:';
            return `${baseUrl}${item.lat},${item.lon}`;
        },
        editInString: locale => translate('openLocation', locale),
    },
};

export const ALL_EDITOR_IDS = Object.keys(OSM_EDITORS);

export const DEFAULT_EDITORS_DESKTOP = ['JOSM'];
export const DEFAULT_EDITORS_MOBILE = ['Geo', 'Level0'];

export const EXCLUSIONS = {
    DE: {
        115: {
            office: 'government',
        },
    },
    FR: {
        // France
        3631: {
            // The phone number to check (must be the core number, no country code or spaces)
            amenity: 'post_office',
        },
    },
};

// Regex matches common extension prefixes:
// EN: x, ext, extension
// FR/CA: poste
// PL: wew, wewn
// It captures each of everything before the extension marker and everything after
// strings are lowercased before checking against this
export const EXTENSION_REGEX = /^(.*?)(\s*\(?(?:x|ext\.?|extension|poste|wewn?\.?)\s*)(\d*)\)?$/;
export const ACCEPTABLE_EXTENSION_FORMATS = [' ext. ', ' x', 'x'];

export const DIN_FORMAT_COUNTRIES = ['AT', 'DE'];

// DIN format has hyphen then extension
export const DIN_EXTENSION_REGEX = /^(.*?)(\s*[-−‐‑‒–—]\s*)([^-]+)$/;

export const TOLL_FREE_AS_NATIONAL_COUNTRIES = [
    'DE', // https://community.openstreetmap.org/t/telefonnummer-nebenstelle-kennzeichnen-phonenumbervalidator/137711/19
    'FR', // https://github.com/confusedbuffalo/phone-report/issues/18
    'IE', // https://community.openstreetmap.org/t/validating-phone-numbers-in-ireland/143173/4
    'IT', // https://github.com/confusedbuffalo/phone-report/issues/217
    'NL', // https://github.com/confusedbuffalo/phone-report/issues/315
    'NZ', // https://community.openstreetmap.org/t/nz-check-and-fix-nz-phone-numbers/143168/4
];

export const NON_STANDARD_COST_TYPES = ['TOLL_FREE', 'SHARED_COST', 'PREMIUM_RATE'];

// This regex is used for splitting by data-processor.js. It catches ALL valid and invalid separators:
const goodSeparator = [';'];
const badSeparatorOptionalSpace = [',', '/', '|'];

export const SEPARATOR_OPTIONAL_SPACE = [...goodSeparator, ...badSeparatorOptionalSpace];
export const SEPARATOR_OPTIONAL_SPACE_DIN = [';', ',', '|'];
export const SEPARATOR_NEED_SPACE = ['or', 'and', 'oder', 'y', 'ou'];

const escapeRegex = string => {
    return string.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
};

export const spaceOptionalGroups = SEPARATOR_OPTIONAL_SPACE.map(sep => {
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

export const spaceOptionalGroupsDin = SEPARATOR_OPTIONAL_SPACE_DIN.map(sep => {
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

export const needSpacesGroups = SEPARATOR_NEED_SPACE.map(sep => {
    const escapedSep = escapeRegex(sep);
    return `(\\s+${escapedSep}\\s+)`;
}).join('|');

const badSeparatorOptionalSpaceGroups = badSeparatorOptionalSpace
    .map(sep => {
        const escapedSep = escapeRegex(sep);
        return `(\\s*${escapedSep}\\s*)`;
    })
    .join('|');

export const BAD_SEPARATOR_REGEX = new RegExp(`${badSeparatorOptionalSpaceGroups}|${needSpacesGroups}`, 'gi');

export const ALL_SEPARATOR_GROUPS = `${spaceOptionalGroups}|${needSpacesGroups}`;
const allGroupsDe = `${spaceOptionalGroupsDin}|${needSpacesGroups}`;

const CAPTURING_GROUP_TO_NON_CAPTURING_REGEX = /\((?!\?)(.*?)\)/g;

// Includes capturing groups to get the separators back
// When used in diff, the groups need to be capturing
export const UNIVERSAL_SPLIT_CAPTURE_REGEX = new RegExp(ALL_SEPARATOR_GROUPS, 'gi');
export const UNIVERSAL_SPLIT_CAPTURE_REGEX_DIN = new RegExp(allGroupsDe, 'gi');

export const UNIVERSAL_SPLIT_REGEX = new RegExp(
    ALL_SEPARATOR_GROUPS.replace(CAPTURING_GROUP_TO_NON_CAPTURING_REGEX, '(?:$1)'),
    'gi'
);
export const UNIVERSAL_SPLIT_REGEX_DIN = new RegExp(
    allGroupsDe.replace(CAPTURING_GROUP_TO_NON_CAPTURING_REGEX, '(?:$1)'),
    'gi'
);

// Characters that libphonenumbers does not parse but may be used instead of spaces
// Includes all other spacing characters, such as thin space
// also directional isolates
export const INVALID_SPACING_CHARACTERS_REGEX = /_|·|~|•|\u2068|\u2069|[\u202A-\u202E]|(?![ ])\s/g;

// TW: tilde is used for denoting an extension
export const INVALID_SPACING_CHARACTERS_REGEX_TW = /_|·|•|\u2068|\u2069|[\u202A-\u202E]|(?![ ])\s/g;

export const ICON_ATTRIBUTION = [
    {
        name: 'Font Awesome Icons',
        license: '(CC BY 4.0)',
        license_link: 'https://github.com/FortAwesome/Font-Awesome/blob/7.x/LICENSE.txt',
        link: 'https://fontawesome.com',
    },
    {
        name: 'Maki Icons',
        license: '(CC0 1.0)',
        license_link: 'https://creativecommons.org/publicdomain/zero/1.0/',
        link: 'https://github.com/mapbox/maki',
    },
    {
        name: 'Temaki icons',
        license: '(CC0 1.0)',
        license_link: 'https://creativecommons.org/publicdomain/zero/1.0/',
        link: 'https://github.com/rapideditor/temaki',
    },
    {
        name: 'Röntgen icons',
        attribution: 'by Sergey Vartanov',
        license: '(CC BY 4.0)',
        license_link: 'https://creativecommons.org/licenses/by/4.0/',
        link: 'https://github.com/enzet/Roentgen',
    },
    {
        name: 'iD icons',
        attribution: 'Copyright (c) 2017, iD Contributors',
        license: 'ISC License',
        license_link: 'https://github.com/openstreetmap/iD/blob/develop/LICENSE.md',
        link: 'https://github.com/openstreetmap/iD/tree/develop/svg/iD-sprite',
    },
    {
        name: 'Flag icons',
        license: 'Public Domain',
        link: 'https://flagpedia.net',
    },
];

export const GITHUB_ICON_PACKS = {
    roentgen: {
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
        output_sub_dir: 'iD', // same as presets, shouldn't be any filename clashes though
    },
};

export const ICONS_DIR = path.join(__dirname, '..', 'icons');
export const GITHUB_API_BASE_URL = 'https://api.github.com/repos';

export const HISTORY_DIR = path.join(__dirname, '..', 'history');
export const SAFE_EDITS_DIR = path.join(__dirname, '..', 'safe_edits');
export const POLY_DIR = path.join(__dirname, '..', 'poly');
export const OSM_DIR = path.join(__dirname, '..', 'osm');

export const GITHUB_LINK = 'https://github.com/confusedbuffalo/phone-report/';
export const HOST_URL = {
    phone: 'https://confusedbuffalo.github.io/phone-report/',
    name: 'https://names-report.pages.dev/',
    hours: 'https://opening-hours-report.pages.dev/',
};

const PACKAGE_NAME = packageInfo.name;
const PACKAGE_VERSION = packageInfo.version;
const PACKAGE_STRING = `${PACKAGE_NAME}/${PACKAGE_VERSION}`;

export const CHANGESET_TAGS = {
    phone: {
        comment:
            'Fix phone number issues: missing country code, incorrect separators, extra characters, duplicate phone numbers',
        created_by: PACKAGE_STRING,
        host: HOST_URL.phone,
    },
    name: {
        comment: 'Fix incomplete multilingual names: no multilingual name matching name tag or no name tag',
        created_by: PACKAGE_STRING,
        host: HOST_URL.name,
    },
    hours: {
        comment: 'Fix opening hours issues',
        created_by: PACKAGE_STRING,
        host: HOST_URL.name,
    },
};

export const AUTO_CHANGESET_TAGS = {
    comment: 'Automatically fix phone number issues: missing country code, extra punctuation',
    created_by: PACKAGE_STRING,
    bot: 'yes',
    automatic: 'yes',
    source_code: GITHUB_LINK,
    osm_wiki_documentation_page:
        'https://wiki.openstreetmap.org/wiki/Automated_edits/confusedbuffalo/Fix_basic_phone_number_issues',
};

export const NANP_COUNTRY_CODES = [
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

export const CAN_ADD_COUNTRY_CODE_TO_INCORRECT_LEADING_PLUS = [
    ...NANP_COUNTRY_CODES,
    'BL',
    'GB',
    'GF',
    'GP',
    'MF',
    'MQ',
    'RE',
    'YT',
    'ZA',
];
export const INCORRECT_PLUS_CAN_START_WITH_COUNTRY_CODE = ['BL', 'GF', 'GP', 'MF', 'MQ', 'RE', 'YT'];

export const COUNTRIES_WITH_PHONEWORDS = [...NANP_COUNTRY_CODES, 'AU', 'NZ', 'SG'];

export const CAN_REFORMAT_NUMBER_WITHOUT_SPACES = [
    'MA', // https://github.com/confusedbuffalo/phone-report/issues/234#issuecomment-4230467314
];

const BUILD_TYPE = process.env.BUILD_TYPE;
export const IS_TEST_MODE =
    BUILD_TYPE === 'simplified' || process.env.NODE_ENV === 'test' || typeof jest !== 'undefined';

export const MINIFY_OPTIONS = {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
};
