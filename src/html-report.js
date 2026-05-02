const fs = require('fs');
const { promises: fsPromises } = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { chain } = require('stream-chain');
const { parser } = require('stream-json/parser.js');
const { streamArray } = require('stream-json/streamers/stream-array.js');
const { disassembler } = require('stream-json/disassembler.js');
const { stringer } = require('stream-json/stringer.js');
const { Eta } = require('eta');
const { PUBLIC_DIR, OSM_EDITORS, ALL_EDITOR_IDS, DEFAULT_EDITORS_DESKTOP, DEFAULT_EDITORS_MOBILE, CHANGESET_TAGS, NAMES_BUILD_DIR, CHANGESET_COMMENTS } = require('./constants');
const { safeName, getFeatureTypeName, getFeatureIcon, isDisused } = require('./data-processor');
const { translate } = require('./i18n');
const { getDiffHtml, getDiffTagsHtml } = require('./diff-renderer');
const { favicon, themeButton, createFooter, createStatsBox, escapeHTML } = require('./html-utils');
const { IconManager } = require('./icon-manager');
const { phoneTagToUse } = require('./phone-processor');


/**
 * Creates the JOSM fix URL for a single invalid number item or null if it is not fixable.
 * @param {Object} item - The invalid number data item.
 * @returns {string | null}
*/
function createJosmFixUrl(item) {
    if (!item.autoFixable) {
        return null;
    }

    const josmFixBaseUrl = 'http://127.0.0.1:8111/load_object';
    const josmEditUrl = `${josmFixBaseUrl}?objects=${item.type[0]}${item.id}&relation_members=true`;

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

    return Object.keys(item.validForeignNumbers).map(key => {
        const foreignRows = [];
        for (const [phone, code] of Object.entries(item.validForeignNumbers[key])) {
            const flagHtml = iconManager.getIconHtml(`Flagpedia-${code.toLowerCase()}`);

            // Add title tag for country/region name
            const flagName = regionNames.of(code);

            const spanPrefix = '<span';
            const flagIconAndTitle = flagHtml.startsWith(spanPrefix)
                ? `${spanPrefix} title="${flagName}" ${flagHtml.slice(spanPrefix.length)}`
                : flagHtml;

            foreignRows.push(`<span class="inline-flex items-center">${flagIconAndTitle}${phone}</span>`)
        }

        return {
            [key]: foreignRows.join(';'),
        };
    }).filter(Boolean)
}

/**
 * Creates the fix rows for an invalid phone number item.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @param {IconManager} iconManager - The icon manager instance for this report.
 * @returns {Object}
 */
function createPhoneFixRows(item, locale, iconManager) {
    return Object.keys(item.invalidNumbers).map(key => {
        const originalNumber = item.invalidNumbers[key];
        const suggestedFix = item.suggestedFixes[key];
        const isDuplicateKey = key in item.duplicateNumbers;
        const isMismatchKey = key in item.mismatchTypeNumbers;
        const suggestedRowKey = translate('suggestedFix', locale);

        const duplicateLabel = isDuplicateKey ? `<span class="label label-number-problem">${translate("duplicateNumber", locale)}</span>` : '';
        const notMobileLabel = isMismatchKey ? `<span class="label label-number-problem">${translate("notMobileNumber", locale)}</span>` : '';
        const problemLabel = duplicateLabel + notMobileLabel;

        const tagToUse = item.phoneTagToUse;
        const numberMovingToEmptyTag = !(item.invalidNumbers.hasOwnProperty(tagToUse)) && (item.suggestedFixes.hasOwnProperty(tagToUse));

        // Internal duplicate (in same tag)
        if (isDuplicateKey && item.duplicateNumbers[key] == key) {
            const { oldDiff, newDiff } = getDiffHtml(originalNumber, suggestedFix);
            return {
                [key]: `<span class="list-item-old-value">${oldDiff}${duplicateLabel}</span>`,
                [suggestedRowKey]: newDiff
            };
        }

        if (suggestedFix) {
            const { oldDiff, newDiff } = getDiffHtml(originalNumber, suggestedFix);

            let originalRowValue;
            if (problemLabel) {
                originalRowValue = `<span class="list-item-old-value">${oldDiff}${problemLabel}</span>`;
            } else if (originalNumber) {
                originalRowValue = oldDiff;
            } else {
                // e.g. phone:mnemonic being added as new tag
                const { oldTagDiff, newTagDiff } = getDiffTagsHtml('', key);
                return {
                    [newTagDiff]: newDiff
                };
            }

            if (numberMovingToEmptyTag) {
                // Old tag exists (multiple numbers) and number/s is being removed from it, to an empty tag
                const { oldTagDiff, newTagDiff } = getDiffTagsHtml('', tagToUse);
                const { oldDiff: oldMovingDiff, newDiff: newMovingDiff } = getDiffHtml('', item.suggestedFixes[tagToUse]);
                return {
                    [key]: originalRowValue,
                    [suggestedRowKey]: newDiff,
                    [newTagDiff]: newMovingDiff
                };
            }

            return {
                [key]: originalRowValue,
                [suggestedRowKey]: newDiff
            };
        } else if (isDuplicateKey) {
            const { oldDiff } = getDiffHtml(originalNumber, suggestedFix);
            return {
                [key]: `<span class="list-item-old-value">${oldDiff}${duplicateLabel}</span>`
            }
        } else if (isMismatchKey && !numberMovingToEmptyTag) {
            const { oldDiff } = getDiffHtml(originalNumber, suggestedFix);
            return {
                [key]: `<span class="list-item-old-value">${oldDiff}${notMobileLabel}</span>`
            }
        } else if (item.autoFixable) {
            // Mobile is being moved to standard key, which did not exist before
            if (numberMovingToEmptyTag) {
                const { oldTagDiff, newTagDiff } = getDiffTagsHtml(key, tagToUse);
                const { oldDiff, newDiff } = getDiffHtml(originalNumber, item.suggestedFixes[tagToUse]);
                return {
                    [oldTagDiff]: `<span class="list-item-old-value">${oldDiff}${notMobileLabel}</span>`,
                    [newTagDiff]: newDiff
                }
            }
            return {
                [key]: `<span>${escapeHTML(originalNumber)}</span>`
            };
        } else {
            return {
                [key]: `<span>${escapeHTML(originalNumber)}</span>`
            };
        }
    }).filter(Boolean);
}

/**
 * Creates the fix rows for an invalid name item.
 * @param {Object} item - The invalid data item.
 * @param {string} locale - The locale for the text
 * @param {IconManager} iconManager - The icon manager instance for this report.
 * @returns {Object}
 */
function createNameFixRows(item, locale, iconManager) {
    return [{
        ...(item.name && { name: item.name }),
        ...item.nameTags
    }];
}

/**
 * Creates the items for client side injection, with extra content.
 * @param {'phone' | 'name'} reportType - The type of report being created.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @param {boolean} botEnabled - Whether or not the safe fix bot is enabled for this area
 * @param {IconManager} iconManager - The icon manager instance for this report.
 * @returns {Object}
 */
function createClientItems(reportType, item, locale, botEnabled, iconManager) {
    // Skip safe edit items if the bot is enabled here
    if (reportType === 'phone' && botEnabled && item.safeEdit) {
        return null;
    }

    item = { ...item, ...(reportType === 'phone' && { phoneTagToUse: phoneTagToUse(item.allTags) }) }

    item.featureTypeName = escapeHTML(getFeatureTypeName(item, locale));

    const iconName = getFeatureIcon(item, locale);
    const iconHtml = iconManager.getIconHtml(iconName);
    if (iconHtml.includes(iconName)) {
        item.iconName = iconName;
    } else {
        item.iconHtml = iconHtml;
    }

    item.disusedLabel = isDisused(item) ? `<span class="label label-disused">${translate('disused', locale)}</span>` : '';

    if (reportType === 'phone' && item.isForeignItem) {
        item.fixRows = createPhoneForeignFixRows(item, locale, iconManager);

        const { allTags, ...clientItem } = item;
        return clientItem;
    }

    item.fixRows = reportType === 'phone' ? createPhoneFixRows(item, locale, iconManager) : createNameFixRows(item, locale, iconManager);

    item.josmFixUrl = createJosmFixUrl(item);

    const { allTags, ...clientItem } = item;

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

function getSubdivisionRelativeFilePath(countryName, divisionSlug, subdivisionSlug) {
    const safeCountryName = safeName(countryName);
    const singleLevelDivision = safeCountryName === divisionSlug || divisionSlug === subdivisionSlug;
    const finalSubdivisionSlug = singleLevelDivision ? subdivisionSlug : path.join(divisionSlug, subdivisionSlug);
    const filePath = path.join(safeCountryName, finalSubdivisionSlug);
    return filePath
}

/**
 * Generates the HTML report for a single subdivision.
 * @param {'phone' | 'name'} reportType - The type of report being created.
 * @param {string} countryName
 * @param {Object} subdivisionStats - The subdivision statistics object.
 * @param {string} tmpFilePath - Filepath of the json file containing the invalid items.
 * @param {string} locale
 * @param {Object} translations
 * @param {boolean} botEnabled - Whether or not the safe fix bot is enabled for this area
 * @param {Date} timestamp - The timestamp of the data
 */
async function generateHtmlReport(reportType, countryName, subdivisionStats, tmpFilePath, locale, translations, botEnabled, timestamp) {
    const iconManager = new IconManager();

    const safeCountryName = safeName(countryName);
    const singleLevelDivision = safeCountryName === subdivisionStats.divisionSlug || subdivisionStats.divisionSlug === subdivisionStats.slug;
    const relativeFilePath = getSubdivisionRelativeFilePath(countryName, subdivisionStats.divisionSlug, subdivisionStats.slug);
    const htmlFilePath = reportType === 'name' ? `${path.join(NAMES_BUILD_DIR, relativeFilePath)}.html` : `${path.join(PUBLIC_DIR, relativeFilePath)}.html`;
    const dataFilePath = reportType === 'name' ? `${path.join(NAMES_BUILD_DIR, relativeFilePath)}.json` : `${path.join(PUBLIC_DIR, relativeFilePath)}.json`;

    const { totalCount, invalidCount, autoFixableCount } = subdivisionStats;

    const stringerOptions = { makeArray: true };

    const inputStream = fs.createReadStream(tmpFilePath);
    const outputStream = fs.createWriteStream(dataFilePath);

    const chainedStream = chain([
        parser(),
        streamArray(),
        new ItemTransformer(item => {
            const clientItem = createClientItems(reportType, item, locale, botEnabled, iconManager);
            return clientItem;
        }),
        disassembler(),
        stringer(stringerOptions)
    ]);

    try {
        await pipeline(
            inputStream,
            chainedStream,
            outputStream
        );
        console.debug(`Output data written to ${dataFilePath}`);
    } catch (err) {
        console.error('An error occurred during streaming:', err);
        throw err;
    }

    const svgSprite = iconManager.generateSvgSprite();

    const OSM_EDITORS_CLIENT = {};

    for (const editorId in OSM_EDITORS) {
        const editor = OSM_EDITORS[editorId];
        const onClickString = editor.onClick ? editor.onClick(editorId) : undefined;

        OSM_EDITORS_CLIENT[editorId] = {
            getEditLink: editor.getEditLink,
            onClick: onClickString,
            // Pre-evaluate the string using the locale
            editInString: editor.editInString(locale)
        };
    }

    const clientOsmEditorsScript = `
        const OSM_EDITORS = ${JSON.stringify(OSM_EDITORS_CLIENT, (key, value) => {
        // Use a custom replacer function to handle functions (convert them to strings)
        if (typeof value === 'function') {
            // Converts the function back to a string so it can be re-evaluated client-side
            const functionString = value.toString();
            let cleanedString = functionString.replace(/[\n\t\r]/g, ' ');
            cleanedString = cleanedString.replace(/ {2,}/g, ' ');
            cleanedString = cleanedString.trim();
            return cleanedString;
        }
        return value;
    }, 4)};
    `;

    const eta = new Eta({
        views: path.join(process.cwd(), "src", "templates"),
        cache: true,
    });

    const templateData = {
        reportType,
        locale,
        subdivisionStats,
        translate,
        escapeHTML,
        createStatsBox,
        createFooter,
        favicon,
        singleLevelDivision,
        svgSprite,
        themeButton,
        totalCount,
        invalidCount,
        autoFixableCount,
        translations,
        timestamp,
        ALL_EDITOR_IDS,
        DEFAULT_EDITORS_DESKTOP,
        DEFAULT_EDITORS_MOBILE,
        CHANGESET_TAGS,
        CHANGESET_COMMENTS,
        clientOsmEditorsScript
    };

    const htmlContent = eta.render("./report", templateData);

    await fsPromises.writeFile(htmlFilePath, htmlContent);
    console.log(`Generated report for ${subdivisionStats.name} at ${htmlFilePath}`);
}

module.exports = {
    generateHtmlReport,
    createJosmFixUrl,
    getSubdivisionRelativeFilePath,
};
