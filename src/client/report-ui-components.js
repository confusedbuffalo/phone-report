import { languageNames } from "./report-state.js";
import { isItemClicked } from "./report-storage.js";

export function createSaveRow() {
    return `
        <div class="save-undo-row">
            <span class="flex items-center">
                <button id="undo-btn" class="btn-undo-redo gray-btn-disabled" data-action="undo" disabled><svg class="icon-svg"><use href="#icon-undo"></use></svg></button>
                <button id="redo-btn" class="btn-undo-redo gray-btn-disabled" data-action="redo" disabled><svg class="icon-svg"><use href="#icon-redo"></use></svg></button>
            </span>
            <div id="save-btn-container">
                <button id="save-btn" class="btn-squared gray-btn-disabled" data-action="open-upload-modal" disabled>${translate('save')}</button>
            </div>
        </div>`;
}

/**
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @returns {string} The full HTML string for the list item element.
 */
export function createListItem(item) {
    const itemId = `${item.type}/${item.id}`;
    const clickedClass = isItemClicked(itemId) ? 'btn-clicked' : '';

    const relativeTime = getRelativeTime(item.timestamp);

    const { websiteButton, fixableLabel, josmFixButton, fixButton, editorButtons, noteButton } = createButtons(item, clickedClass);

    const iconHtml = item.iconName ? `<span class="icon-svg-container"><svg class="icon-svg"><use href="#${item.iconName}"></use></svg></span>` : item.iconHtml;

    const itemMetadata = item.user ? `
        <a href="https://www.openstreetmap.org/changeset/${item.changeset}" target="_blank" rel="noopener noreferrer" class="cursor-pointer">${relativeTime}</a>
        <a href="https://www.openstreetmap.org/user/${item.user}" target="_blank" rel="noopener noreferrer" class="cursor-pointer">${item.user}</a>`
        : item.timestamp ? `<span>${relativeTime}</span>` : '';

    const metaDataDiv = itemMetadata ? `
        <div class="list-item-meta">
            <svg class="meta-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${itemMetadata}
        </div>` : '';

    const helpLabel = item.name ?
        `<span data-editor-id="apply-fix" class="label label-help">${translate('copyNameTo')}</span>` :
        `<span data-editor-id="apply-fix" class="label label-help">${translate('copyNameFrom')}</span>`;

    const buttonLayout = reportType === 'phone'
        ? [
            [websiteButton, fixableLabel, fixButton, noteButton],
            [josmFixButton, editorButtons]
        ]
        : [
            [helpLabel, fixButton],
            [websiteButton, fixableLabel, noteButton],
            [josmFixButton, editorButtons]
        ];

    const actionsContainer = buttonLayout
        .map(row => `
              <div class="flex flex-wrap gap-2 justify-end">
                  ${row.join('')}
              </div>`).join('');

    return `
        <li class="report-list-item" data-item-id="${itemId}">
            <div class="list-item-content-wrapper">
                <a class="list-item-icon-circle-preview" href="https://www.openstreetmap.org/${item.type}/${item.id}" target="_blank" rel="noopener noreferrer">
                    ${iconHtml}
                </a>
                <div class="list-item-details-wrapper">
                    <div class="list-item-header">
                        <h3 class="list-item-title">${item.featureTypeName}</h3>
                        ${item.disusedLabel}
                    </div>
                    ${createDetailsGrid(item)}
                </div>
            </div>

            <div class="list-item-actions-container">
                ${actionsContainer}
            </div>
            ${metaDataDiv}
        </li>
    `;
}

/**
 * Creates a single row for the HTML grid for displaying an invalid phone number tag and value.
 * @param {string} label - The HTML for the label.
 * @param {string} number - The HTML for the phone number.
 * @returns {string} The HTML string for the details grid.
 */
function createDetailsRow(label, number) {
    return `<div class="list-item-phone-label-container">
                <span class="list-item-phone-label">${label}</span>
            </div>
            <div class="list-item-phone-value-container ${reportType === 'phone' ? 'break-all' : 'wrap-break-word'}">
                ${number}
            </div>`
}

/**
 * Creates the HTML grid for displaying an invalid phone number tag and its suggested fix.
 * It generates a diff view if a fix is available.
 * @param {Object} item - The invalid item object.
 * @returns {string} The HTML string for the details grid.
 */
function createDetailsGrid(item) {
    const detailsGrid = item.fixRows.map(row => {
        const detailsRows = Object.entries(row).map(([label, number]) => {
            return createDetailsRow(label, number);
        }).join('\n');
        return `
            <div class="list-item-details-grid">
                ${detailsRows}
            </div>`
    }).join('<hr class="phone-separator-line">');

    return detailsGrid;
}

/**
 * Creates the website and editor buttons for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @param {string} clickedClass - A class string to apply if the item has been clicked (e.g., 'btn-clicked').
 * @returns {{
* websiteButton: string,
* fixableLabel: string,
* josmFixButton: string,
* fixButton: string,
* editorButtons: string
* noteButton: string
* }} An object containing the HTML strings for all generated buttons.
*/
function createButtons(item, clickedClass) {
    // Generate buttons for ALL editors so client-side script can hide them
    const editorButtons = ALL_EDITOR_IDS.map(editorId => {
        const editor = OSM_EDITORS[editorId];
        if (!editor) return '';

        if (editorId === 'JOSM') {
            return `
                <button
                    data-action="josm"
                    data-item-type="${item.type}"
                    data-item-id="${item.id}"
                    data-url="${editor.getEditLink(item)}"
                    data-editor-id="${editorId}"
                    class="btn cursor-pointer ${clickedClass ? clickedClass : 'btn-editor'}">
                    ${editor.editInString}
                </button>
        `;
        }

        return `
            <a
                href="${editor.getEditLink(item)}"
                ${editorId === 'Geo' ? '' : 'target="_blank"'}
                data-action="edit"
                data-item-type="${item.type}"
                data-item-id="${item.id}"
                data-editor-id="${editorId}"
                class="btn cursor-pointer ${clickedClass ? clickedClass : 'btn-editor'}">
                ${editor.editInString}
            </a>
       `;
    }).join('\n');

    let fixButton;
    if (reportType === 'name' && !item.name) {
        fixButton = Object.keys(item.nameTags).map(key => {
            const nameLanguage = key.slice(5);
            return `<button
                data-action="add-name"
                data-language="${nameLanguage}"
                data-item-type="${item.type}"
                data-item-id="${item.id}"
                data-editor-id="apply-fix"
                class="btn cursor-pointer ${clickedClass ? clickedClass : 'btn-josm-fix'}"
                title="${languageNames.of(nameLanguage)}">
                ${nameLanguage}
            </button>`
        }).join('\n')
    } else if (reportType === 'name' && item.name) {
        fixButton = OFFICIAL_LANGUAGES.map(language => {
            const nameExists = (`name:${language}` in item.nameTags);
            return `<button
                data-action="complete-name"
                data-language="${language}"
                data-item-type="${item.type}"
                data-item-id="${item.id}"
                data-editor-id="apply-fix"
                ${nameExists ? 'disabled' : ''}
                class="btn ${nameExists ? 'btn-disabled' : clickedClass ? clickedClass + ' cursor-pointer' : 'cursor-pointer btn-josm-fix'}"
                title="${languageNames.of(language)}">
                ${language}
            </button>`
        }).join('\n')
    } else {
        fixButton = item.autoFixable ?
            `<button
                data-action="fix"
                data-item-type="${item.type}"
                data-item-id="${item.id}"
                data-editor-id="apply-fix"
                class="btn cursor-pointer ${clickedClass ? clickedClass : 'btn-josm-fix'}">
                ${translate('applyFix')}
        </button>` :
            '';
    }

    const createdNotes = JSON.parse(localStorage.getItem(`createdNotes_${subdivisionName}`)) || [];
    const noteClickedClass = createdNotes.includes(`${item.type}/${item.id}`) ? 'btn-clicked' : 'btn-note';
    const noteButton = item.autoFixable ? '' :
        `<button
            data-action="add-note"
            data-item-type="${item.type}"
            data-item-id="${item.id}"
            data-editor-id="note-btn"
            class="btn cursor-pointer ${noteClickedClass}">
            ${translate('openNote')}
       </button>`

    const josmFixButton = item.josmFixUrl ?
        `<button 
            data-action="josm"
            data-item-type="${item.type}"
            data-item-id="${item.id}"
            data-url="${item.josmFixUrl}"
            data-editor-id="josm-fix"
            class="btn ${clickedClass ? clickedClass : 'btn-josm-fix'}">
            ${translate('fixInJOSM')}
       </button>` :
        '';
    const fixableLabel = item.autoFixable ?
        `<span data-editor-id="fix-label" class="label ${clickedClass ? clickedClass : 'label-fixable'}">${translate('fixable')}</span>` :
        '';

    const websiteButton = item.website ?
        `<a href="${item.website}" class="btn btn-website" target="_blank">${translate('website')}</a>` :
        '';

    return { websiteButton, fixableLabel, josmFixButton, fixButton, editorButtons, noteButton };
}

/**
* Formats a timestamp into a localized relative time string.
* @param {string} timestamp - ISO 8601 string.
* @returns {string} Localized string (e.g., "2 hours ago", "3 weeks ago").
*/
function getRelativeTime(timestamp) {
    const lang = document.documentElement.lang || 'en';
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'always' });

    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((past - now) / 1000);

    const units = [
        { unit: 'hour', seconds: 3600, threshold: 86400 },       // < 24 hours
        { unit: 'day', seconds: 86400, threshold: 1209600 },     // < 14 days
        { unit: 'week', seconds: 604800, threshold: 5184000 },     // < 60 days
        { unit: 'month', seconds: 2592000, threshold: 31536000 },    // < 365 days
        { unit: 'year', seconds: 31536000, threshold: Infinity }
    ];

    for (const { unit, seconds, threshold } of units) {
        if (Math.abs(diffInSeconds) < threshold) {
            return rtf.format(Math.round(diffInSeconds / seconds), unit);
        }
    }
}

/**
 * Decodes HTML entities in a string.
 * @param {string} encodedString - The string to be decoded.
 * @returns {string}
 */
export function decodeHtmlEntities(encodedString) {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = encodedString;
    return textArea.value;
}
