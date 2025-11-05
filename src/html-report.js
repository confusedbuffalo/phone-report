const fs = require('fs');
const { promises: fsPromises } = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { chain } = require('stream-chain');
const { parser } = require('stream-json/Parser');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { disassembler } = require('stream-json/Disassembler');
const { stringer } = require('stream-json/Stringer');
const { PUBLIC_DIR, OSM_EDITORS, ALL_EDITOR_IDS, DEFAULT_EDITORS_DESKTOP, DEFAULT_EDITORS_MOBILE } = require('./constants');
const { safeName, getFeatureTypeName, getFeatureIcon, isDisused, phoneTagToUse } = require('./data-processor');
const { translate } = require('./i18n');
const { getDiffHtml, getDiffTagsHtml } = require('./diff-renderer');
const { favicon, themeButton, createFooter, createStatsBox, escapeHTML } = require('./html-utils');
const { generateSvgSprite, getIconHtml, clearIconSprite } = require('./icon-manager');


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
 * @returns {string}
 */
function createClientItems(item, locale) {
    item.phoneTagToUse = phoneTagToUse(item.allTags);
    item.featureTypeName = escapeHTML(getFeatureTypeName(item, locale));

    const iconName = getFeatureIcon(item, locale);
    const iconHtml = getIconHtml(iconName);
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

        const duplicateLabel = `<span class="label label-number-problem">${translate("duplicateNumber", locale)}</span>`;
        const notMobileLabel = `<span class="label label-number-problem">${translate("notMobileNumber", locale)}</span>`;

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
            if (isDuplicateKey && isMismatchKey) {
                originalRowValue = `<span class="list-item-old-value">${oldDiff}${duplicateLabel}${notMobileLabel}</span>`;
            } else if (isDuplicateKey) {
                originalRowValue = `<span class="list-item-old-value">${oldDiff}${duplicateLabel}</span>`;
            } else if (isMismatchKey) {
                originalRowValue = `<span class="list-item-old-value">${oldDiff}${notMobileLabel}</span>`;
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
        } else {
            const tagToUse = item.phoneTagToUse;
            // Mobile is being moved to standard key, which did not exist before
            if (!(tagToUse in item.invalidNumbers) && (tagToUse in item.suggestedFixes)) {
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
            this.push(result);
            callback();
        } catch (error) {
            callback(error);
        }
    }
}

/**
 * Generates the HTML report for a single subdivision.
 * @param {string} countryName
 * @param {Object} subdivisionStats - The subdivision statistics object.
 * @param {Array<Object>} invalidNumbers - List of invalid items.
 * @param {string} locale
 * @param {Object} translations
 */
async function generateHtmlReport(countryName, subdivisionStats, tmpFilePath, locale, translations) {
    clearIconSprite();

    const subdivisionSlug = path.join(subdivisionStats.divisionSlug, subdivisionStats.slug);
    const safeCountryName = safeName(countryName);
    const htmlFilePath = path.join(PUBLIC_DIR, safeCountryName, `${subdivisionSlug}.html`);
    const dataFilePath = path.join(PUBLIC_DIR, safeCountryName, `${subdivisionSlug}.json`);

    const { invalidCount, autoFixableCount } = subdivisionStats;

    const stringerOptions = { makeArray: true };

    const pipelinePromise = new Promise((resolve, reject) => {
        const pipeline = chain([
            fs.createReadStream(tmpFilePath),
            parser(),
            streamArray(),
            new ItemTransformer(createClientItems, { locale: locale }),
            disassembler(),
            stringer(stringerOptions),
            fs.createWriteStream(dataFilePath)
        ]);

        pipeline.on('error', (err) => {
            console.error('An error occurred during streaming:', err);
            reject(err);
        });
        pipeline.on('finish', () => {
            console.log(`Output data written to ${dataFilePath}`);
            resolve();
        });
    });

    await pipelinePromise;

    // Generate the sprite after processing the items
    const svgSprite = generateSvgSprite();

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
        <link href="../../styles.css" rel="stylesheet">
        <script src="../../theme.js"></script>
        ${confettiScripts}
    </head>
    <body class="body-styles">
        ${svgSprite}
        <div class="page-container">
            <header class="page-header">
                <div class="action-row">
                    <a href="../" class="back-link">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span class="align-middle">${translate('backToCountryPage', locale)}</span>
                    </a>
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
                <section id="fixableSection" class="space-y-8"></section>
                <section id="invalidSection" class="space-y-8"></section>
                <section id="noInvalidSection"></section>
            </div>
            <div class="footer-container">
                ${createFooter(locale, translations, true)}
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
    <script src="../../report-page.js"></script>
    </body>
    </html>
    `;
    await fsPromises.writeFile(htmlFilePath, htmlContent);
    console.log(`Generated report for ${subdivisionStats.name} at ${htmlFilePath}`);
}

module.exports = {
    generateHtmlReport,
    createJosmFixUrl,
};
