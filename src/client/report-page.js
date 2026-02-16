let fixableCurrentPage = 1;
let invalidCurrentPage = 1;
let pageSize = 50;
let fixableSortKey = 'none'; // 'name', 'invalid', 'fixable'
let fixableSortDirection = 'asc'; // 'asc', 'desc'
let invalidSortKey = 'none'; // 'name', 'invalid'
let invalidSortDirection = 'asc'; // 'asc', 'desc'

/**
 * Global variable storing the last loaded report data.
 * @type {Array<Object>|null}
 */
let reportData = null;

let noteButtonClickHandler = null;

const CLICKED_ITEMS_KEY = `clickedItems_${DATA_LAST_UPDATED}`;
const UPLOADED_ITEMS_KEY = `uploaded_${DATA_LAST_UPDATED}`;

/**
 * Adds an item's ID to localStorage to mark it as clicked.
 * @param {string} itemId - The unique ID of the item (e.g., "way/12345").
 */
function recordItemClick(itemId) {
    try {
        const clickedItems = JSON.parse(localStorage.getItem(CLICKED_ITEMS_KEY)) || {};
        clickedItems[itemId] = true;
        localStorage.setItem(CLICKED_ITEMS_KEY, JSON.stringify(clickedItems));
    } catch (e) {
        console.error("Could not save clicked item to localStorage:", e);
    }
}

/**
 * Clears an item's ID from localStorage to stop marking it as clicked.
 * @param {string} itemId - The unique ID of the item (e.g., "way/12345").
 */
function clearItemClick(itemId) {
    try {
        const clickedItems = JSON.parse(localStorage.getItem(CLICKED_ITEMS_KEY)) || {};
        clickedItems[itemId] = false;
        localStorage.setItem(CLICKED_ITEMS_KEY, JSON.stringify(clickedItems));
    } catch (e) {
        console.error("Could not save clicked item to localStorage:", e);
    }
}

/**
 * Applies the 'clicked' visual state to all buttons of a specific item.
 * @param {string} itemId - The unique ID of the item (e.g., "way/12345").
 */
function setButtonsAsClicked(itemId) {
    const listItem = document.querySelector(`li[data-item-id="${itemId}"]`);
    if (listItem) {
        const buttons = listItem.querySelectorAll(':not(input)[data-editor-id]');
        buttons.forEach(button => {
            button.classList.remove('btn-josm-fix');
            button.classList.remove('btn-editor');
            button.classList.remove('label-fixable');
            button.classList.add('btn-clicked');
        });
    }
}

/**
 * Checks if an item has been clicked by looking it up in localStorage.
 * @param {string} itemId - The unique ID of the item (e.g., "way/12345").
 * @returns {boolean} - True if the item is in the clicked items list, false otherwise.
 */
function isItemClicked(itemId) {
    try {
        const clickedItems = JSON.parse(localStorage.getItem(CLICKED_ITEMS_KEY)) || {};
        return clickedItems.hasOwnProperty(itemId) && clickedItems[itemId];
    } catch (e) {
        console.error("Could not read clicked items from localStorage:", e);
        return false;
    }
}

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
                    class="h-4 w-4 text-blue-600 border-gray-300 rounded-sm focus:ring-blue-500 shrink-0">
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
        if (editorId === 'apply-fix') {
            button.style.display = 'inline-flex';
            return;
        }
        if (editorId === 'note-btn') {
            button.style.display = 'inline-flex';
            return;
        }
        if (editorId === 'josm-fix') {
            const isVisible = currentActiveEditors.includes('JOSM');
            button.style.display = isVisible ? 'inline-flex' : 'none';
            return;
        }
        if (editorId === 'fix-label') {
            // const isVisible = !currentActiveEditors.includes('JOSM');
            // TODO: determine whether to keep this label or just always show the fix button
            const isVisible = false;
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

        const url = editor.getEditLink(item);
        const text = editor.editInString;
        const isJosm = editorId === 'JOSM';

        // Use a standard target="_blank" for non-JOSM/non-GEO links
        const target = isJosm ? '' : (editorId === 'Geo' ? '' : 'target="_blank"');

        // JOSM requires an onclick handler; others use a direct href
        const href = isJosm ? '#' : url;
        const onClick = isJosm ? `openInJosm('${url}', event);` : '';
        const itemId = `${item.type}/${item.id}`;

        return `
            <a href="${href}" ${target} onclick="recordItemClick('${itemId}'); setButtonsAsClicked('${itemId}'); ${onClick}"
                data-editor-id="${editorId}"
                class="btn ${clickedClass ? clickedClass : 'btn-editor'}">
                ${text}
            </a>
        `;
    }).join('\n');

    const fixButton = item.autoFixable ?
        `<button onclick="applyFix('${item.type}', ${item.id})"
            data-editor-id="apply-fix"
            class="btn cursor-pointer ${clickedClass ? clickedClass : 'btn-josm-fix'}">
            ${translate('applyFix')}
        </button>` :
        '';

    const createdNotes = JSON.parse(localStorage.getItem(`createdNotes_${subdivisionName}`)) || [];
    const noteClickedClass = createdNotes.includes(`${item.type}/${item.id}`) ? 'btn-clicked' : 'btn-note';
    const noteButton = item.autoFixable ? '' :
        `<button onclick="addNote('${item.type}', ${item.id})"
            data-editor-id="note-btn"
            class="btn cursor-pointer ${noteClickedClass}">
            ${translate('openNote')}
        </button>`

    const josmFixButton = item.josmFixUrl ?
        `<a href="#" onclick="recordItemClick('${item.type}/${item.id}'); setButtonsAsClicked('${item.type}/${item.id}'); openInJosm('${item.josmFixUrl}', event)"
            data-editor-id="josm-fix"
            class="btn ${clickedClass ? clickedClass : 'btn-josm-fix'}">
            ${translate('fixInJOSM')}
        </a>` :
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
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @returns {string} The full HTML string for the list item element.
 */
function createListItem(item) {

    const itemId = `${item.type}/${item.id}`;
    const clickedClass = isItemClicked(itemId) ? 'btn-clicked' : '';

    const { websiteButton, fixableLabel, josmFixButton, fixButton, editorButtons, noteButton } = createButtons(item, clickedClass);

    iconHtml = item.iconName ? `<span class="icon-svg-container"><svg class="icon-svg"><use href="#${item.iconName}"></use></svg></span>` : item.iconHtml;

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
                <div class="flex flex-wrap gap-2 justify-end">
                    ${websiteButton}
                    ${fixableLabel}
                    ${fixButton}
                    ${noteButton}
                </div>
                <div class="flex flex-wrap gap-2 justify-end">
                    ${josmFixButton}
                    ${editorButtons}
                </div>
            </div>
        </li>
    `;
}

/**
 * Helper to retrieve the first non-null value in an object.
 * Used for getting the phone number string from invalidNumbers or suggestedFixes objects.
 * @param {Object} obj - The object to extract the value from (e.g., { "phone": "123" }).
 * @returns {string} The first non-null value, or an empty string if none is found.
 */
function getFirstNonNullValue(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return '';
    }

    const values = Object.values(obj);

    for (const value of values) {
        if (value !== null && value !== undefined) {
            return value; // Return the first one found
        }
    }

    return '';
}

/**
 * Sorts an array of report items based on a specified key and direction.
 * Sorting by 'invalid' or 'fixable' uses the value of the first key within
 * the corresponding nested object (e.g., item.invalidNumbers.phone).
 *
 * @param {Array<Object>} items - The list of report items to be sorted. Each item must contain
 * 'featureTypeName', 'invalidNumbers' ({[key: string]: string}), and 'suggestedFixes' ({[key: string]: string}).
 * @param {('none'|'name'|'invalid'|'fixable')} key - The column key to sort by.
 * - 'name': Sorts by the item's 'featureTypeName'.
 * - 'invalid': Sorts by the first value in 'invalidNumbers'.
 * - 'fixable': Sorts by the first value in 'suggestedFixes'.
 * - 'none': Returns the original array unsorted.
 * @param {('asc'|'desc')} direction - The sort order: 'asc' for ascending, 'desc' for descending.
 * @returns {Array<Object>} A new, sorted array of items. Returns the original array copy if key is 'none'.
 */
function sortItems(items, key, direction) {
    if (key === 'none') return items;

    const sortedItems = [...items];

    sortedItems.sort((a, b) => {
        let valA, valB;

        switch (key) {
            case 'name':
                valA = a.featureTypeName ? a.featureTypeName.toUpperCase() : null;
                valB = b.featureTypeName ? b.featureTypeName.toUpperCase() : null;
                break;
            case 'invalid':
                // Get the value of the first key in invalidNumbers
                valA = getFirstNonNullValue(a.invalidNumbers);
                valB = getFirstNonNullValue(b.invalidNumbers);
                break;
            case 'fixable':
                // Get the value of the first key in suggestedFixes
                // If there isn't one, get the first from invalid numbers
                // (suggested might be null if the value is being removed)

                let firstA = getFirstNonNullValue(a.suggestedFixes);
                if (!firstA) {
                    firstA = getFirstNonNullValue(a.invalidNumbers)
                }

                let firstB = getFirstNonNullValue(b.suggestedFixes);
                if (!firstB) {
                    firstB = getFirstNonNullValue(b.invalidNumbers)
                }

                valA = firstA;
                valB = firstB;
                break;
            default:
                return 0;
        }

        // null values go to the start for ascending sort.
        const aIsNull = valA === null || valA === undefined;
        const bIsNull = valB === null || valB === undefined;

        // Null comparison
        if (aIsNull && bIsNull) {
            return 0;
        }
        if (aIsNull) {
            return direction === 'asc' ? -1 : 1;
        }
        if (bIsNull) {
            return direction === 'asc' ? 1 : -1;
        }

        if (key === 'name') {
            return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        // Regular comparison
        if (valA < valB) {
            return direction === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
            return direction === 'asc' ? 1 : -1;
        }
        return 0; // values are equal
    });

    return sortedItems;
}

/**
 * Renders a paginated list section with controls.
 * @param {string} containerId - The ID of the HTML element to render into.
 * @param {Array<Object>} items - The full array of items for this section.
 * @param {string} headerStr - The main heading text.
 * @param {string} descriptionStr - The description text.
 * @param {number} currentPage - The current page number for this section.
 * @param {function} setCurrentPageFn - Function to call to update the current page in the global state (e.g., setFixableCurrentPage).
 * @param {boolean} isFixableSection - True if rendering the autofixable section (used for unique IDs).
 */
function renderPaginatedSection(
    containerId,
    items,
    headerStr,
    descriptionStr,
    currentPage,
    setCurrentPageFn,
    isFixableSection
) {
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    // e.g. when uploading, there could be fewer pages than there were
    if (currentPage > totalPages) {
        currentPage = totalPages;
        setCurrentPageFn(totalPages);
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);

    const itemsOnPage = items.slice(startIndex, endIndex);
    const listContent = itemsOnPage.map(item => createListItem(item)).join('');

    const currentSortKey = isFixableSection ? fixableSortKey : invalidSortKey;

    const getSortStyle = (key) => {
        if (currentSortKey === key) {
            return 'sort-btn-style-active'
        } else {
            return 'sort-btn-style-inactive'
        }
    };

    // Unique ID suffix for this section's controls
    const suffix = isFixableSection ? 'fixable' : 'invalid';

    const pageControls = totalItems > pageSize ? `
        <div class="page-btns-container">
            <button id="prevPage${suffix}" onclick="changePage('${suffix}', -1)"
                    class="page-btn
                            ${currentPage <= 1 ? 'page-btn-disabled' : 'page-btn-active'}"
                    ${currentPage <= 1 ? 'disabled' : ''}>
                ${translate('previous')}
            </button>
            <span class="page-numbers">
                ${translate('pageOf', { '%n': currentPage, '%t': totalPages })}
            </span>
            <button id="nextPage${suffix}" onclick="changePage('${suffix}', 1)"
                    class="page-btn
                            ${currentPage >= totalPages ? 'page-btn-disabled' : 'page-btn-active'}"
                    ${currentPage >= totalPages ? 'disabled' : ''}>
                    ${translate('next')}
            </button>
        </div>` : '<div></div>';

    const saveRow = isFixableSection ? `
        <div class="save-undo-row">
            <span class="flex items-center">
                <button id="undo-btn" class="btn-undo-redo gray-btn-disabled" onclick="undoChange()" disabled><svg class="icon-svg"><use href="#icon-undo"></use></svg></button>
                <button id="redo-btn" class="btn-undo-redo gray-btn-disabled" onclick="redoChange()" disabled><svg class="icon-svg"><use href="#icon-redo"></use></svg></button>
            </span>
            <div id="save-btn-container">
                <button id="save-btn" class="btn-squared gray-btn-disabled" onclick="openUploadModal()" disabled>${translate('save')}</button>
            </div>
        </div>` : '';

    const pageAndSortControls = `
        ${pageControls}
        <div class="sort-controls">
            ${isFixableSection ? '' : '<div></div>'}
            <span class="sort-label">${translate('sortBy')}</span>
            <button onclick="handleSort('${suffix}', 'name')"
                    class="sort-btn sort-btn-style ${getSortStyle('name')}">
                ${translate('name')}
            </button>
            ${isFixableSection ? `
            <button onclick="handleSort('${suffix}', 'fixable')"
                    class="sort-btn sort-btn-style ${getSortStyle('fixable')}">
                ${translate('suggestedFix')}
            </button>` : ''}
            <button onclick="handleSort('${suffix}', 'invalid')"
                    class="sort-btn sort-btn-style ${getSortStyle('invalid')}">
                    ${translate('invalidNumber')}
            </button>
        </div>`

    const paginationSortCard = `
        <div class="page-sort-card">
            ${isFixableSection ? `
                <div class="save-sort-container">
                    <div>${saveRow}</div>
                    <div class="page-sort-controls">${pageAndSortControls}</div>
                </div>
                `
            : pageAndSortControls}
        </div>
    `;

    const sectionContent = `
        <div class="section-header-container ${isFixableSection ? '' : 'text-center'}">
            <h2 class="section-header">${headerStr}</h2>
            <p class="section-description">${descriptionStr}</p>
        </div>
        ${paginationSortCard}
        <ul class="report-list mt-4" id="${isFixableSection ? 'report-list-fixable' : 'report-list-invalid'}">
            ${totalItems > 0 ? listContent : ''}
        </ul>
    `;

    document.getElementById(containerId).innerHTML = sectionContent;
}

// --- Helper Functions for Pagination Control and sorting ---

/**
 * Handles pagination control logic by calculating the new current page,
 * updating the relevant global state variable (fixableCurrentPage or invalidCurrentPage),
 * triggering a full re-render, and smoothly scrolling to the section.
 * @param {('Fixable'|'Invalid')} section - The section being navigated ('Fixable' for autofixable, 'Invalid' for manual fix).
 * @param {number} delta - The change in page number, typically +1 for Next or -1 for Previous.
 */
function changePage(section, delta) {
    if (!reportData) {
        console.error("Cannot change page before data is loaded.");
        return;
    }
    if (section === 'fixable') {
        const totalPages = Math.ceil(reportData.filter(item => item.autoFixable).length / pageSize);
        fixableCurrentPage = Math.max(1, Math.min(totalPages, fixableCurrentPage + delta));
        renderNumbers(); // Re-render the whole page to update the state
    } else if (section === 'invalid') {
        const totalPages = Math.ceil(reportData.filter(item => !item.autoFixable).length / pageSize);
        invalidCurrentPage = Math.max(1, Math.min(totalPages, invalidCurrentPage + delta));
        renderNumbers(); // Re-render the whole page
    }
    document.getElementById(`${section}Section`).scrollIntoView({ 'behavior': 'smooth' });
}

/**
 * Handles the user request to sort a report section. It toggles the sort direction
 * if the same key is clicked, or sets a new key and resets the direction to ascending.
 * It also resets the current page to 1 and triggers a full UI re-render and a smooth scroll.
 * @param {('Fixable'|'Invalid')} section - The section being sorted ('fixable' for autofixable, 'invalid' for manual fix).
 * @param {('name'|'invalid'|'fixable')} newKey - The column key requested for sorting.
 */
function handleSort(section, newKey) {
    let currentKey, currentDirection;

    if (section === 'fixable') {
        currentKey = fixableSortKey;
        currentDirection = fixableSortDirection;
    } else { // 'invalid'
        currentKey = invalidSortKey;
        currentDirection = invalidSortDirection;
    }

    if (newKey === currentKey) {
        // Same key clicked, toggle direction
        if (section === 'fixable') {
            fixableSortDirection = (currentDirection === 'asc') ? 'desc' : 'asc';
        } else {
            invalidSortDirection = (currentDirection === 'asc') ? 'desc' : 'asc';
        }
    } else {
        // New key clicked, set key and default to ascending
        if (section === 'fixable') {
            fixableSortKey = newKey;
            fixableSortDirection = 'asc';
        } else {
            invalidSortKey = newKey;
            invalidSortDirection = 'asc';
        }
    }

    // Reset to the first page after sorting
    if (section === 'fixable') fixableCurrentPage = 1;
    else invalidCurrentPage = 1;

    renderNumbers();
    document.getElementById(`${section}Section`).scrollIntoView({ 'behavior': 'smooth' });
}

/**
 * Retrieves the subset of report items (either autofixable or manual fix)
 * that have not been marked as edited or uploaded, and applies the current
 * section-specific sorting parameters.
 *
 * @param {boolean} fixable - True to get autofixable items, false for manual fix items.
 * @returns {Array<Object>} A new, sorted array of items for the specified section.
 */
function getSortedItems(fixable) {
    const edits = JSON.parse(localStorage.getItem('edits')) || {};
    const uploadedChanges = JSON.parse(localStorage.getItem(UPLOADED_ITEMS_KEY));

    const targetItems = reportData.filter(item => {
        const isWanted = fixable ? item.autoFixable : !item.autoFixable;
        const isNotInUploadedChanges = !(
            uploadedChanges?.[subdivisionName]?.[item.type]?.[item.id]
        );
        const isNotInCurrentEdits = !(
            edits?.[subdivisionName]?.[item.type]?.[item.id]
        );
        return isWanted && isNotInUploadedChanges && isNotInCurrentEdits;
    });

    const sortKey = fixable ? fixableSortKey : invalidSortKey;
    const sortDirection = fixable ? fixableSortDirection : invalidSortDirection;
    const sortedItems = sortItems(targetItems, sortKey, sortDirection);
    return sortedItems;
}

let firstLoad = true;

/**
 * Main rendering function for the phone number report.
 * It filters the raw data, applies the current sorting parameters,
 * clears the display containers, and delegates the rendering of
 * the paginated sections to renderPaginatedSection.
 * @returns {void}
 */
function renderNumbers() {
    if (!reportData) {
        console.error("Attempted to render numbers before data was loaded.");
        return;
    }
    const fixableContainer = document.getElementById("fixableSection");
    const invalidContainer = document.getElementById("invalidSection");
    const noInvalidContainer = document.getElementById("noInvalidSection");

    const edits = JSON.parse(localStorage.getItem('edits')) || {};

    let editCount = 0;
    if (edits && edits[subdivisionName]) {
        for (const type in edits[subdivisionName]) {
            editCount += Object.keys(edits[subdivisionName][type]).length;
        }
    }
    if (firstLoad) {
        if (editCount > 0) {
            openEditsModal(editCount);
        } else {
            undoPosition = 0;
            undoStack = [];
        }
    }

    const sortedFixable = getSortedItems(true);
    const sortedInvalid = getSortedItems(false);

    const anyInvalid = sortedInvalid.length > 0;
    const anyFixable = sortedFixable.length > 0;

    // Clear all containers first
    fixableContainer.innerHTML = '';
    invalidContainer.innerHTML = '';
    noInvalidContainer.innerHTML = '';

    if (anyFixable || anyInvalid || editCount > 0) {
        if (anyFixable || editCount > 0) {
            renderPaginatedSection(
                "fixableSection",
                sortedFixable,
                translate('fixableNumbersHeader'),
                translate('fixableNumbersDescription'),
                fixableCurrentPage,
                (page) => fixableCurrentPage = page, // Setter function for fixableCurrentPage
                true // isFixableSection
            );
        }

        if (anyInvalid) {
            renderPaginatedSection(
                "invalidSection",
                sortedInvalid,
                translate('invalidNumbersHeader'),
                translate('invalidNumbersDescription'),
                invalidCurrentPage,
                (page) => invalidCurrentPage = page, // Setter function for invalidCurrentPage
                false // isFixableSection
            );
        }
    } else {
        // No invalid numbers found at all
        noInvalidContainer.innerHTML = `
            <p class="report-list-item-empty">${translate('noInvalidNumbers')}</p>
        `;
    }
    applyEditorVisibility();
    setUpSaveBtn();
    setUpUndoRedoBtns();
    firstLoad = false;
}

/**
 * Filters the createdNotes array to keep only the elements
 * that have a corresponding type/id in the reportData array.
 *
 * @param {string[]} createdNotes An array of strings like 'node/1234'.
 * @param {object[]} reportData An array of objects, where each object has a 'type' and an 'id' property.
 * @returns {string[]} The filtered createdNotes array.
 */
function filterCreatedNotes(createdNotes, reportData) {
    const reportDataIds = new Set(
        reportData.map(item => `${item.type}/${item.id}`)
    );

    const filteredNotes = createdNotes.filter(id => {
        return reportDataIds.has(id);
    });

    return filteredNotes;
}

/**
 * Initializes the report page by fetching the report data from the defined
 * path and then triggering the main rendering function. Displays an error
 * if data loading fails.
 * @async
 * @returns {void}
 */
async function initReportPage() {
    try {
        const response = await fetch(DATA_FILE_PATH);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        reportData = await response.json();
    } catch (error) {
        console.error("Failed to load phone validation data:", error);
        // Display an error message to the user if data loading fails
        const container = document.getElementById("reportContainer");
        if (container) {
            container.innerHTML = '<p class="text-red-500 font-bold">Error: Could not load report data. Please check the network connection and the data file path.</p>';
        }
        return;
    }

    // Check stored ids of elements that have had notes created and clear any no longer in report data (presume fixed)
    let createdNotes = JSON.parse(localStorage.getItem(`createdNotes_${subdivisionName}`)) || [];
    const updatedNotes = filterCreatedNotes(createdNotes, reportData);
    localStorage.setItem(`createdNotes_${subdivisionName}`, JSON.stringify(updatedNotes));

    renderNumbers();
}

// OSM editing

const redirectUrl = "https://confusedbuffalo.github.io/phone-report/land.html";
let undoStack = JSON.parse(localStorage.getItem(`undoStack_${subdivisionName}`)) ?? [];
let undoPosition = +localStorage.getItem(`undoPosition_${subdivisionName}`) ?? 0;
const uploadSpinner = document.getElementById('upload-spinner');

/**
 * Initiates the OAuth 2.0 login flow with the OpenStreetMap (OSM) API.
 * Uses a popup mode and requests specific scopes (write_api, read_prefs, write_notes).
 * Upon successful login, it calls initLogin. Displays an error on failure.
 * @returns {void}
 */
function login() {
    const errorDiv = document.querySelector("#error-div");
    errorDiv.innerText = "";
    errorDiv.hidden = true;

    OSM.login({
        mode: "popup",
        clientId: "bexjmcD0H12VKCGMYNmbIA10FYh1O96vgF4-1xH6qKs",
        redirectUrl: redirectUrl,
        scopes: ["write_api", "read_prefs", "write_notes"],
    })
        .then(initLogin)
        .catch((err) => {
            errorDiv.hidden = false;
            errorDiv.innerText = `${err}`;
        });
}

/**
 * Logs the user out of the OSM API and clears the local storage of the display name.
 * Triggers re-initialization of the login state.
 * @returns {void}
 */
function logout() {
    OSM.logout();
    localStorage.removeItem('osm_display_name');
    initLogin();
}

/**
 * Fetches the currently logged-in OSM user's details and updates the logout button text
 * to include the user's display name. Stores the display name in localStorage.
 * Handles errors if the user is not logged in or the request fails.
 * @returns {void}
 */
function getUser() {
    const logoutBtn = document.getElementById("logout-btn");
    const errorDiv = document.getElementById("error-div");
    const displayName = localStorage.getItem('osm_display_name');

    if (displayName) {
        logoutBtn.innerText = `Logout ${displayName}`;
        return;
    }

    OSM.getUser("me")
        .then((result) => {
            logoutBtn.innerText = `Logout ${result.display_name}`;
            localStorage.setItem('osm_display_name', result.display_name);
            errorDiv.innerText = '';
            errorDiv.hidden = true;
        })
        .catch((err) => {
            logoutBtn.innerText = `${err}`;
        });
}

/**
 * Checks the OSM login status and updates the visibility and text of the
 * login and logout buttons accordingly. Calls getUser if logged in.
 * @returns {void}
 */
function initLogin() {
    if (OSM.isLoggedIn()) {
        document.getElementById("logout-btn").hidden = false;
        document.getElementById("login-btn").hidden = true;
        getUser();
    } else {
        document.getElementById("logout-btn").hidden = true;
        document.getElementById("login-btn").hidden = false;
    }
}

/**
 * Applies a set of tag edits (key-value pairs) to an OSM feature's 'tags' object.
 * If an edit value is explicitly set to null, the corresponding tag key is deleted
 * from the feature's tags.
 *
 * @param {object} feature - The feature object (node, way, or relation) containing the 'tags' object.
 * @param {object} elementEdits - The object of key-value edits to apply. A value of null indicates a deletion.
 * @returns {boolean} Whether any changes were made
 */
function applyEditsToFeatureTags(feature, elementEdits) {
    let changed = false;

    // visible is false for deleted objects and unset for normal objects
    const isDeleted = (feature.visible ?? true) === false;

    // If a feature does not have any tags, it has dramatically changed since it was originally fetched
    if (isDeleted || !feature.tags || typeof feature.tags !== 'object') {
        return false;
    }

    const item = reportData.find(item => {
        return item.id === feature.id && item.type === feature.type;
    });

    const tags = feature.tags;

    for (const key in elementEdits) {
        if (Object.hasOwn(elementEdits, key)) {
            const value = elementEdits[key];

            // If any of the target tags have changed, make no changes
            // originalValue could be undefined or null when a new tag is being added (moving from mobile or adding mnemonic)
            const originalValue = item.invalidNumbers?.[key];
            if (originalValue !== undefined && originalValue !== null && tags[key] !== originalValue) {
                return false;
            }

            if (value === null) {
                if (Object.hasOwn(tags, key)) {
                    delete tags[key];
                    changed = true;
                }
            } else if (tags[key] !== value) {
                tags[key] = value;
                changed = true;
            }
        }
    }

    return changed;
}

/**
 * Moves the currently saved local edits for the current subdivision from the
 * 'edits' localStorage key to the 'uploaded' localStorage key, and then clears
 * the edits for the subdivision from the 'edits' key.
 * This function is called after a successful OSM upload.
 * @returns {void}
 */
function moveEditsToUploadedStorage() {
    let edits = JSON.parse(localStorage.getItem('edits')) || {};
    let uploadedChanges = JSON.parse(localStorage.getItem(UPLOADED_ITEMS_KEY));

    if (uploadedChanges && uploadedChanges[subdivisionName]) {
        for (const type in edits[subdivisionName]) {
            uploadedChanges[subdivisionName][type] = {
                ...edits[subdivisionName][type] || {},
                ...uploadedChanges[subdivisionName][type]
            }
        }
    } else if (uploadedChanges) {
        uploadedChanges[subdivisionName] = edits[subdivisionName]
    } else {
        uploadedChanges = {};
        uploadedChanges[subdivisionName] = edits[subdivisionName]
    }

    localStorage.setItem(UPLOADED_ITEMS_KEY, JSON.stringify(uploadedChanges));
    delete edits[subdivisionName];
    localStorage.setItem('edits', JSON.stringify(edits));
}

/**
 * Asynchronously uploads the local edits for the current subdivision to OpenStreetMap
 * as a single changeset. It fetches the latest feature data, applies the local
 * edits, checks for actual tag changes, and then calls the OSM API to upload.
 *
 * @async
 * @returns {Promise<number|undefined>} A promise that resolves with the new changeset ID if modifications were uploaded, or undefined if no modifications were submitted.
 */
async function uploadChanges() {
    let edits = JSON.parse(localStorage.getItem('edits')) || {};

    let modifications = [];
    const subdivisionEdits = edits[subdivisionName];

    const elementTypes = ['node', 'way', 'relation'];

    const MAX_FEATURES_PER_FETCH = 500;

    for (const type of elementTypes) {
        const editsForType = subdivisionEdits[type];

        if (editsForType) {
            const featureIds = Object.keys(editsForType);

            if (featureIds.length > 0) {
                const featureIdChunks = [];
                for (let i = 0; i < featureIds.length; i += MAX_FEATURES_PER_FETCH) {
                    featureIdChunks.push(featureIds.slice(i, i + MAX_FEATURES_PER_FETCH));
                }

                let allFeatures = [];
                for (const chunk of featureIdChunks) {
                    const features = await OSM.getFeatures(type, chunk);
                    allFeatures.push(...features);
                }

                for (const feature of allFeatures) {
                    changed = applyEditsToFeatureTags(feature, editsForType[feature.id])
                    if (changed) {
                        modifications.push(feature);
                    }
                }
            }
        }
    }

    if (modifications.length > 0) {
        const result = await OSM.uploadChangeset(
            { ...CHANGESET_TAGS, ...{ 'comment': commentBox.value.trim() } },
            { create: [], modify: modifications, delete: [] }
        );
        moveEditsToUploadedStorage();
        return result;
    }

    moveEditsToUploadedStorage();
}

const uploadCloseBtnTop = document.getElementById('upload-close-modal-btn-top');
const uploadCancelBtn = document.getElementById('cancel-modal-btn');
const uploadCloseBtnBottom = document.getElementById('close-modal-btn-bottom');
const uploadBtn = document.getElementById('upload-changes-btn');
const uploadModal = document.getElementById('upload-modal-overlay');
const uploadModalTitle = document.getElementById('upload-modal-title');

const editsCloseBtnTop = document.getElementById('edits-close-modal-btn-top');
const editsDiscardBtn = document.getElementById('edits-modal-discard-btn');
const editsKeepBtn = document.getElementById('edits-modal-keep-btn');
const editsModal = document.getElementById('edits-modal-overlay');
const editsModalTitle = document.getElementById('edits-modal-title');

const noteCloseBtnTop = document.getElementById('note-close-modal-btn-top');
const noteCancelBtn = document.getElementById('cancel-note-modal-btn');
const noteCloseBtnBottom = document.getElementById('close-note-modal-btn-bottom');
const addNoteBtn = document.getElementById('add-note-btn');
const noteModal = document.getElementById('note-modal-overlay');
const noteModalTitle = document.getElementById('note-modal-title');

/**
 * Enables the 'Save' button by changing its styling and setting its disabled property to false.
 * @returns {void}
 */
function enableSave() {
    const saveBtn = document.getElementById('save-btn');
    enableGrayBtn(saveBtn);
}

/**
 * Disables the 'Save' button by changing its styling and setting its disabled property to true.
 * @returns {void}
 */
function disableSave() {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) { disableGrayBtn(saveBtn) };
}

/**
 * Enables the 'Undo' button by changing its styling and setting its disabled property to false.
 * @returns {void}
 */
function enableUndo() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) { enableGrayBtn(undoBtn) };
}

/**
 * Disables the 'Undo' button by changing its styling and setting its disabled property to true.
 * @returns {void}
 */
function disableUndo() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) { disableGrayBtn(undoBtn) };
}

/**
 * Enables the 'Redo' button by changing its styling and setting its disabled property to false.
 * @returns {void}
 */
function enableRedo() {
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) { enableGrayBtn(redoBtn) };
}

/**
 * Disables the 'Redo' button by changing its styling and setting its disabled property to true.
 * @returns {void}
 */
function disableRedo() {
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) { disableGrayBtn(redoBtn) };
}

/**
 * Applies the disabled visual and functional state to a gray-style button element.
 * @param {HTMLElement} selector - The button element to disable.
 * @returns {void}
 */
function disableGrayBtn(selector) {
    selector.classList.remove('gray-btn-enabled');
    selector.classList.add('gray-btn-disabled')
    selector.disabled = true;
}

/**
 * Applies the enabled visual and functional state to a gray-style button element.
 * @param {HTMLElement} selector - The button element to enable.
 * @returns {void}
 */
function enableGrayBtn(selector) {
    selector.classList.remove('gray-btn-disabled');
    selector.classList.add('gray-btn-enabled')
    selector.disabled = false;
}

/**
 * Saves a proposed fix for an OpenStreetMap element to the local 'edits' storage.
 * It also marks the item as 'clicked' and adds the action to the undo stack.
 *
 * @param {string} osmType - The OpenStreetMap element type (e.g., 'node', 'way').
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
function saveChangeToStorage(osmType, osmId) {
    let edits = JSON.parse(localStorage.getItem('edits')) || {};
    if (!edits[subdivisionName]) {
        edits[subdivisionName] = {};
    }
    if (!edits[subdivisionName][osmType]) {
        edits[subdivisionName][osmType] = {};
    }

    const item = reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });

    edits[subdivisionName][osmType][osmId] = item["suggestedFixes"];

    localStorage.setItem('edits', JSON.stringify(edits));
    addToUndo(osmType, osmId);
    setUpSaveBtn();
}

/**
 * Animates the insertion of a new list item by smoothly transitioning its
 * `max-height` and `opacity` from a collapsed state.
 * @param {HTMLElement} newListItem - The list item DOM element to animate.
 * @returns {void}
 */
function animateInItem(newListItem) {
    window.requestAnimationFrame(() => {
        const contentHeight = newListItem.scrollHeight;

        window.requestAnimationFrame(() => {
            newListItem.style.maxHeight = `${contentHeight + 100}px`;
            newListItem.style.opacity = '1';
            newListItem.classList.remove('fade-in-start');

            newListItem.addEventListener('transitionend', function handler(e) {
                if (e.propertyName === 'max-height') {
                    if (newListItem.style.maxHeight) {
                        newListItem.style.maxHeight = null;
                        renderNumbers();
                    }
                    if (newListItem.style.opacity) {
                        newListItem.style.opacity = null;
                    }

                    newListItem.removeEventListener('transitionend', handler);
                }
            });
        });
    });
}

/**
 * Finds a report item in the currently sorted list for a given section (fixable/invalid)
 * and returns the item object along with its current index in the sorted array.
 *
 * @param {string} osmType - The OpenStreetMap element type (e.g., 'node', 'way').
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @param {boolean} fixable - True to search the fixable section, false for the invalid section.
 * @returns {{item: Object, index: number}|void} An object containing the item and its index, or void if not found.
 */
function getItemWithIndex(osmType, osmId, fixable) {
    const sortedItems = getSortedItems(fixable);
    const targetItem = sortedItems.filter(item => {
        return item.type === osmType && item.id === osmId;
    });
    if (targetItem.length !== 1) {
        console.log('No item or too many items found');
        return
    }
    item = targetItem[0];
    return {
        'item': item,
        'index': sortedItems.indexOf(item),
    };
}

/**
 * Inserts a newly "undone" item back into the fixable report list with a
 * transition animation, maintaining the current sort order.
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
function transitionInsertItem(osmType, osmId) {
    const sortedItems = getSortedItems(true);
    const { item: newItem, index } = getItemWithIndex(osmType, osmId, true);

    const newListItemHtmlString = createListItem(newItem);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newListItemHtmlString.trim();
    const newListItem = tempDiv.firstChild;

    newListItem.classList.add('fade-in-start');
    const reportList = document.getElementById('report-list-fixable');

    if (index === sortedItems.length - 1) {
        // End of the list
        reportList.appendChild(newListItem);
        applyEditorVisibility();
        animateInItem(newListItem);
    } else if (index >= 0) {
        // Find which item to put it before
        const nextItem = sortedItems.at(index + 1);
        const nextListItem = document.querySelector(`li[data-item-id="${nextItem.type}/${nextItem.id}"]`);

        if (!nextListItem) {
            // Change is happening on a different page
            renderNumbers();
            return
        }

        nextListItem.insertAdjacentElement('beforebegin', newListItem);
        applyEditorVisibility();

        animateInItem(newListItem);
    } else {
        console.error('Target item to insert not found')
    }
}

/**
 * Initiates the transition animation for removing a list item (e.g., when a fix is applied or redone).
 * The item collapses and slides out before a full re-render is triggered.
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
function transitionRemoveItem(osmType, osmId) {
    const listItem = document.querySelector(`li[data-item-id="${osmType}/${osmId}"]`);

    if (listItem) {
        listItem.style.maxHeight = `${listItem.scrollHeight}px`;
        const transitionHandler = function (e) {
            if (e.propertyName === 'max-height') {
                renderNumbers();
                listItem.removeEventListener('transitionend', transitionHandler);
            }
        };
        window.requestAnimationFrame(() => {
            listItem.style.maxHeight = `${listItem.scrollHeight + 100}px`;

            window.requestAnimationFrame(() => {
                listItem.addEventListener('transitionend', transitionHandler);
                listItem.classList.add('fade-out-slide-up');
            });
        });
    } else {
        renderNumbers();
    }
}

/**
 * Calculates a bounding box around a central point with a given buffer distance.
 * @param {number} lat - The central latitude.
 * @param {number} lon - The central longitude.
 * @param {number} bufferMetres - The desired buffer distance in metres.
 * @returns {number[]} - The bounding box array: [minLon, minLat, maxLon, maxLat]
 */
function calculateBufferedBBox(lat, lon, bufferMetres = 100) {
    // Earth's radius in metres.
    const R = 6371000;

    // Convert buffer distance in metres to degrees (approximate).
    const latDelta = bufferMetres / R * (180 / Math.PI);
    const lonDelta = bufferMetres / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);

    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLon = lon - lonDelta;
    const maxLon = lon + lonDelta;

    return [minLon, minLat, maxLon, maxLat];
}

/**
 * Checks the area for any notes
 *
 * @param {string} lat - The centre latitude.
 * @param {number} long - The centre longitude.
 * @returns {void}
 */
async function checkForNotes(lat, lon) {
    const bbox = calculateBufferedBBox(lat, lon, 5);
    const notesInArea = await OSM.getNotesForArea(bbox);
    return notesInArea;
}

/**
 * Starts the creation of a note for a given element
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
function addNote(osmType, osmId) {
    const item = reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });
    openNoteModal(item);
    checkForNotes(item.lat, item.lon)
        .then((result) => {
            const openNotesMessage = result
                .filter(note => note.status === 'open')
                .map(note => note.id)
                .map(id => translate('noteIsClose', { '%n': `<a href="https://www.openstreetmap.org/note/${id}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${id}</a>` }))
                .join('\n');
            if (openNotesMessage.length > 0) {
                disableCreateNoteWithMessage(openNotesMessage);
            } else {
                const itemId = `${item.type}/${item.id}`;
                if (noteButtonClickHandler) {
                    addNoteBtn.removeEventListener('click', noteButtonClickHandler);
                }

                noteButtonClickHandler = function () {
                    checkAndCreateNote(itemId, item.lat, item.lon);
                };

                addNoteBtn.addEventListener('click', noteButtonClickHandler);
            }
        })
        .catch((err) => {
            disableCreateNoteWithMessage(`Error fetching notes: ${err}`);
        });
}

/**
 * Validates the note comment, creates the note if valid,
 * and handles the UI state (disabling/enabling buttons, showing messages/spinner)
 * before, during, and after the creation or error.
 * @returns {void}
 */
function checkAndCreateNote(itemId, lat, lon) {
    const noteCommentBox = document.getElementById('note-comment');
    const comment = noteCommentBox.value.trim();
    const messageBox = document.getElementById('note-message-box');

    if (comment.length > 0) {
        messageBox.classList.add('hidden');

        disableModalCloseListeners();

        addNoteBtn.classList.remove('cursor-pointer');
        addNoteBtn.classList.add('cursor-progress');
        addNoteBtn.disabled = true;
        noteCancelBtn.classList.add('hidden');

        noteCommentBox.disabled = true;
        noteCommentBox.classList.add('cursor-not-allowed');

        OSM.createNote(lat, lon, noteCommentBox.value.trim())
            .then((result) => {
                const successMessage = translate(
                    'noteCreated',
                    { '%n': `<a href="https://www.openstreetmap.org/note/${result.id}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${result.id}</a>` }
                );
                messageBox.className = 'message-box-success';
                messageBox.innerHTML = successMessage;
                messageBox.classList.remove('hidden');
                addNoteBtn.classList.add('hidden');
                noteCloseBtnBottom.classList.remove('hidden');

                let createdNotes = JSON.parse(localStorage.getItem(`createdNotes_${subdivisionName}`)) || [];
                createdNotes.push(itemId);
                localStorage.setItem(`createdNotes_${subdivisionName}`, JSON.stringify(createdNotes));

                enableModalCloseListeners();
                // Re-render to make note button grey
                renderNumbers();
            })
            .catch((err) => {
                addNoteBtn.disabled = false;
                addNoteBtn.classList.add('cursor-pointer');
                addNoteBtn.classList.remove('cursor-progress');

                messageBox.className = 'message-box-error';
                messageBox.innerHTML = `There was an error: ${err}`;
                messageBox.classList.remove('hidden');

                noteCancelBtn.classList.remove('hidden');
                enableModalCloseListeners();
            });
    } else {
        messageBox.className = 'message-box-error';
        messageBox.innerHTML = translate('enterComment');
        messageBox.classList.remove('hidden');
    }
}

/**
 * Handles the application of an autofix. It records the item as clicked,
 * saves the change to local storage, and initiates the visual removal transition.
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
function applyFix(osmType, osmId) {
    const itemIdTypeStr = `${osmType}/${osmId}`;

    recordItemClick(itemIdTypeStr);
    setButtonsAsClicked(itemIdTypeStr);
    saveChangeToStorage(osmType, osmId);
    transitionRemoveItem(osmType, osmId);
}

/**
 * Adds a fixed item's ID and type to the local undo stack and updates the
 * `undoPosition`. It also enables the Undo button and updates the Save button state.
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
function addToUndo(osmType, osmId) {
    const undoBtn = document.getElementById('undo-btn');
    if (undoStack.length !== undoPosition) {
        undoStack = undoStack.slice(0, undoPosition);
    }
    undoStack.push([osmType, osmId]);
    undoPosition = undoStack.length;
    if (undoStack.length > 0 && undoBtn.disabled) {
        enableUndo();
    }
    if (OSM.isLoggedIn()) {
        enableSave();
    }
    disableRedo();
    localStorage.setItem(`undoStack_${subdivisionName}`, JSON.stringify(undoStack));
    localStorage.setItem(`undoPosition_${subdivisionName}`, undoPosition);
}

/**
 * Undoes the last recorded change by moving the undo position back,
 * removing the edit from local storage, and transitioning the item back
 * into the fixable list section. Updates button states (Undo/Redo/Save).
 * @returns {void}
 */
function undoChange() {
    if (undoPosition === 0) {
        return
    }
    undoPosition -= 1;
    if (undoPosition === 0) {
        disableUndo();
    }
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn.disabled) {
        enableRedo();
    }

    let edits = JSON.parse(localStorage.getItem('edits')) || {};
    const undoneElement = undoStack[undoPosition];
    const osmType = undoneElement[0];
    const osmId = undoneElement[1];

    delete edits[subdivisionName][osmType][osmId];
    clearItemClick(`${osmType}/${osmId}`);

    localStorage.setItem('edits', JSON.stringify(edits));
    setUpSaveBtn();
    localStorage.setItem(`undoStack_${subdivisionName}`, JSON.stringify(undoStack));
    localStorage.setItem(`undoPosition_${subdivisionName}`, undoPosition);

    transitionInsertItem(osmType, osmId);
}

/**
 * Redoes the last undone change by moving the undo position forward,
 * re-applying the fix to local storage, and transitioning the item out
 * of the fixable list section. Updates button states (Undo/Redo/Save).
 * @returns {void}
 */
function redoChange() {
    if (undoPosition === undoStack.length) {
        return
    }

    const undoneElement = undoStack[undoPosition];
    const osmType = undoneElement[0];
    const osmId = undoneElement[1];

    const item = reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });

    let edits = JSON.parse(localStorage.getItem('edits')) || {};

    edits[subdivisionName][osmType][osmId] = item["suggestedFixes"];
    recordItemClick(`${osmType}/${osmId}`);

    undoPosition += 1;
    setUpUndoRedoBtns();
    localStorage.setItem(`undoStack_${subdivisionName}`, JSON.stringify(undoStack));
    localStorage.setItem(`undoPosition_${subdivisionName}`, undoPosition);

    localStorage.setItem('edits', JSON.stringify(edits));
    setUpSaveBtn();
    transitionRemoveItem(osmType, osmId);
}

/**
 * Displays the modal window for uploading changes, calculates the total
 * number of pending changes, and checks if the user is logged into OSM.
 * @returns {void}
 */
function openUploadModal() {
    let edits = JSON.parse(localStorage.getItem('edits')) || {};
    let totalChanges = 0;

    if (edits.hasOwnProperty(subdivisionName)) {
        const subdivisionData = edits[subdivisionName];
        const osmTypeObjects = Object.values(subdivisionData);
        const editCountForCounty = osmTypeObjects.reduce((accumulator, currentOsmTypeObject) => {
            return accumulator + Object.keys(currentOsmTypeObject).length;
        }, 0);
        totalChanges += editCountForCounty;
    }

    uploadModalTitle.innerHTML = translate('uploadChanges', { '%n': totalChanges });

    // Reset buttons etc. in case of previous upload in this session
    uploadBtn.classList.add('cursor-pointer');
    uploadBtn.classList.remove('cursor-progress');
    uploadBtn.classList.remove('cursor-not-allowed');
    uploadBtn.disabled = false;
    uploadBtn.classList.remove('hidden');
    uploadCancelBtn.classList.remove('hidden');
    uploadCloseBtnBottom.classList.add('hidden');

    commentBox.disabled = false;
    commentBox.classList.remove('cursor-not-allowed');
    commentBox.value = `${subdivisionName}: ` + CHANGESET_TAGS['comment'];

    if (!OSM.isLoggedIn()) {
        uploadBtn.disabled = true;
        uploadBtn.classList.add('cursor-not-allowed');
        uploadBtn.classList.remove('cursor-pointer');

        const messageBox = document.getElementById('message-box');
        messageBox.className = 'message-box-error';
        messageBox.innerHTML = translate('notLoggedIn');
        messageBox.classList.remove('hidden');
    }

    uploadModal.classList.remove('hidden');
    setTimeout(() => {
        uploadModal.classList.add('active');
    }, 10);
}

/**
 * Disables the create note button and shows a message to the user
 * @param {object} message - The text of the message.
 * @returns {void}
 */
function disableCreateNoteWithMessage(message) {
    addNoteBtn.disabled = true;
    addNoteBtn.classList.add('cursor-not-allowed');
    addNoteBtn.classList.remove('cursor-pointer');

    const messageBox = document.getElementById('note-message-box');
    messageBox.className = 'message-box-error';
    messageBox.innerHTML = message;
    messageBox.classList.remove('hidden');
}

/**
 * Decodes HTML entities in a string.
 * @param {string} encodedString - The string to be decoded.
 * @returns {string}
 */
function decodeHtmlEntities(encodedString) {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = encodedString;
    return textArea.value;
}

/**
 * Displays the modal window for creating a note and checks if the user is logged into OSM.
 * @param {object} item - The item to create a note for.
 * @returns {void}
 */
function openNoteModal(item) {
    noteModalTitle.innerHTML = translate('createNoteFor', { '%n': item.featureTypeName });

    // Reset buttons etc.
    addNoteBtn.classList.add('cursor-pointer');
    addNoteBtn.classList.remove('cursor-progress');
    addNoteBtn.classList.remove('cursor-not-allowed');
    addNoteBtn.disabled = false;
    addNoteBtn.classList.remove('hidden');

    noteCancelBtn.classList.remove('hidden');
    noteCloseBtnBottom.classList.add('hidden');

    const noteCommentBox = document.getElementById('note-comment');

    noteCommentBox.disabled = false;
    noteCommentBox.classList.remove('cursor-not-allowed');

    const invalidWithoutFix = Object.entries(item.invalidNumbers)
        .filter(([key]) => {
            const fix = item.suggestedFixes?.[key];
            return fix === null || fix === undefined;
        })

    const invalidNumbersList = invalidWithoutFix
        .map(([key, number]) => {
            return `${key} = ${number}`;
        })
        .join('\n');

    let noteComment = invalidWithoutFix.length > 1
        ? translate('hasInvalidPlural', { '%n': item.featureTypeName })
        : translate('hasInvalidSingular', { '%n': item.featureTypeName });

    noteComment += '\n\n';
    noteComment += invalidNumbersList;
    noteComment += `\n\n#surveyme\nhttps://www.openstreetmap.org/${item.type}/${item.id}\n`;
    noteComment += `via ${CHANGESET_TAGS['created_by']}`;

    noteCommentBox.value = decodeHtmlEntities(noteComment);

    if (!OSM.isLoggedIn()) {
        disableCreateNoteWithMessage(translate('notLoggedIn'));
    }

    noteModal.classList.remove('hidden');
    setTimeout(() => {
        noteModal.classList.add('active');
    }, 10);
}

/**
 * Hides the note modal window with a brief transition and clears any displayed messages and event listeners.
 * @returns {void}
 */
function closeNoteModal() {
    const messageBox = document.getElementById('note-message-box');
    noteModal.classList.remove('active');

    if (noteButtonClickHandler) {
        addNoteBtn.removeEventListener('click', noteButtonClickHandler);
        noteButtonClickHandler = null;
    }

    setTimeout(() => {
        noteModal.classList.add('hidden');
        messageBox.classList.add('hidden');
    }, 300);
}


/**
 * Hides the upload modal window with a brief transition and clears any displayed messages.
 * @returns {void}
 */
function closeUploadModal() {
    const messageBox = document.getElementById('message-box');
    uploadModal.classList.remove('active');
    setTimeout(() => {
        uploadModal.classList.add('hidden');
        messageBox.classList.add('hidden');
    }, 300);
}

/**
 * Displays the modal window prompting the user to restore or discard
 * previously saved local edits upon initial page load.
 * @param {number} count - The number of pending edits found in local storage.
 * @returns {void}
 */
function openEditsModal(count) {
    editsModalTitle.innerHTML = translate('restoreChanges', { '%n': count });

    editsModal.classList.remove('hidden');
    setTimeout(() => {
        editsModal.classList.add('active');
    }, 10);
}

/**
 * Hides the edits restoration modal with a brief transition.
 * @returns {void}
 */
function closeEditsModal() {
    setUpSaveBtn();
    editsModal.classList.remove('active');
    setTimeout(() => {
        editsModal.classList.add('hidden');
    }, 300);
}

/**
 * Permanently discards all locally saved edits for the current subdivision,
 * clears the undo/redo stack, and updates the UI to reflect no pending changes.
 * @returns {void}
 */
function discardEdits() {
    let edits = JSON.parse(localStorage.getItem('edits'));
    if (edits[subdivisionName]) {
        for (const osmType in edits[subdivisionName]) {
            for (const osmIdStr in edits[subdivisionName][osmType]) {
                const osmId = parseInt(osmIdStr, 10);
                clearItemClick(`${osmType}/${osmId}`);
            }
        }

        delete edits[subdivisionName];
        localStorage.setItem('edits', JSON.stringify(edits));

        localStorage.removeItem(`undoPosition_${subdivisionName}`);
        localStorage.removeItem(`undoStack_${subdivisionName}`);

        undoPosition = 0;
        undoStack = [];

        setUpSaveBtn();
        setUpUndoRedoBtns();
        closeEditsModal();
        renderNumbers();
    }
}

// Close upload modal when clicking the semi-transparent backdrop
const handleUploadModalClick = (event) => {
    if (event.target === uploadModal) {
        closeUploadModal();
    }
};


// Close note modal when clicking the semi-transparent backdrop
const handleNoteModalClick = (event) => {
    if (event.target === noteModal) {
        closeNoteModal();
    }
};

const handleDocumentKeydown = (event) => {
    if (event.key === 'Escape') {
        if (!uploadModal.classList.contains('hidden')) {
            closeUploadModal();
        }
        if (!editsModal.classList.contains('hidden')) {
            discardEdits();
        }
        if (!noteModal.classList.contains('hidden')) {
            closeNoteModal();
        }
    }
};

/**
 * Adds event listeners to enable closing the modals by clicking outside the content
 * (for the upload and note modals) or pressing the 'Escape' key (for all modals).
 * @returns {void}
 */
function enableModalCloseListeners() {
    uploadModal.addEventListener('click', handleUploadModalClick);
    noteModal.addEventListener('click', handleNoteModalClick);
    document.addEventListener('keydown', handleDocumentKeydown);
}

/**
 * Removes the event listeners used for closing modals, typically called during an upload process.
 * @returns {void}
 */
function disableModalCloseListeners() {
    uploadModal.removeEventListener('click', handleUploadModalClick);
    document.removeEventListener('keydown', handleDocumentKeydown);
}

// Add changeset comment to upload modal
const commentBox = document.getElementById('changesetComment');
commentBox.value = CHANGESET_TAGS['comment'];

// Add event listener to prevent new lines and handle submission
commentBox.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        // Prevent the default action (inserting a new line)
        event.preventDefault();
        if (!event.shiftKey) {
            checkAndSubmit();
        }
    }
});

/**
 * Toggles the visibility of the upload spinner element.
 * @param {boolean} isLoading - True to show the spinner, false to hide it.
 * @returns {void}
 */
function toggleUploadingSpinner(isLoading) {
    if (isLoading) {
        uploadSpinner.classList.remove('hidden');
    } else {
        uploadSpinner.classList.add('hidden');
    }
}

/**
 * Validates the changeset comment, initiates the upload process if valid,
 * and handles the UI state (disabling/enabling buttons, showing messages/spinner)
 * before, during, and after the upload or error.
 * @returns {void}
 */
function checkAndSubmit() {
    const commentBox = document.getElementById('changesetComment')
    const comment = commentBox.value.trim();
    const messageBox = document.getElementById('message-box');

    if (comment.length > 0) {
        messageBox.classList.add('hidden');

        disableModalCloseListeners();

        uploadBtn.classList.remove('cursor-pointer');
        uploadBtn.classList.add('cursor-progress');
        uploadBtn.disabled = true;
        uploadCancelBtn.classList.add('hidden');

        commentBox.disabled = true;
        commentBox.classList.add('cursor-not-allowed');
        toggleUploadingSpinner(true);
        uploadChanges()
            .then((result) => {
                if (result) {
                    const changesetIds = Object.keys(result || {});
                    const links = changesetIds.map(id =>
                        `<a href="https://www.openstreetmap.org/changeset/${id}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${id}</a>`
                    ).join(', ');
                    const successMessage = translate(
                        'changesetCreated',
                        { '%n': links }
                    );

                    messageBox.className = 'message-box-success';
                    messageBox.innerHTML = successMessage;
                } else {
                    messageBox.className = 'message-box-error';
                    messageBox.innerHTML = translate('noChangesSubmitted');
                }
                messageBox.classList.remove('hidden');
                toggleUploadingSpinner(false);
                uploadBtn.classList.add('hidden');
                uploadCloseBtnBottom.classList.remove('hidden');

                undoPosition = 0;
                undoStack = [];

                // Re-render numbers to hide uploaded elements
                renderNumbers();
                enableModalCloseListeners();
            })
            .catch((err) => {
                toggleUploadingSpinner(false);
                uploadBtn.innerHTML = translate('upload');
                uploadBtn.disabled = false;
                uploadBtn.classList.add('cursor-pointer');
                uploadBtn.classList.remove('cursor-progress');

                messageBox.className = 'message-box-error';
                messageBox.innerHTML = `There was an error: ${err}`;
                messageBox.classList.remove('hidden');

                uploadCancelBtn.classList.remove('hidden');
                enableModalCloseListeners();
            });
    } else {
        messageBox.className = 'message-box-error';
        messageBox.innerHTML = translate('enterComment');
        messageBox.classList.remove('hidden');
    }
}

/**
 * Updates the 'Save' button text and state (enabled/disabled) based on
 * the current count of pending local edits in the 'edits' storage.
 * @returns {void}
 */
function setUpSaveBtn() {
    const saveBtn = document.getElementById('save-btn');
    if (!saveBtn) return;
    let edits = JSON.parse(localStorage.getItem('edits')) || {};
    let count = 0;
    if (edits && edits[subdivisionName]) {
        for (const type in edits[subdivisionName]) {
            count += Object.keys(edits[subdivisionName][type]).length;
        }
    }
    if (count > 0) {
        enableSave();
        saveBtn.innerText = `Save ${count}`;
    } else {
        disableSave();
        saveBtn.innerText = `Save`;
    }
}

/**
 * Sets the disabled/enabled state of the 'Undo' and 'Redo' buttons based
 * on the current state of the `undoPosition` and `undoStack`.
 * @returns {void}
 */
function setUpUndoRedoBtns() {
    if (undoPosition === 0) {
        disableUndo();
    } else {
        enableUndo();
    }
    if (undoPosition < undoStack.length) {
        enableRedo();
    } else {
        disableRedo();
    }
}

enableModalCloseListeners();
initReportPage();
initLogin();
