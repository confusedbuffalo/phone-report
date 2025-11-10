let fixableCurrentPage = 1;
let invalidCurrentPage = 1;
let pageSize = 50;
let fixableSortKey = 'none'; // 'name', 'invalid', 'fixable'
let fixableSortDirection = 'asc'; // 'asc', 'desc'
let invalidSortKey = 'none'; // 'name', 'invalid'
let invalidSortDirection = 'asc'; // 'asc', 'desc'
let reportData = null;

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
 * Resets the list item, to reset the clicked style of the buttons
 * @param {string} osmType - The OSM type of the item (e.g., "node", "way", "relation"
 * @param {number} osmId - The OSM id of the item (e.g. 12345).
 */
function resetListItem(osmType, osmId) {
    const item = reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });
    if (!item) {
        console.log(`Could not find ${osmType}/${osmId}`);
        return;
    }
    const listItemId = `${osmType}/${osmId}`;
    const oldListItem = document.querySelector(`li[data-item-id="${listItemId}"]`);

    if (oldListItem) {
        const newListItemHtmlString = createListItem(item);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newListItemHtmlString.trim();
        const newListItem = tempDiv.firstChild;

        oldListItem.replaceWith(newListItem);
        applyEditorVisibility();
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
        if (editorId === 'apply-fix') {
            button.style.display = 'inline-flex';
            return;
        }
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
 * Creates the website and editor buttons for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @returns {{
 * websiteButton: Element,
 * fixableLabel: Element,
 * josmFixButton: Element,
 * fixButton: Element,
 * editorButtons: Element[]
 * }}
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
        `<button onclick="recordItemClick('${item.type}/${item.id}'); setButtonsAsClicked('${item.type}/${item.id}'); saveChangeToStorage('${item.type}', ${item.id})"
        data-editor-id="apply-fix"
        class="btn cursor-pointer ${clickedClass ? clickedClass : 'btn-josm-fix'}">
        ${translate('applyFix')}
    </button>` :
        '';

    // Generate JOSM Fix Button (special case)
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

    return { websiteButton, fixableLabel, josmFixButton, fixButton, editorButtons };
}

/**
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @returns {string}
 */
function createListItem(item) {

    const itemId = `${item.type}/${item.id}`;
    const clickedClass = isItemClicked(itemId) ? 'btn-clicked' : '';

    const { websiteButton, fixableLabel, josmFixButton, fixButton, editorButtons } = createButtons(item, clickedClass);

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
                ${websiteButton}
                ${fixableLabel}
                ${fixButton}
                ${josmFixButton}
                ${editorButtons}
            </div>
        </li>
    `;
}

/**
 * Helper to retrieve the value of the first key in an object.
 * Used for getting the phone number string from invalidNumbers or suggestedFixes objects.
 * @param {Object} obj - The object to extract the first value from (e.g., { "phone": "123" }).
 * @returns {string} The value of the first key, or an empty string if invalid.
 */
function getFirstValue(obj) {
    if (!obj || typeof obj !== 'object') return '';
    const firstKey = Object.keys(obj)[0];
    return firstKey ? obj[firstKey] : '';
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
                valA = getFirstValue(a.invalidNumbers);
                valB = getFirstValue(b.invalidNumbers);
                break;
            case 'fixable':
                // Get the value of the first key in suggestedFixes
                valA = getFirstValue(a.suggestedFixes);
                valB = getFirstValue(b.suggestedFixes);
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
    const totalPages = Math.ceil(totalItems / pageSize);

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
                <button id="save-btn" class="btn-squared gray-btn-disabled" onclick="openUploadModal()" disabled>Save</button>
            </div>
        </div>` : '';

    const pageAndSortControls = `
        ${pageControls}
        <div class="sort-controls">
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
                    <div>${pageAndSortControls}</div>
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
        <ul class="report-list mt-4">
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

    let count = 0;
    if (edits && edits[subdivisionName]) {
        for (const type in edits[subdivisionName]) {
            count += Object.keys(edits[subdivisionName][type]).length;
        }
    }
    if (firstLoad && count > 0) {
        openEditsModal(count);
    }

    const uploadedChanges = JSON.parse(localStorage.getItem(UPLOADED_ITEMS_KEY));

    const autofixableNumbers = reportData.filter(item => {
        const isAutoFixable = item.autoFixable;
        const isNotInUploadedChanges = !(
            uploadedChanges?.[subdivisionName]?.[item.type]?.[item.id]
        );
        return isAutoFixable && isNotInUploadedChanges;
    });
    const manualFixNumbers = reportData.filter(item => {
        const notAutoFixable = !item.autoFixable;
        const isNotInUploadedChanges = !(
            uploadedChanges?.[subdivisionName]?.[item.type]?.[item.id]
        );
        return notAutoFixable && isNotInUploadedChanges;
    });

    const anyInvalid = manualFixNumbers.length > 0;
    const anyFixable = autofixableNumbers.length > 0;

    const sortedFixable = sortItems(autofixableNumbers, fixableSortKey, fixableSortDirection);
    const sortedInvalid = sortItems(manualFixNumbers, invalidSortKey, invalidSortDirection);

    // Clear all containers first
    fixableContainer.innerHTML = '';
    invalidContainer.innerHTML = '';
    noInvalidContainer.innerHTML = '';

    if (anyFixable || anyInvalid) {
        if (anyFixable) {
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
 * Initializes the report page by fetching the data and rendering the numbers.
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
    renderNumbers();
}

// OSM editing

const redirectUrl = "https://confusedbuffalo.github.io/phone-report/land.html";
let undoStack = [];
let undoPosition = 0;
const uploadSpinner = document.getElementById('upload-spinner');

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

function logout() {
    OSM.logout();
    localStorage.removeItem('osm_display_name');
    initLogin();
}

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
 * Applies edits to a feature's tags object.
 * If an edit value is null, the corresponding key is removed from feature.tags.
 *
 * @param {object} feature The feature object containing the 'tags' object.
 * @param {object} elementEdits The object of key-value edits to apply.
 */
function applyEditsToFeatureTags(feature, elementEdits) {
    if (!feature.tags || typeof feature.tags !== 'object') {
        feature.tags = {};
    }

    const tags = feature.tags;

    for (const key in elementEdits) {
        if (Object.hasOwn(elementEdits, key)) {
            const value = elementEdits[key];

            if (value === null) {
                delete tags[key];
            } else {
                tags[key] = value;
            }
        }
    }
}

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

async function uploadChanges() {
    let edits = JSON.parse(localStorage.getItem('edits')) || {};

    let modifications = [];
    const subdivisionEdits = edits[subdivisionName];

    const elementTypes = ['node', 'way', 'relation'];

    for (const type of elementTypes) {
        const editsForType = subdivisionEdits[type];

        if (editsForType) {
            const featureIds = Object.keys(editsForType);

            if (featureIds.length > 0) {
                const features = await OSM.getFeatures(type, featureIds);
                for (const feature of features) {
                    const originalTags = { ...feature.tags }
                    applyEditsToFeatureTags(feature, editsForType[feature.id])
                    if (
                        JSON.stringify(originalTags, Object.keys(originalTags).sort()) !== JSON.stringify(feature.tags, Object.keys(feature.tags).sort())
                    ) {
                        modifications.push(feature);
                    }
                }
            }
        }
    }

    if (modifications.length > 0) {
        const changesetId = await OSM.uploadChangeset(
            { ...CHANGESET_TAGS, ...{ 'comment': commentBox.value.trim() } },
            { create: [], modify: modifications, delete: [] }
        );
        moveEditsToUploadedStorage();
        return changesetId;
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

function enableSave() {
    const saveBtn = document.getElementById('save-btn');
    enableGrayBtn(saveBtn);
}

function disableSave() {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) { disableGrayBtn(saveBtn) };
}

function enableUndo() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) { enableGrayBtn(undoBtn) };
}

function disableUndo() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) { disableGrayBtn(undoBtn) };
}

function enableRedo() {
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) { enableGrayBtn(redoBtn) };
}

function disableRedo() {
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) { disableGrayBtn(redoBtn) };
}

function disableGrayBtn(selector) {
    selector.classList.remove('gray-btn-enabled');
    selector.classList.add('gray-btn-disabled')
    selector.disabled = true;
}

function enableGrayBtn(selector) {
    selector.classList.remove('gray-btn-disabled');
    selector.classList.add('gray-btn-enabled')
    selector.disabled = false;
}

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
}

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

    resetListItem(osmType, osmId);
    localStorage.setItem('edits', JSON.stringify(edits));
    setUpSaveBtn();
}

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
    if (undoPosition === undoStack.length) {
        disableRedo();
    }
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn.disabled) {
        enableUndo();
    }

    resetListItem(osmType, osmId);
    localStorage.setItem('edits', JSON.stringify(edits));
    setUpSaveBtn();
}

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

function closeUploadModal() {
    const messageBox = document.getElementById('message-box');
    uploadModal.classList.remove('active');
    setTimeout(() => {
        uploadModal.classList.add('hidden');
        messageBox.classList.add('hidden');
    }, 300);
}

function openEditsModal(count) {
    editsModalTitle.innerHTML = translate('restoreChanges', { '%n': count });

    editsModal.classList.remove('hidden');
    setTimeout(() => {
        editsModal.classList.add('active');
    }, 10);
}

function closeEditsModal() {
    setUpSaveBtn();
    editsModal.classList.remove('active');
    setTimeout(() => {
        editsModal.classList.add('hidden');
    }, 300);
}

function discardEdits() {
    let edits = JSON.parse(localStorage.getItem('edits'));
    if (edits[subdivisionName]) {
        for (const osmType in edits[subdivisionName]) {
            for (const osmIdStr in edits[subdivisionName][osmType]) {
                const osmId = parseInt(osmIdStr, 10);
                clearItemClick(`${osmType}/${osmId}`);
                resetListItem(osmType, osmId);
            }
        }
        delete edits[subdivisionName];
        localStorage.setItem('edits', JSON.stringify(edits));
        setUpSaveBtn();
        closeEditsModal();
    }
}

// Close upload modal when clicking the semi-transparent backdrop
const handleUploadModalClick = (event) => {
    if (event.target === uploadModal) {
        closeUploadModal();
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
    }
};

function enableModalCloseListeners() {
    uploadModal.addEventListener('click', handleUploadModalClick);
    document.addEventListener('keydown', handleDocumentKeydown);
}

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

function toggleUploadingSpinner(isLoading) {
    if (isLoading) {
        uploadSpinner.classList.remove('hidden');
    } else {
        uploadSpinner.classList.add('hidden');
    }
}

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
                    const successMessage = translate(
                        'changesetCreated',
                        { '%n': `<a href="https://www.openstreetmap.org/changeset/${result}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${result}</a>` }
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
