const { promises: fsPromises } = require('fs');
const path = require('path');
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

    let newSuggestedFixes = {};
    if (item.hasTypeMismatch) {
        const tagToUse = item.phoneTagToUse;
        const existingValuePresent = tagToUse in item.allTags;

        const existingFixes = (existingValuePresent && !item.suggestedFixes[tagToUse])
            ? item.allTags[tagToUse]
            : (item.suggestedFixes[tagToUse])
                ? item.suggestedFixes[tagToUse]
                : '';

        const existingFixesList = existingFixes
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        newSuggestedFixes = {
            ...item.suggestedFixes,
            [tagToUse]: [...existingFixesList, ...Object.values(item.mismatchTypeNumbers)].join('; ')
        };
    } else {
        newSuggestedFixes = item.suggestedFixes;
    }
    const fixes = Object.entries(newSuggestedFixes);

    const encodedTags = fixes.map(([key, value]) => {
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

        // --- Handle type mismatch numbers ---
        if (key in item.mismatchTypeNumbers) {
            const tagToUse = item.phoneTagToUse;
            const existingValuePresent = tagToUse in item.allTags;

            // Resolve what the "main" tag originally had and what we’ll suggest
            let originalForMismatch = item.invalidNumbers[tagToUse] ?? item.allTags[tagToUse] ?? null;
            let suggestedForMismatch;

            if (item.suggestedFixes[tagToUse]) {
                suggestedForMismatch = item.suggestedFixes[tagToUse] + '; ' + item.mismatchTypeNumbers[key];
            } else if (item.allTags[tagToUse]) {
                suggestedForMismatch = item.allTags[tagToUse] + '; ' + item.mismatchTypeNumbers[key];
            } else {
                suggestedForMismatch = item.mismatchTypeNumbers[key];
            }

            const originalMismatch = item.allTags[key];
            const suggestedMismatch = item.suggestedFixes[key];

            const { oldDiff: originalDiff, newDiff: suggestedDiff } = getDiffHtml(originalForMismatch, suggestedForMismatch);
            const { oldDiff: originalMismatchDiff, newDiff: suggestedMismatchDiff } = getDiffHtml(originalMismatch, suggestedMismatch);

            const notMobileLabel = `<span class="label label-number-problem">${translate("notMobileNumber", locale)}</span>`;
            const originalRowValue = `<span class="list-item-old-value">${originalMismatchDiff}${notMobileLabel}</span>`;
            const suggestedRowValue = suggestedDiff;

            let oldTagDiff = '', newTagDiff = '';

            if (!item.suggestedFixes[key] && !existingValuePresent) {
                // Simply moving from one key to another
                ({ oldTagDiff, newTagDiff } = getDiffTagsHtml(key, tagToUse));
                return {
                    [oldTagDiff]: originalRowValue,
                    [newTagDiff]: suggestedRowValue
                };
            } else if (!item.suggestedFixes[key]) {
                // Emptying old tag, appending it to existing tag
                oldTagDiff = `<span class="diff-removed">${key}</span>`;
                newTagDiff = `<span class="diff-unchanged">${tagToUse}</span>`;
                return {
                    [oldTagDiff]: originalRowValue,
                    [tagToUse]: originalDiff,
                    [newTagDiff]: suggestedRowValue
                };
            } else if (existingValuePresent) {
                // Removing from old tag (leaving something there) and adding to existing tag
                oldTagDiff = `<span class="diff-unchanged">${key}</span>`;
                newTagDiff = `<span class="diff-unchanged">${tagToUse}</span>`;
                return {
                    [oldTagDiff]: originalRowValue,
                    [key]: suggestedMismatchDiff,
                    [tagToUse]: originalDiff,
                    [newTagDiff]: suggestedRowValue
                };
            } else {
                // Removing from old tag, creating new tag
                oldTagDiff = `<span class="diff-unchanged">${key}</span>`;
                newTagDiff = `<span class="diff-added">${tagToUse}</span>`;
                return {
                    [oldTagDiff]: originalRowValue,
                    [key]: suggestedMismatchDiff,
                    [newTagDiff]: suggestedRowValue
                };
            }
        }

        // --- Skip duplicate rendering of type mismatch "main" tag ---
        if (item.hasTypeMismatch && key === item.phoneTagToUse) return;

        // --- Handle simple fixable numbers ---
        if (suggestedFix) {
            const { oldDiff, newDiff } = getDiffHtml(originalNumber, suggestedFix);
            const suggestedRowKey = translate('suggestedFix', locale);
            return {
                [key]: oldDiff,
                [suggestedRowKey]: newDiff
            };
        }

        // --- Handle duplicates ---
        if (key in item.duplicateNumbers) {
            const { oldDiff } = getDiffHtml(originalNumber, suggestedFix);
            const duplicateLabel = `<span class="label label-number-problem">${translate("duplicateNumber", locale)}</span>`;
            const originalRowValue = `<span class="list-item-old-value">${oldDiff}${duplicateLabel}</span>`;

            const otherKeys = Object.keys(item.invalidNumbers).filter(k => k !== key);
            const suggestedRowKey = translate('suggestedFix', locale);
            const keptTag = otherKeys.find(k => item.suggestedFixes[k]) ?? null;
            const keptValue = keptTag ? item.suggestedFixes[keptTag] : null;

            // Show both tags side by side if both exist
            if (keptTag && keptValue) {
                return {
                    [key]: originalRowValue,
                    [keptTag]: keptValue,
                    [suggestedRowKey]: keptValue
                };
            }

            const suggestedFixKeys = Object.keys(item.suggestedFixes);
            const otherKey = suggestedFixKeys.find(key => !item.invalidNumbers.hasOwnProperty(key)) ?? null;
            const otherValue = otherKey ? item.suggestedFixes[otherKey] : null;

            // Otherwise show the value that has the duplicate
            return {
                [key]: originalRowValue,
                [otherKey]: otherValue,
            };
        }

        // --- Default fallback for plain invalid numbers (no fix, no duplicate) ---
        return {
            [key]: `<span>${escapeHTML(originalNumber)}</span>`
        };
    }).filter(Boolean);


    item.josmFixUrl = createJosmFixUrl(item);

    const { allTags, ...clientItem } = item;

    return clientItem;
}

/**
 * Generates the HTML report for a single subdivision.
 * @param {string} countryName
 * @param {Object} subdivisionStats - The subdivision statistics object.
 * @param {Array<Object>} invalidNumbers - List of invalid items.
 * @param {string} locale
 * @param {Object} translations
 */
async function generateHtmlReport(countryName, subdivisionStats, invalidNumbers, locale, translations) {

    // Clear the map at the start of report generation for a new page.
    clearIconSprite();

    const subdivisionSlug = path.join(subdivisionStats.divisionSlug, subdivisionStats.slug);
    const safeCountryName = safeName(countryName);
    const htmlFilePath = path.join(PUBLIC_DIR, safeCountryName, `${subdivisionSlug}.html`);
    const dataFilePath = path.join(PUBLIC_DIR, safeCountryName, `${subdivisionSlug}.json`);

    const invalidItemsClient = invalidNumbers.map(item => createClientItems(item, locale));
    await fsPromises.writeFile(dataFilePath, JSON.stringify(invalidItemsClient, null));

    // Generate the sprite after all list items have been processed
    const svgSprite = generateSvgSprite();

    const autofixableNumbers = invalidNumbers.filter(item => item.autoFixable);

    // Add a confetti easter egg if there are no errors
    let confettiScripts = '';
    if (invalidNumbers.length === 0) {
        confettiScripts = `
        <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
        <script>
            // Fire confetti when the page loads
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
            return value.toString();
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
            ${createStatsBox(subdivisionStats.totalNumbers, invalidNumbers.length, autofixableNumbers.length, locale)}
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
        const DATA_FILE_PATH = './${subdivisionSlug}.json';
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
