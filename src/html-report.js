const fs = require('fs');
const { promises: fsPromises } = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { chain } = require('stream-chain');
const { parser } = require('stream-json/Parser');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { disassembler } = require('stream-json/Disassembler');
const { stringer } = require('stream-json/Stringer');
const { PUBLIC_DIR, OSM_EDITORS, ALL_EDITOR_IDS, DEFAULT_EDITORS_DESKTOP, DEFAULT_EDITORS_MOBILE, CHANGESET_TAGS } = require('./constants');
const { safeName, getFeatureTypeName, getFeatureIcon, isDisused, phoneTagToUse } = require('./data-processor');
const { translate } = require('./i18n');
const { getDiffHtml, getDiffTagsHtml } = require('./diff-renderer');
const { favicon, themeButton, createFooter, createStatsBox, escapeHTML } = require('./html-utils');
const { IconManager } = require('./icon-manager');


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
    const josmEditUrl = `${josmFixBaseUrl}?objects=${item.type[0]}${item.id}`;

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
 * Creates the items for client side injection, with extra content.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @param {boolean} botEnabled - Whether or not the safe fix bot is enabled for this area
 * @param {IconManager} iconManager - The icon manager instance for this report.
 * @returns {string}
 */
function createClientItems(item, locale, botEnabled, iconManager) {
    // Skip safe edit items if the bot is enabled here
    if (botEnabled && item.safeEdit) {
        return null;
    }

    item.phoneTagToUse = phoneTagToUse(item.allTags);
    item.featureTypeName = escapeHTML(getFeatureTypeName(item, locale));

    const iconName = getFeatureIcon(item, locale);
    const iconHtml = iconManager.getIconHtml(iconName);
    if (iconHtml.includes(iconName)) {
        item.iconName = iconName;
    } else {
        item.iconHtml = iconHtml;
    }

    item.disusedLabel = isDisused(item) ? `<span class="label label-disused">${translate('disused', locale)}</span>` : '';

    item.fixRows = Object.keys(item.invalidNumbers).map(key => {
        const originalNumber = item.invalidNumbers[key];
        const suggestedFix = item.suggestedFixes[key];
        const isDuplicateKey = key in item.duplicateNumbers;
        const isMismatchKey = key in item.mismatchTypeNumbers;
        const suggestedRowKey = translate('suggestedFix', locale);

        const duplicateLabel = isDuplicateKey ? `<span class="label label-number-problem">${translate("duplicateNumber", locale)}</span>` : '';
        const notMobileLabel = isMismatchKey ? `<span class="label label-number-problem">${translate("notMobileNumber", locale)}</span>` : '';
        const problemLabel = duplicateLabel + notMobileLabel;

        const tagToUse = item.phoneTagToUse;
        const mobileMovingToEmptyTag = !(tagToUse in item.invalidNumbers) && (tagToUse in item.suggestedFixes);

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
            } else {
                originalRowValue = oldDiff;
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
        } else if (isMismatchKey && !mobileMovingToEmptyTag) {
            const { oldDiff } = getDiffHtml(originalNumber, suggestedFix);
            return {
                [key]: `<span class="list-item-old-value">${oldDiff}${notMobileLabel}</span>`
            }
        } else if (item.autoFixable) {
            // Mobile is being moved to standard key, which did not exist before
            if (mobileMovingToEmptyTag) {
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
 * @param {string} countryName
 * @param {Object} subdivisionStats - The subdivision statistics object.
 * @param {Array<Object>} invalidNumbers - List of invalid items.
 * @param {string} locale
 * @param {Object} translations
 * @param {boolean} botEnabled - Whether or not the safe fix bot is enabled for this area
 */
async function generateHtmlReport(countryName, subdivisionStats, tmpFilePath, locale, translations, botEnabled) {
    const iconManager = new IconManager();

    const safeCountryName = safeName(countryName);
    const singleLevelDivision = safeCountryName === subdivisionStats.divisionSlug || subdivisionStats.divisionSlug === subdivisionStats.slug;
    const relativeFilePath = getSubdivisionRelativeFilePath(countryName, subdivisionStats.divisionSlug, subdivisionStats.slug)
    const htmlFilePath = `${path.join(PUBLIC_DIR, relativeFilePath)}.html`
    const dataFilePath = `${path.join(PUBLIC_DIR, relativeFilePath)}.json`

    const { invalidCount, autoFixableCount } = subdivisionStats;

    const stringerOptions = { makeArray: true };

    const inputStream = fs.createReadStream(tmpFilePath);
    const outputStream = fs.createWriteStream(dataFilePath);

    const chainedStream = chain([
        parser(),
        streamArray(),
        new ItemTransformer(item => {
            const clientItem = createClientItems(item, locale, botEnabled, iconManager);
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
        console.log(`Output data written to ${dataFilePath}`);
    } catch (err) {
        console.error('An error occurred during streaming:', err);
        throw err;
    }

    const svgSprite = iconManager.generateSvgSprite();


    let confettiScripts = '';
    if (invalidCount === 0) {
        confettiScripts = `
        <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                confetti({
                    particleCount: 150,
                    spread: 80,
                    origin: { y: 0.6 },
                    disableForReducedMotion: true
                });
            });
        </script>
        `;
    }

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

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('countryReportTitle', locale, [escapeHTML(subdivisionStats.name)])}</title>
        ${favicon}
        <link href="${singleLevelDivision ? '' : '../'}../styles.css" rel="stylesheet">
        <script src="${singleLevelDivision ? '' : '../'}../theme.js"></script>
        ${confettiScripts}
    </head>
    <body class="body-styles">
        ${svgSprite}
        <svg style="display: none;" xmlns="http://www.w3.org/2000/svg">
            <!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
            <symbol id="icon-undo" viewBox="0 0 640 640" fill="currentColor">
                <path d="M88 256L232 256C241.7 256 250.5 250.2 254.2 241.2C257.9 232.2 255.9 221.9 249 215L202.3 168.3C277.6 109.7 386.6 115 455.8 184.2C530.8 259.2 530.8 380.7 455.8 455.7C380.8 530.7 259.3 530.7 184.3 455.7C174.1 445.5 165.3 434.4 157.9 422.7C148.4 407.8 128.6 403.4 113.7 412.9C98.8 422.4 94.4 442.2 103.9 457.1C113.7 472.7 125.4 487.5 139 501C239 601 401 601 501 501C601 401 601 239 501 139C406.8 44.7 257.3 39.3 156.7 122.8L105 71C98.1 64.2 87.8 62.1 78.8 65.8C69.8 69.5 64 78.3 64 88L64 232C64 245.3 74.7 256 88 256z"/>
            </symbol>
            <symbol id="icon-redo" viewBox="0 0 640 640" fill="currentColor">
                <path d="M552 256L408 256C398.3 256 389.5 250.2 385.8 241.2C382.1 232.2 384.1 221.9 391 215L437.7 168.3C362.4 109.7 253.4 115 184.2 184.2C109.2 259.2 109.2 380.7 184.2 455.7C259.2 530.7 380.7 530.7 455.7 455.7C463.9 447.5 471.2 438.8 477.6 429.6C487.7 415.1 507.7 411.6 522.2 421.7C536.7 431.8 540.2 451.8 530.1 466.3C521.6 478.5 511.9 490.1 501 501C401 601 238.9 601 139 501C39.1 401 39 239 139 139C233.3 44.7 382.7 39.4 483.3 122.8L535 71C541.9 64.1 552.2 62.1 561.2 65.8C570.2 69.5 576 78.3 576 88L576 232C576 245.3 565.3 256 552 256z"/>
            </symbol>
        </svg>
        <div class="page-container">
            <header class="page-header">
                <div class="action-row">
                    <a href="${singleLevelDivision ? './' : '../'}" class="back-link">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span class="align-middle hidden sm:inline-flex">${translate('backToCountryPage', locale)}</span>
                    </a>
                    <div class="flex items-center space-x-2 relative">
                        <div id="error-div" class="text-black bg-red-500 rounded-md" hidden></div>
                        <button id="login-btn" class="btn-squared cursor-pointer text-white bg-blue-500" onclick="login()">${translate('login', locale)}</button>
                        <button id="logout-btn" class="btn-squared cursor-pointer btn-editor" onclick="logout()" hidden>${translate('logout', locale)}</button>
                    </div>
                    <div class="flex items-center space-x-2 relative">
                        <button id="settings-toggle" class="settings-button" aria-label="${translate('settings', locale)}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340.274 340.274" fill="currentColor" class="7 w-7">
                                <path d="M293.629,127.806l-5.795-13.739c19.846-44.856,18.53-46.189,14.676-50.08l-25.353-24.77l-2.516-2.12h-2.937 c-1.549,0-6.173,0-44.712,17.48l-14.184-5.719c-18.332-45.444-20.212-45.444-25.58-45.444h-35.765 c-5.362,0-7.446-0.006-24.448,45.606l-14.123,5.734C86.848,43.757,71.574,38.19,67.452,38.19l-3.381,0.105L36.801,65.032 c-4.138,3.891-5.582,5.263,15.402,49.425l-5.774,13.691C0,146.097,0,147.838,0,153.33v35.068c0,5.501,0,7.44,46.585,24.127 l5.773,13.667c-19.843,44.832-18.51,46.178-14.655,50.032l25.353,24.8l2.522,2.168h2.951c1.525,0,6.092,0,44.685-17.516 l14.159,5.758c18.335,45.438,20.218,45.427,25.598,45.427h35.771c5.47,0,7.41,0,24.463-45.589l14.195-5.74 c26.014,11,41.253,16.585,45.349,16.585l3.404-0.096l27.479-26.901c3.909-3.945,5.278-5.309-15.589-49.288l5.734-13.702 c46.496-17.967,46.496-19.853,46.496-25.221v-35.029C340.268,146.361,340.268,144.434,293.629,127.806z M170.128,228.474 c-32.798,0-59.504-26.187-59.504-58.364c0-32.153,26.707-58.315,59.504-58.315c32.78,0,59.43,26.168,59.43,58.315 C229.552,202.287,202.902,228.474,170.128,228.474z"/>
                            </svg>
                        </button>
                        <div id="editor-settings-menu" class="settings-menu hidden">
                        </div>
                        ${themeButton}
                    </div>
                </div>
                <h1 class="page-title">${translate('phoneNumberReport', locale)}</h1>
                <h2 class="page-subtitle">${escapeHTML(subdivisionStats.name)}</h2>
            </header>
            ${createStatsBox(subdivisionStats.totalNumbers, invalidCount, autoFixableCount, locale)}
            <div id="reportContainer" class="space-y-8">
                <section id="fixableSection" class="space-y-8">
                    <div class="spinner mx-auto"></div>
                </section>
                <section id="invalidSection" class="space-y-8"></section>
                <section id="noInvalidSection"></section>
            </div>
            <div class="footer-container">
                ${createFooter(locale, translations, true)}
            </div>
        </div>
        <div id="upload-modal-overlay" class="save-modal-overlay modal-overlay hidden">
            <div class="save-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <div class="save-modal-content">
                    <h3 id="upload-modal-title" class="save-modal-title"></h3>
                    <button id="upload-close-modal-btn-top" class="modal-close" onclick="closeUploadModal()">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <textarea id="changesetComment" rows="3" class="changeset-comment-box"></textarea>
                <div id="message-box" class="mt-4 p-3 bg-green-100 text-green-700 border border-green-300 rounded-lg hidden" role="alert"></div>
                <div class="modal-button-container">
                    <div id="upload-spinner" class="hidden spinner mr-4"></div>
                    <button id="close-modal-btn-bottom" class="btn-modal bg-gray-500 hover:bg-gray-600 cursor-pointer hidden" onclick="closeUploadModal()">
                        ${translate('close', locale)}
                    </button>
                    <button id="cancel-modal-btn" class="btn-modal bg-red-500 hover:bg-red-600 cursor-pointer" onclick="closeUploadModal()">
                        ${translate('cancel', locale)}
                    </button>
                    <button id="upload-changes-btn" class="btn-modal bg-gray-500 hover:bg-gray-600 cursor-pointer" onclick="checkAndSubmit()">
                        ${translate('upload', locale)}
                    </button>
                </div>
            </div>
        </div>
        <div id="edits-modal-overlay" class="save-modal-overlay modal-overlay hidden">
            <div class="save-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <div class="save-modal-content">
                    <h3 id="edits-modal-title" class="save-modal-title"></h3>
                    <button id="edits-close-modal-btn-top" class="modal-close" onclick="discardEdits()">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <p class="modal-decription">${translate('restoreUnsavedEdits', locale)}</p>
                <div class="modal-button-container">
                    <button id="edits-modal-discard-btn" class="btn-modal bg-red-500 hover:bg-red-600 cursor-pointer" onclick="discardEdits()">
                        ${translate('discard', locale)}
                    </button>
                    <button id="edits-modal-keep-btn" class="btn-modal bg-gray-500 hover:bg-gray-600 cursor-pointer" onclick="closeEditsModal()">
                        ${translate('keep', locale)}
                    </button>
                </div>
            </div>
        </div>
    <script>
        // Client-side constants
        const ALL_EDITOR_IDS = ${JSON.stringify(ALL_EDITOR_IDS)};
        const DEFAULT_EDITORS_DESKTOP = ${JSON.stringify(DEFAULT_EDITORS_DESKTOP)};
        const DEFAULT_EDITORS_MOBILE = ${JSON.stringify(DEFAULT_EDITORS_MOBILE)};
        const DATA_FILE_PATH = './${subdivisionStats.slug}.json';
        const DATA_LAST_UPDATED = '${subdivisionStats.lastUpdated}';
        const STORAGE_KEY = 'osm_report_editors';
        const subdivisionName = ${JSON.stringify(subdivisionStats.name)};
        const CHANGESET_TAGS = ${JSON.stringify(CHANGESET_TAGS)};
        ${clientOsmEditorsScript}
        for (const editorId in OSM_EDITORS) {
            const editor = OSM_EDITORS[editorId];
            const funcString = editor.getEditLink;
            const functionBody = funcString.substring(funcString.indexOf('{') + 1, funcString.lastIndexOf('}'));
            editor.getEditLink = new Function('item', functionBody);
            if (editor.onClick) {
                const onClickBody = editor.onClick;
                editor.onClick = new Function('event', onClickBody);
            }
        }
    </script>
    <script src="${singleLevelDivision ? '' : '../'}../vendor/osm-api.min.js"></script>
    <script src="${singleLevelDivision ? '' : '../'}../report-page.js"></script>
    </body>
    </html>
    `;
    await fsPromises.writeFile(htmlFilePath, htmlContent);
    console.log(`Generated report for ${subdivisionStats.name} at ${htmlFilePath}`);
}

module.exports = {
    generateHtmlReport,
    createJosmFixUrl,
    getSubdivisionRelativeFilePath,
};
