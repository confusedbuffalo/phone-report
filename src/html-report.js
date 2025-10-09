const { promises: fsPromises } = require('fs');
const path = require('path');
const { PUBLIC_DIR, OSM_EDITORS, ALL_EDITOR_IDS, DEFAULT_EDITORS_DESKTOP, DEFAULT_EDITORS_MOBILE } = require('./constants');
const { safeName, getFeatureTypeName, getFeatureIcon, isDisused, phoneTagToUse } = require('./data-processor');
const { translate } = require('./i18n');
const { getDiffHtml, getDiffTagsHtml } = require('./diff-renderer');
const { favicon, themeButton, createFooter, createStatsBox, escapeHTML } = require('./html-utils');
const { generateSvgSprite, getIconHtml, clearIconSprite } = require('./icon-manager');

/**
 * Creates the HTML grid for displaying an invalid phone number tag and its suggested fix.
 * It generates a diff view if a fix is available.
 * @param {Object} item - The invalid item object, containing `invalidNumbers` and `suggestedFixes`.
 * @param {string} locale - The current locale for translations.
 * @returns {string} The HTML string for the details grid.
 */
function createDetailsGrid(item, locale) {
    const detailsGrid = Object.keys(item.invalidNumbers).map(key => {
        const originalNumber = item.invalidNumbers[key];
        const suggestedFix = item.suggestedFixes[key];

        let originalNumberHtml;
        let suggestedFixHtml = '';
        let extraRow = '';

        if (key in item.mismatchTypeNumbers) {
            const tagToUse = phoneTagToUse(item.allTags);
            const existingValuePresent = tagToUse in item.allTags;

            console.log(item);

            let originalNumber;
            if (!item.invalidNumbers[tagToUse] && item.allTags[tagToUse]) {
                originalNumber = item.allTags[tagToUse];
            } else if (item.invalidNumbers[tagToUse]) {
                originalNumber = item.invalidNumbers[tagToUse]
            } else {
                originalNumber = null;
            }

            let suggestedFix;
            if (!item.suggestedFixes[tagToUse] && item.allTags[tagToUse]) {
                suggestedFix = item.allTags[tagToUse] + '; ' + item.mismatchTypeNumbers[key];
            } else if (item.suggestedFixes[tagToUse]) {
                suggestedFix = item.suggestedFixes[tagToUse] + '; ' + item.mismatchTypeNumbers[key];
            } else {
                suggestedFix = item.mismatchTypeNumbers[key];
            }

            const originalMismatch = item.allTags[key];
            const suggestedMismatch = item.suggestedFixes[key];

            const {
                oldDiff: originalDiff,
                newDiff: suggestedDiff
            } = getDiffHtml(originalNumber, suggestedFix);

            const {
                oldDiff: originalMismatchDiff,
                newDiff: suggestedMismatchDiff
            } = getDiffHtml(originalMismatch, suggestedMismatch);

            const notMobileLabel = `<span class="label label-not-mobile">${translate("notMobileNumber", locale)}</span>`

            originalNumberHtml = `
                <span class="list-item-old-value">
                    <span class="list-item-old-value">${originalMismatchDiff}</span>${notMobileLabel}
                </span>`;

            let oldTagDiff = '', newTagDiff = '';
            if (!item.suggestedFixes[key] && !existingValuePresent) {
                // Simply moving from one key to another
                ({ oldTagDiff, newTagDiff } = getDiffTagsHtml(key, tagToUse));
            } else if (!item.suggestedFixes[key]) {
                // Emptying old tag, appending it to existing tag
                oldTagDiff = `<span class="diff-removed">${key}</span>`;
                newTagDiff = `<span class="diff-unchanged">${tagToUse}</span>`;
                if (tagToUse in item.suggestedFixes) {
                    extraRow = `
                        <div class="list-item-phone-label-container">
                            <span class="list-item-phone-label">${tagToUse}</span>
                        </div>
                        <div class="list-item-phone-value-container">
                            ${originalDiff}
                        </div>`;
                }
            } else if (existingValuePresent) {
                // Removing from old tag (leaving something there) and adding to existing tag
                oldTagDiff = `<span class="diff-unchanged">${key}</span>`;
                newTagDiff = `<span class="diff-unchanged">${tagToUse}</span>`;
                
                extraRow = `
                    <div class="list-item-phone-label-container">
                        <span class="list-item-phone-label">${key}</span>
                    </div>
                    <div class="list-item-phone-value-container">
                        ${suggestedMismatchDiff}
                    </div>`
                if (tagToUse in item.suggestedFixes) {
                    extraRow += `
                        <hr class="phone-separator-line">
                        <div class="list-item-phone-label-container">
                            <span class="list-item-phone-label">${tagToUse}</span>
                        </div>
                        <div class="list-item-phone-value-container">
                            ${originalDiff}
                        </div>`;
                }
            } else {
                // Removing from old tag, creating new tag
                oldTagDiff = `<span class="diff-unchanged">${key}</span>`;
                newTagDiff = `<span class="diff-added">${tagToUse}</span>`;
                extraRow = `
                    <div class="list-item-phone-label-container">
                        <span class="list-item-phone-label">${key}</span>
                    </div>
                    <div class="list-item-phone-value-container">
                        ${suggestedMismatchDiff}
                    </div>`
            }

            suggestedFixHtml = `
                <div class="list-item-phone-label-container">
                    <span class="list-item-phone-label">${newTagDiff}</span>
                </div>
                <div class="list-item-phone-value-container">
                    <span>${suggestedDiff}</span>
                </div>
            `;

            return `<div class="list-item-details-grid">
                <div class="list-item-phone-label-container">
                    <span class="list-item-phone-label">${oldTagDiff}</span>
                </div>
                <div class="list-item-phone-value-container">
                    ${originalNumberHtml}
                </div>
                ${extraRow}
                ${suggestedFixHtml}
            </div>`
        }

        // Dealt with above
        if (item.hasTypeMismatch && key === phoneTagToUse(item.allTags)) {
            return;
        }

        if (suggestedFix) {
            const { oldDiff, newDiff } = getDiffHtml(originalNumber, suggestedFix);
            originalNumberHtml = `<span>${oldDiff}</span>`;
            suggestedFixHtml = `
                <div class="list-item-phone-label-container">
                    <span class="list-item-phone-label">${translate('suggestedFix', locale)}</span>
                </div>
                <div class="list-item-phone-value-container">
                    <span>${newDiff}</span>
                </div>
            `;
        } else {
            originalNumberHtml = `<span>${escapeHTML(originalNumber)}</span>`;
        }

        // Return the HTML for one set of phone number details
        return `
            <div class="list-item-details-grid">
                <div class="list-item-phone-label-container">
                    <span class="list-item-phone-label">${key}</span>
                </div>
                <div class="list-item-phone-value-container">
                    ${originalNumberHtml}
                </div>
                ${suggestedFixHtml}
            </div>
        `;
    }).filter(Boolean).join('<hr class="phone-separator-line">');

    return detailsGrid;
}

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
        const tagToUse = phoneTagToUse(item.allTags);
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
 * Creates the website and editor buttons for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @returns {{
 * websiteButton: Element,
 * fixableLabel: Element,
 * josmFixButton: Element,
 * editorButtons: Element[]
 * }}
 */
function createButtons(item, locale) {
    const josmFixUrl = createJosmFixUrl(item);

    // Generate buttons for ALL editors so client-side script can hide them
    const editorButtons = ALL_EDITOR_IDS.map(editorId => {
        const editor = OSM_EDITORS[editorId];
        if (!editor) return '';

        const url = editor.getEditLink(item);
        const text = editor.editInString(locale);
        const isJosm = editorId === 'JOSM';

        // Use a standard target="_blank" for non-JOSM/non-GEO links
        const target = isJosm ? '' : (editorId === 'Geo' ? '' : 'target="_blank"');

        // JOSM requires an onclick handler; others use a direct href
        const href = isJosm ? '#' : url;
        const onClick = isJosm ? `onclick="openInJosm('${url}', event)"` : '';

        return `
            <a href="${href}" ${target} ${onClick} 
                data-editor-id="${editorId}"
                class="btn btn-editor">
                ${text}
            </a>
        `;
    }).join('\n');

    // Generate JOSM Fix Button (special case)
    const josmFixButton = josmFixUrl ?
        `<a href="#" onclick="openInJosm('${josmFixUrl}', event)" 
            data-editor-id="josm-fix"
            class="btn btn-josm-fix">
            ${translate('fixInJOSM', locale)}
        </a>` :
        '';
    const fixableLabel = item.autoFixable ?
        `<span data-editor-id="fix-label" class="label label-fixable">${translate('fixable', locale)}</span>` :
        '';

    const websiteButton = item.website ?
        `<a href="${item.website}" class="btn btn-website" target="_blank">${translate('website', locale)}</a>` :
        '';

    return { websiteButton, fixableLabel, josmFixButton, editorButtons };
}

/**
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @returns {string}
 */
function createListItem(item, locale) {

    const disusedLabel = isDisused(item) ? `<span class="label label-disused">${translate('disused', locale)}</span>` : '';

    const iconName = getFeatureIcon(item, locale);
    const iconHtml = getIconHtml(iconName);

    const { websiteButton, fixableLabel, josmFixButton, editorButtons } = createButtons(item, locale);

    return `
        <li class="report-list-item">
            <div class="list-item-content-wrapper">
                <a class="list-item-icon-circle-preview" href="${item.osmUrl}" target="_blank" rel="noopener noreferrer">
                    ${iconHtml}
                </a>
                <div class="list-item-details-wrapper">
                    <div class="list-item-header">
                        <h3 class="list-item-title">${escapeHTML(getFeatureTypeName(item, locale))}</h3>
                        ${disusedLabel}
                    </div>
                    ${createDetailsGrid(item, locale)}
                </div>
            </div>

            <div class="list-item-actions-container">
                ${websiteButton}
                ${fixableLabel}
                ${josmFixButton}
                ${editorButtons} 
            </div>
        </li>
    `;
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
    const filePath = path.join(PUBLIC_DIR, safeCountryName, `${subdivisionSlug}.html`);

    const autofixableNumbers = invalidNumbers.filter(item => item.autoFixable);
    const manualFixNumbers = invalidNumbers.filter(item => !item.autoFixable);

    const anyInvalid = manualFixNumbers.length > 0
    const anyFixable = autofixableNumbers.length > 0

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

    const fixableListContent = autofixableNumbers.map(item => createListItem(item, locale)).join('');
    const invalidListContent = manualFixNumbers.map(item => createListItem(item, locale)).join('');

    // Generate the sprite after all list items have been processed
    const svgSprite = generateSvgSprite();

    const fixableSectionAndHeader = `
        <div class="section-header-container">
            <h2 class="section-header">${translate('fixableNumbersHeader', locale)}</h2>
            <p class="section-description">${translate('fixableNumbersDescription', locale)}</p>
        </div>
        <ul class="report-list">
            ${fixableListContent}
        </ul>`;

    const invalidSectionAndHeader = `
        <div class="text-center">
            <h2 class="section-header">${translate('invalidNumbersHeader', locale)}</h2>
            <p class="section-description">${translate('invalidNumbersDescription', locale)}</p>
        </div>
        <ul class="report-list">
            ${invalidListContent}
        </ul>`;

    const noInvalidContent = `<li class="report-list-item-empty">${translate('noInvalidNumbers', locale)}</li>`;

    const fixableAndInvalidSectionContent =
        (anyFixable && anyInvalid) ? fixableSectionAndHeader + invalidSectionAndHeader :
            anyFixable ? fixableSectionAndHeader :
                anyInvalid ? invalidSectionAndHeader :
                    noInvalidContent

    // Dynamically create the list of all editor IDs for the client-side script
    const allEditorIdsClient = JSON.stringify(ALL_EDITOR_IDS);

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
            ${fixableAndInvalidSectionContent}
            <div class="footer-container">
                ${createFooter(locale, translations, true)}
            </div>
        </div>
    <script>
        // CLIENT-SIDE LOGIC FOR EDITOR SETTINGS
        const ALL_EDITOR_IDS = ${allEditorIdsClient};
        const DEFAULT_EDITORS_DESKTOP = ${JSON.stringify(DEFAULT_EDITORS_DESKTOP)};
        const DEFAULT_EDITORS_MOBILE = ${JSON.stringify(DEFAULT_EDITORS_MOBILE)};
        const STORAGE_KEY = 'osm_report_editors';
    </script>
    <script src="../../report-page.js"></script>
    </body>
    </html>
    `;
    await fsPromises.writeFile(filePath, htmlContent);
    console.log(`Generated report for ${subdivisionStats.name} at ${filePath}`);
}

module.exports = {
    generateHtmlReport,
    createJosmFixUrl,
};