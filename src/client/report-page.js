/**
 * Sends a command to the JOSM Remote Control API.
 * Prevents the default link action and provides user feedback in the console.
 * @param {string} url - The JOSM Remote Control URL to fetch.
 * @param {Event} event - The click event, to prevent its default action.
 */
function openInJosm(url, event) {
    event.preventDefault();
    fetch(url)
        .then(response => {
            if (response.ok) {
                console.log('JOSM command sent successfully.');
            } else {
                console.error('Failed to send command to JOSM. Please ensure JOSM is running with Remote Control enabled.');
            }
        })
        .catch(error => {
            console.error('Could not connect to JOSM Remote Control. Please ensure JOSM is running.', error);
        });
}

/**
 * Checks if the current viewport width corresponds to a mobile device.
 * @returns {boolean} True if the viewport is likely a mobile device.
 */
function isMobileView() {
    // This checks if the viewport width is less than a common tablet/desktop breakpoint (e.g., 768px for Tailwind's 'md')
    return window.matchMedia("(max-width: 767px)").matches;
}

const DEFAULT_EDITORS = isMobileView() ? DEFAULT_EDITORS_MOBILE : DEFAULT_EDITORS_DESKTOP;

const settingsToggle = document.getElementById('settings-toggle');
const settingsMenu = document.getElementById('editor-settings-menu');

let currentActiveEditors = [];

// Storage & Utility Functions

/**
 * Loads the user's preferred editor settings from localStorage.
 * If no settings are found, it falls back to the default editors.
 */
function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            currentActiveEditors = JSON.parse(saved);
            return;
        }
    } catch (e) {
        console.error("Error loading settings from localStorage:", e);
    }
    // Fallback to defaults
    currentActiveEditors = [...DEFAULT_EDITORS]; 
}

/**
 * Saves the current editor visibility settings to localStorage.
 */
function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentActiveEditors));
    } catch (e) {
        console.error("Error saving settings to localStorage:", e);
    }
}

// UI Rendering and Event Handlers

/**
 * Renders the editor selection checkboxes inside the settings menu
 * based on the list of all available editors.
 */
function createSettingsCheckboxes() {
    settingsMenu.innerHTML = '';

    ALL_EDITOR_IDS.forEach(id => {
        const isChecked = currentActiveEditors.includes(id);
        const checkboxHtml = `
            <div class="flex items-center justify-between py-5 px-5">
                <label for="editor-${id}" class="text-sm text-gray-700 dark:text-gray-300 w-full text-right mr-2">${id}</label>
                <input id="editor-${id}" type="checkbox" data-editor-id="${id}" ${isChecked ? 'checked' : ''}
                    class="h-4 w-4 text-blue-600 border-gray-300 rounded-sm focus:ring-blue-500 flex-shrink-0">
            </div>
        `;
        settingsMenu.insertAdjacentHTML('beforeend', checkboxHtml);
    });

    settingsMenu.addEventListener('change', handleEditorChange);
}

/**
 * Handles the change event for editor visibility checkboxes.
 * Updates the \`currentActiveEditors\` array and saves the settings.
 * @param {Event} event - The change event from the checkbox.
 */
function handleEditorChange(event) {
    const checkbox = event.target;
    if (checkbox.type === 'checkbox') {
        const editorId = checkbox.dataset.editorId;
        
        if (checkbox.checked) {
            if (!currentActiveEditors.includes(editorId)) {
                currentActiveEditors.push(editorId);
            }
        } else {
            currentActiveEditors = currentActiveEditors.filter(id => id !== editorId);
        }
        
        saveSettings();
        applyEditorVisibility();
    }
}

// Visibility Application

/**
 * Shows or hides editor buttons on the page based on the user's
 * current visibility settings in \`currentActiveEditors\`.
 */
function applyEditorVisibility() {
    // Find all editor buttons using the data-editor-id attribute
    const buttons = document.querySelectorAll(':not(input)[data-editor-id]');
    
    buttons.forEach(button => {
        const editorId = button.dataset.editorId;
        
        // Special handling for the JOSM Fix button: always visible if JOSM is active
        // Display fix label if fix button is invisible
        if (editorId === 'josm-fix') {
            const isVisible = currentActiveEditors.includes('JOSM');
            button.style.display = isVisible ? 'inline-flex' : 'none';
            return;
        }
        if (editorId === 'fix-label') {
            const isVisible = !currentActiveEditors.includes('JOSM');
            button.style.display = isVisible ? 'inline-flex' : 'none';
            return;
        }
        
        const isVisible = currentActiveEditors.includes(editorId);
        button.style.display = isVisible ? 'inline-flex' : 'none';
    });
}

// Initialization

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    createSettingsCheckboxes();
    applyEditorVisibility();

    settingsToggle.addEventListener('click', (event) => {
        settingsMenu.classList.toggle('hidden');
        event.stopPropagation(); // Stop click from propagating to document listener
    });
    
    // Close the menu if user clicks outside
    document.addEventListener('click', (event) => {
        if (!settingsMenu.contains(event.target) && !settingsToggle.contains(event.target)) {
            settingsMenu.classList.add('hidden');
        }
    });
});


// Page generation

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
            <div class="list-item-phone-value-container">
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
 * Creates the website and editor buttons for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @returns {{
 * websiteButton: Element,
 * fixableLabel: Element,
 * josmFixButton: Element,
 * editorButtons: Element[]
 * }}
 */
function createButtons(item) {
    const josmFixUrl = createJosmFixUrl(item);

    // Generate buttons for ALL editors so client-side script can hide them
    const editorButtons = ALL_EDITOR_IDS.map(editorId => {
        const editor = OSM_EDITORS[editorId];
        if (!editor) return '';

        const url = editor.getEditLink(item);
        const text = editor.editInString;
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
            ${FIX_IN_JOSM_STR}
        </a>` :
        '';
    const fixableLabel = item.autoFixable ?
        `<span data-editor-id="fix-label" class="label label-fixable">${FIXABLE_STR}</span>` :
        '';

    const websiteButton = item.website ?
        `<a href="${item.website}" class="btn btn-website" target="_blank">${WEBSITE_STR}</a>` :
        '';

    return { websiteButton, fixableLabel, josmFixButton, editorButtons };
}

/**
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @returns {string}
 */
function createListItem(item) {

    const { websiteButton, fixableLabel, josmFixButton, editorButtons } = createButtons(item);

    return `
        <li class="report-list-item">
            <div class="list-item-content-wrapper">
                <a class="list-item-icon-circle-preview" href="${item.osmUrl}" target="_blank" rel="noopener noreferrer">
                    ${item.iconHtml}
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
                ${websiteButton}
                ${fixableLabel}
                ${josmFixButton}
                ${editorButtons} 
            </div>
        </li>
    `;
}

function renderNumbers() {
    const autofixableNumbers = invalidItemsClient.filter(item => item.autoFixable);
    const manualFixNumbers = invalidItemsClient.filter(item => !item.autoFixable);

    const anyInvalid = manualFixNumbers.length > 0;
    const anyFixable = autofixableNumbers.length > 0;

    const fixableListContent = autofixableNumbers.map(item => createListItem(item)).join('');
    const invalidListContent = manualFixNumbers.map(item => createListItem(item)).join('');

    const fixableSectionAndHeader = `
        <div class="section-header-container">
            <h2 class="section-header">${FIXABLE_NUMBERS_STR}</h2>
            <p class="section-description">${FIXABLE_DESCRIPTION_STR}</p>
        </div>
        <ul class="report-list">
            ${fixableListContent}
        </ul>`;

    const invalidSectionAndHeader = `
        <div class="text-center">
            <h2 class="section-header">${INVALID_NUMBERS_STR}</h2>
            <p class="section-description">${INVALID_DESCRIPTION_STR}</p>
        </div>
        <ul class="report-list">
            ${invalidListContent}
        </ul>`;

    const noInvalidContent = `<li class="report-list-item-empty">${NO_INVALID_STR}</li>`;

    const fixableAndInvalidSectionContent =
        (anyFixable && anyInvalid) ? fixableSectionAndHeader + invalidSectionAndHeader :
            anyFixable ? fixableSectionAndHeader :
                anyInvalid ? invalidSectionAndHeader :
                    noInvalidContent


    const fixableAndInvalidSct = document.getElementById("fixableAndInvalidSection");
    fixableAndInvalidSct.innerHTML = fixableAndInvalidSectionContent;
}

renderNumbers();

module.exports = {
    createJosmFixUrl,
};
