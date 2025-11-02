let fixableCurrentPage = 1;
let invalidCurrentPage = 1;
let pageSize = 50;
let fixableSortKey = 'none'; // 'name', 'invalid', 'fixable'
let fixableSortDirection = 'asc'; // 'asc', 'desc'
let invalidSortKey = 'none'; // 'name', 'invalid'
let invalidSortDirection = 'asc'; // 'asc', 'desc'
let reportData = null;

const CLICKED_ITEMS_KEY = `clickedItems_${DATA_LAST_UPDATED}`;

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
        return clickedItems.hasOwnProperty(itemId);
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

    return { websiteButton, fixableLabel, josmFixButton, editorButtons };
}

/**
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @returns {string}
 */
function createListItem(item) {

    const itemId = `${item.type}/${item.id}`;
    const clickedClass = isItemClicked(itemId) ? 'btn-clicked' : '';

    const { websiteButton, fixableLabel, josmFixButton, editorButtons } = createButtons(item, clickedClass);

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
            return direction === 'asc' ? valA.localeCompare(valB): valB.localeCompare(valA);
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
 * Updates the visual styles of the sort buttons to indicate which one is active.
 */
function updateButtonStyles() {
    sortButtons.forEach(button => {
        const isActive = button.dataset.sort === currentSort;
        button.classList.toggle('sort-btn-style-active', isActive);
        button.classList.toggle('sort-btn-style-inactive', !isActive);
    });
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

    const pageControls = totalItems > pageSize ? `<div class="page-btns-container">
                <button id="prevPage${suffix}" onclick="changePage('${suffix}', -1)"
                        class="page-btn
                               ${currentPage <= 1 ? 'page-btn-disabled' : 'page-btn-active'}"
                        ${currentPage <= 1 ? 'disabled' : ''}>
                    ${translate('previous')}
                </button>
                <span class="page-numbers">
                    ${translate('pageOf', {'%n': currentPage, '%t': totalPages})}
                </span>
                <button id="nextPage${suffix}" onclick="changePage('${suffix}', 1)"
                        class="page-btn
                               ${currentPage >= totalPages ? 'page-btn-disabled' : 'page-btn-active'}"
                        ${currentPage >= totalPages ? 'disabled' : ''}>
                        ${translate('next')}
                </button>
            </div>` : '<div></div>';

    const paginationSortCard = `
        <div class="page-sort-card">
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
            </div>
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
    document.getElementById(`${section}Section`).scrollIntoView({'behavior':'smooth'});
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
    document.getElementById(`${section}Section`).scrollIntoView({'behavior':'smooth'});
}

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

    const autofixableNumbers = reportData.filter(item => item.autoFixable);
    const manualFixNumbers = reportData.filter(item => !item.autoFixable);

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

initReportPage();
