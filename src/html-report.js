import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { minify } from 'html-minifier-terser';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { chain } from 'stream-chain';
import pkgParser from 'stream-json/parser.js';
const { parser } = pkgParser;
import pkgStreamArray from 'stream-json/streamers/stream-array.js';
const { streamArray } = pkgStreamArray;
import pkgDisassembler from 'stream-json/disassembler.js';
const { disassembler } = pkgDisassembler;
import pkgStringer from 'stream-json/stringer.js';
const { stringer } = pkgStringer;
import { Eta } from 'eta';
import {
    ALL_EDITOR_IDS,
    DEFAULT_EDITORS_DESKTOP,
    DEFAULT_EDITORS_MOBILE,
    CHANGESET_TAGS,
    GITHUB_LINK,
    OPENING_HOURS_EVALUATION_TOOL_URL,
    MINIFY_OPTIONS,
    IS_TEST_MODE,
    BUILD_DIR,
    UNIVERSAL_SPLIT_CAPTURE_REGEX,
} from './constants.js';
import { safeName, getFeatureTypeName, getFeatureIcon, isDisused } from './data-processor.js';
import { getBestPreset } from './preset-matcher.js';
import { translate } from './i18n.js';
import { getPhoneDiffHtml, getDiffTagsHtml, getHoursDiffHtml } from './diff-renderer.js';
import { createStatsBox, escapeHTML, getFooterData, getIconAttributionHtml } from './html-utils.js';
import { IconManager } from './icon-manager.js';
import { validatePhoneNumberLength } from 'libphonenumber-js/max';
import { phoneTagToUse } from './phone-utils.js';

/**
 * Creates the JOSM fix URL for a single invalid number item or null if it is not fixable.
 * @param {Object} item - The invalid number data item.
 * @returns {string | null}
 */
export function createJosmFixUrl(item) {
    if (!item.autoFixable) {
        return null;
    }

    const josmFixBaseUrl = 'http://127.0.0.1:8111/load_object';
    const josmEditUrl = `${josmFixBaseUrl}?objects=${encodeURIComponent(item.type[0])}${encodeURIComponent(item.id)}&relation_members=true`;

    const encodedTags = Object.entries(item.suggestedFixes).map(([key, value]) => {
        const encodedKey = encodeURIComponent(key);
        const encodedValue = value ? encodeURIComponent(value) : ''; // null value should lead to tag being removed
        return `${encodedKey}=${encodedValue}`;
    });

    const addtagsValue = encodedTags.join(encodeURIComponent('|'));
    const josmFixUrl = `${josmEditUrl}&addtags=${addtagsValue}`;

    return josmFixUrl;
}

/**
 * Creates the fix rows for a phone number item that is showing foreign numbers.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @param {IconManager} iconManager - The icon manager instance for this report.
 * @returns {Object}
 */
function createPhoneForeignFixRows(item, locale, iconManager) {
    // validForeignNumbers: { phone: { '+44 20 7946 0000': 'GB' } },

    const regionNames = new Intl.DisplayNames([locale], { type: 'region' });

    return Object.keys(item.validForeignNumbers)
        .map(key => {
            const foreignRows = [];
            for (const [phone, code] of Object.entries(item.validForeignNumbers[key])) {
                const flagHtml = iconManager.getIconHtml(`Flagpedia-${code.toLowerCase()}`);

                // Add title tag for country/region name
                const flagName = regionNames.of(code);

                const spanPrefix = '<span';
                const flagIconAndTitle = flagHtml.startsWith(spanPrefix)
                    ? `${spanPrefix} title="${escapeHTML(flagName)}" ${flagHtml.slice(spanPrefix.length)}`
                    : flagHtml;

                foreignRows.push(
                    `<span class="inline-flex items-center">${flagIconAndTitle}${escapeHTML(phone)}</span>`
                );
            }

            return {
                [key]: foreignRows.join(';'),
            };
        })
        .filter(Boolean);
}

/**
 * Gets the appropriate translated text for a length issue with a phone number.
 * @param {String} lengthResult - The result from validatePhoneNumberLength.
 * @param {string} locale - The locale for the text.
 * @param {string} countryCode - The country code to parse the phone number against.
 * @returns {String}
 */
export function getLengthProblemText(originalNumber, locale, countryCode) {
    if (originalNumber.match(UNIVERSAL_SPLIT_CAPTURE_REGEX)) return '';
    try {
        const lengthResult = validatePhoneNumberLength(originalNumber, countryCode);
        switch (lengthResult) {
            case 'TOO_SHORT':
                return translate('tooShort', locale);
            case 'TOO_LONG':
                return translate('tooLong', locale);
            case 'INVALID_COUNTRY':
                return translate('invalidCountry', locale);
            case 'INVALID_LENGTH':
                return translate('invalidLength', locale);
            case 'NOT_A_NUMBER':
                return translate('notNumber', locale);
            default:
                return '';
        }
    } catch {
        // parsing failed
        return '';
    }
}

/**
 * Creates the fix rows for an invalid phone number item.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text.
 * @param {string} countryCode - The country code for the item.
 * @returns {Object}
 */
export function createPhoneFixRows(item, locale, countryCode) {
    return Object.keys(item.invalidNumbers)
        .map(key => {
            const originalNumber = item.invalidNumbers[key];
            const suggestedFix = item.suggestedFixes[key];
            const isDuplicateKey = key in item.duplicateNumbers;
            const isMismatchKey = key in item.mismatchTypeNumbers;
            const suggestedRowKey = translate('suggestedFix', locale);

            const duplicateLabel = isDuplicateKey
                ? `<span class="label label-number-problem">${translate('duplicateNumber', locale)}</span>`
                : '';
            const notMobileLabel = isMismatchKey
                ? `<span class="label label-number-problem">${translate('notMobileNumber', locale)}</span>`
                : '';
            const problemLabel = duplicateLabel + notMobileLabel;

            const tagToUse = item.phoneTagToUse;
            const numberMovingToEmptyTag =
                !Object.hasOwn(item.invalidNumbers, tagToUse) && Object.hasOwn(item.suggestedFixes, tagToUse);

            // Internal duplicate (in same tag)
            if (isDuplicateKey && item.duplicateNumbers[key] === key) {
                const { oldDiff, newDiff } = getPhoneDiffHtml(originalNumber, suggestedFix);
                return {
                    [key]: `<span class="list-item-old-value">${oldDiff}${duplicateLabel}</span>`,
                    [suggestedRowKey]: newDiff,
                };
            }

            if (suggestedFix) {
                const { oldDiff, newDiff } = getPhoneDiffHtml(originalNumber, suggestedFix);

                let originalRowValue;
                if (problemLabel) {
                    originalRowValue = `<span class="list-item-old-value">${oldDiff}${problemLabel}</span>`;
                } else if (originalNumber) {
                    originalRowValue = oldDiff;
                } else {
                    // e.g. phone:mnemonic being added as new tag
                    const { newTagDiff } = getDiffTagsHtml('', key);
                    return {
                        [newTagDiff]: newDiff,
                    };
                }

                if (numberMovingToEmptyTag) {
                    // Old tag exists (multiple numbers) and number/s is being removed from it, to an empty tag
                    const { newTagDiff } = getDiffTagsHtml('', tagToUse);
                    const { newDiff: newMovingDiff } = getPhoneDiffHtml('', item.suggestedFixes[tagToUse]);
                    return {
                        [key]: originalRowValue,
                        [suggestedRowKey]: newDiff,
                        [newTagDiff]: newMovingDiff,
                    };
                }

                return {
                    [key]: originalRowValue,
                    [suggestedRowKey]: newDiff,
                };
            } else if (isDuplicateKey) {
                const { oldDiff } = getPhoneDiffHtml(originalNumber, suggestedFix);
                return {
                    [key]: `<span class="list-item-old-value">${oldDiff}${duplicateLabel}</span>`,
                };
            } else if (isMismatchKey && !numberMovingToEmptyTag) {
                const { oldDiff } = getPhoneDiffHtml(originalNumber, suggestedFix);
                return {
                    [key]: `<span class="list-item-old-value">${oldDiff}${notMobileLabel}</span>`,
                };
            } else if (item.autoFixable) {
                // Mobile is being moved to standard key, which did not exist before
                if (numberMovingToEmptyTag) {
                    const { oldTagDiff, newTagDiff } = getDiffTagsHtml(key, tagToUse);
                    const { oldDiff, newDiff } = getPhoneDiffHtml(originalNumber, item.suggestedFixes[tagToUse]);
                    return {
                        [oldTagDiff]: `<span class="list-item-old-value">${oldDiff}${notMobileLabel}</span>`,
                        [newTagDiff]: newDiff,
                    };
                }
                return {
                    [key]: `<span>${escapeHTML(originalNumber)}</span>`,
                };
            } else {
                const lengthProblemText = getLengthProblemText(originalNumber, locale, countryCode);
                const lengthProblemLabel = lengthProblemText
                    ? `<span class="label label-number-problem">${lengthProblemText}</span>`
                    : '';
                return {
                    [key]: `<span>${escapeHTML(originalNumber)}${lengthProblemLabel}</span>`,
                };
            }
        })
        .filter(Boolean);
}

/**
 * Creates the fix rows for an invalid name item.
 * @param {Object} item - The invalid data item.
 * @param {string} _locale - The locale for the text
 * @returns {Object}
 */
function createNameFixRows(item, _locale) {
    const escapedNameTags = Object.fromEntries(
        Object.entries(item.nameTags).map(([key, value]) => [key, escapeHTML(value)])
    );
    return [
        {
            ...(item.name && { name: escapeHTML(item.name) }),
            ...escapedNameTags,
        },
    ];
}

/**
 * Creates the fix rows for an invalid opening hours item.
 * @param {Object} item - The invalid data item.
 * @param {string} locale - The locale for the text
 * @returns {Object}
 */
function createHoursFixRows(item, locale) {
    return Object.keys(item.invalidHours)
        .map(key => {
            const originalValue = item.invalidHours[key];
            const suggestedFix = item.suggestedFixes[key];
            const suggestedRowKey = translate('suggestedFix', locale);

            const disconnectedLabel = item.disconnected[key]
                ? `<span class="label label-number-problem">${translate('overlappingRules', locale)}</span>`
                : '';
            const ambiguousLabel = item.ambiguous[key]
                ? `<span class="label label-number-problem">${translate('ambiguousHours', locale)}</span>`
                : '';
            const noDaysLabel = item.noDays[key]
                ? `<span class="label label-number-problem">${translate('noDays', locale)}</span>`
                : '';
            const problemLabel = disconnectedLabel + ambiguousLabel + noDaysLabel;

            if (suggestedFix) {
                const { oldDiff, newDiff } = getHoursDiffHtml(originalValue, suggestedFix);

                const newRow = problemLabel
                    ? `<span class="list-item-old-value">${newDiff}${problemLabel}</span>`
                    : newDiff;

                return {
                    [key]: oldDiff,
                    [suggestedRowKey]: newRow,
                };
            } else {
                const originalRow = problemLabel
                    ? `<span class="list-item-old-value">${escapeHTML(originalValue)}${problemLabel}</span>`
                    : escapeHTML(originalValue);

                return {
                    [key]: originalRow,
                };
            }
        })
        .filter(Boolean);
}

/**
 * Creates the items for client side injection, with extra content.
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report being created.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @param {string} countryCode - The country code for the item
 * @param {boolean} botEnabled - Whether or not the safe fix bot is enabled for this area
 * @param {IconManager} iconManager - The icon manager instance for this report.
 * @returns {Object}
 */
function createClientItems(reportType, item, locale, countryCode, botEnabled, iconManager) {
    // Skip safe edit items if the bot is enabled here
    if (reportType === 'phone' && botEnabled && item.safeEdit) {
        return null;
    }

    item = { ...item, ...(reportType === 'phone' && { phoneTagToUse: phoneTagToUse(item.allTags) }) };

    const preset = getBestPreset(item, locale);
    item.featureTypeName = escapeHTML(getFeatureTypeName(item, locale, preset));

    const iconName = getFeatureIcon(item, locale, preset);
    const iconHtml = iconManager.getIconHtml(iconName);
    if (iconHtml.includes(iconName)) {
        item.iconName = iconName;
    } else {
        item.iconHtml = iconHtml;
    }

    item.disusedLabel = isDisused(item)
        ? `<span class="label label-disused">${translate('disused', locale)}</span>`
        : '';

    if (reportType === 'phone' && item.isForeignItem) {
        item.fixRows = createPhoneForeignFixRows(item, locale, iconManager);

        const clientItem = { ...item };
        delete clientItem.allTags;
        return clientItem;
    }

    const fixRowsFunctions = {
        phone: createPhoneFixRows,
        name: createNameFixRows,
        hours: createHoursFixRows,
    };

    const fixer = fixRowsFunctions[reportType];
    if (!fixer) throw new Error(`Unsupported report type: ${reportType}`);

    item.fixRows = fixer(item, locale, countryCode);

    item.josmFixUrl = createJosmFixUrl(item);

    const clientItem = { ...item };
    delete clientItem.allTags;

    return clientItem;
}

/**
 * @typedef {Object} StreamedItem
 * @property {number} key - The index of the item within the source array.
 * @property {Object} value - The actual JavaScript object being streamed.
 * @property {string[]} path - The JSON path to the item.
 */

/**
 * Custom Node.js Transform stream designed to process individual JavaScript
 * objects streamed from a large JSON array.
 *
 * This stream operates in object mode for both input and output, ensuring
 * only single JavaScript objects are held in memory at any given time,
 * maintaining memory efficiency.
 * @extends {Transform}
 */
class ItemTransformer extends Transform {
    /**
     * Creates an instance of ItemTransformer.
     *
     * @param {function(Object): Object} transformFn - The synchronous function to apply to each streamed object's value.
     * It receives the raw object and must return the processed object.
     * @param {import('stream').TransformOptions} [options] - Optional stream options passed to the base Transform constructor.
     */
    constructor(transformFn, options) {
        super({ ...options, objectMode: true });
        this.transformFn = transformFn;
    }

    /**
     * Internal method called by the streaming mechanism to process each chunk of data.
     *
     * @param {StreamedItem} chunk - A chunk containing the item details (key and value) from the upstream streamArray.
     * @param {string} encoding - The encoding of the chunk (ignored in object mode).
     * @param {function(Error | null): void} callback - Callback function to signal completion or an error for the current chunk.
     * @private
     */
    _transform(chunk, encoding, callback) {
        try {
            const result = this.transformFn(chunk.value);
            // Only push if result is not null/undefined
            if (result !== null && result !== undefined) {
                this.push(result);
            }
            callback();
        } catch (error) {
            callback(error);
        }
    }
}

export function getSubdivisionRelativeFilePath(countryName, divisionSlug, subdivisionSlug) {
    const safeCountryName = safeName(countryName);
    const singleLevelDivision = safeCountryName === divisionSlug || divisionSlug === subdivisionSlug;
    const finalSubdivisionSlug = singleLevelDivision ? subdivisionSlug : path.join(divisionSlug, subdivisionSlug);
    const filePath = path.join(safeCountryName, finalSubdivisionSlug);
    return filePath;
}

/**
 * Generates the HTML report for a single subdivision.
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report being created.
 * @param {string} countryData
 * @param {Object} subdivisionStats - The subdivision statistics object.
 * @param {string} tmpFilePath - Filepath of the json file containing the invalid items.
 * @param {Object} translations
 * @param {boolean} botEnabled - Whether or not the safe fix bot is enabled for this area
 * @param {Date} timestamp - The timestamp of the data
 */
export async function generateHtmlReport(
    reportType,
    countryData,
    subdivisionStats,
    tmpFilePath,
    translations,
    botEnabled,
    timestamp,
    regionCode
) {
    const countryName = countryData.name;
    const locale = countryData.locale;
    const officialLanguages = countryData.divisionLanguages[regionCode] ?? countryData.officialLanguages;

    const iconManager = new IconManager();

    const safeCountryName = safeName(countryName);
    const singleLevelDivision =
        safeCountryName === subdivisionStats.divisionSlug || subdivisionStats.divisionSlug === subdivisionStats.slug;
    const relativeFilePath = getSubdivisionRelativeFilePath(
        countryName,
        subdivisionStats.divisionSlug,
        subdivisionStats.slug
    );
    const htmlFilePath = `${path.join(BUILD_DIR, reportType, relativeFilePath)}.html`;
    const dataFilePath = `${path.join(BUILD_DIR, reportType, relativeFilePath)}.json`;

    const stringerOptions = { makeArray: true };

    const inputStream = fs.createReadStream(tmpFilePath);
    const outputStream = fs.createWriteStream(dataFilePath);

    const chainedStream = chain([
        parser(),
        streamArray(),
        new ItemTransformer(item => {
            const clientItem = createClientItems(
                reportType,
                item,
                locale,
                countryData.countryCode,
                botEnabled,
                iconManager
            );
            return clientItem;
        }),
        disassembler(),
        stringer(stringerOptions),
    ]);

    try {
        await pipeline(inputStream, chainedStream, outputStream);
        console.debug(`Output data written to ${dataFilePath}`);
    } catch (err) {
        console.error('An error occurred during streaming:', err);
        throw err;
    }

    const svgSprite = iconManager.generateSvgSprite();

    const reportConfig = {
        reportType,
        locale,
        translations,
        subdivisionName: subdivisionStats.name,
        dataFilePath: `./${subdivisionStats.slug}.json`,
        dataLastUpdated: subdivisionStats.lastUpdated,
        openingHoursEvaluationToolUrl: OPENING_HOURS_EVALUATION_TOOL_URL,
        changesetTags: CHANGESET_TAGS[reportType],
        officialLanguages,
        allEditorIds: ALL_EDITOR_IDS,
        defaultEditorsDesktop: DEFAULT_EDITORS_DESKTOP,
        defaultEditorsMobile: DEFAULT_EDITORS_MOBILE,
        githubLink: GITHUB_LINK,
    };

    const eta = new Eta({
        views: path.join(process.cwd(), 'src', 'templates'),
        cache: true,
    });

    const templateData = {
        reportType,
        locale,
        subdivisionStats,
        translate,
        escapeHTML,
        createStatsBox,
        getFooterData,
        getIconAttributionHtml,
        GITHUB_LINK,
        singleLevelDivision,
        svgSprite,
        translations,
        timestamp,
        reportConfig,
    };

    const htmlContent = eta.render('report', templateData);

    let finalHtml = htmlContent;

    if (!IS_TEST_MODE) {
        try {
            finalHtml = await minify(htmlContent, MINIFY_OPTIONS);
        } catch (err) {
            console.error(`Minification failed for ${htmlFilePath}:`, err);
            // Fallback to unminified content
        }
    }

    await fsPromises.writeFile(htmlFilePath, finalHtml);
    console.log(`Generated report for ${subdivisionStats.name} at ${htmlFilePath}`);
}
