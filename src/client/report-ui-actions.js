import { reportType } from './config.js';
import { appState, currentPage, pageSize, sortDirection, sortKey } from './report-state.js';
import { clearItemClick, saveChangeToStorage } from './report-storage.js';
import { renderNumbers, transitionRemoveItem } from './report-ui-controller.js';
import { getFilteredItems, getSortedItems } from './report-utils.js';

/**
 * Handles pagination control logic by calculating the new current page,
 * updating the relevant global state variable, triggering a full re-render and smoothly scrolling to the section.
 * @param {('fixable'|'invalid'|'foreign'|'missing')} section - The section being navigated.
 * @param {number} delta - The change in page number, typically +1 for Next or -1 for Previous.
 */
export function changePage(section, delta) {
    delta = Number(delta);
    if (!appState.reportData) {
        console.error('Cannot change page before data is loaded.');
        return;
    }
    const totalItems = getFilteredItems(section).length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    currentPage[section] = Math.max(1, Math.min(totalPages, currentPage[section] + delta));
    renderNumbers();
    document.getElementById(`${section}Section`).scrollIntoView({ behavior: 'smooth' });
}

/**
 * Handles the user request to sort a report section. It toggles the sort direction
 * if the same key is clicked, or sets a new key and resets the direction to ascending.
 * It also resets the current page to 1 and triggers a full UI re-render and a smooth scroll.
 * @param {('fixable'|'invalid'|'foreign'|'missing')} section - The section being sorted.
 * @param {('name'|'invalid'|'fixable')} newKey - The column key requested for sorting.
 */
export function handleSort(section, newKey) {
    let currentKey = sortKey[section];
    let currentDirection = sortDirection[section];

    if (newKey === currentKey) {
        // Same key clicked, toggle direction
        sortDirection[section] = currentDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New key clicked, set key and default to ascending
        sortKey[section] = newKey;
        sortDirection[section] = 'asc';
    }

    // Reset to the first page after sorting
    currentPage[section] = 1;

    renderNumbers();
    document.getElementById(`${section}Section`).scrollIntoView({ behavior: 'smooth' });
}

/**
 * Finds a report item in the currently sorted list for a given section (fixable/invalid)
 * and returns the item object along with its current index in the sorted array.
 *
 * @param {string} osmType - The OpenStreetMap element type (e.g., 'node', 'way').
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @param {'fixable' | 'invalid' | 'foreign'} filterType - The category of items to search.
 * @returns {{item: Object, index: number}|void} An object containing the item and its index, or void if not found.
 */
export function getItemWithIndex(osmType, osmId, filterType) {
    const sortedItems = getSortedItems(filterType);
    const targetItem = sortedItems.filter(item => {
        return item.type === osmType && item.id === osmId;
    });
    if (targetItem.length !== 1) {
        console.log(`No item or too many items found, found ${targetItem.length} items`);
        return;
    }
    const item = targetItem[0];
    return {
        item,
        index: sortedItems.indexOf(item),
    };
}

/**
 * Validates an input for a certain value and OSM tag
 * @param {string} inputValue - The value to be validated
 * @param {string} tag - The tag for the key being validated
 * @param {Object} item - The original item that the value is being suggested for
 * @returns {Boolean}
 */

function validateInput(inputValue, tag, item) {
    if (!inputValue || inputValue.length > 255) return false;
    if (reportType === 'hours') {
        try {
            const oh = new window.opening_hours(inputValue, item.nominatimObject, { tag_key: tag });

            const warnings = oh.getStructuredWarnings();

            if (warnings.some(warning => warning.type === 'ambiguous_single_digit_hour')) return false;
            if (warnings.some(warning => warning.type === 'use_multi')) return false;
            if (warnings.some(warning => warning.type === 'hour_min_separator')) return false;
            if (warnings.some(warning => warning.type === 'word_error_correction')) return false;

            const warningMessages = oh.getStructuredWarnings().map(warning => warning.message);
            warningMessages.join(',').toLowerCase().includes('assuming'); // locale is not set, so we're in English, so we can do this

            return true;
        } catch {
            return false;
        }
    }
    // TODO: add validation for names and phones
    return true;
}

/**
 * Replaces the value container in a targeted row with an editable input field.
 * @param {string} targetId - e.g., "way/1234-0"
 */
function enableRowEditing(targetId) {
    const rowElement = document.querySelector(`[data-row-id="${targetId}"]`);
    if (!rowElement) return;

    const valueContainer = rowElement.querySelector('.list-item-phone-value-container');
    if (!valueContainer) return;

    const labelContainer = rowElement.querySelector('.list-item-phone-label-container');
    if (!labelContainer) return;

    const [osmType, osmId] = targetId.replace(/-\d+$/, '').split('/');
    const item = getItemWithIndex(osmType, parseInt(osmId), null)?.item;

    const tag = labelContainer.textContent.trim();

    // TODO: other report types
    const tagValue = item.invalidHours[tag];

    valueContainer.innerHTML = `<textarea
            class="edit-textarea-field resize-none border-2 border-radius border-gray-900 dark:border-white rounded-md focus:outline-none p-2 w-full font-inherit overflow-hidden"
        >${tagValue}</textarea>`;

    const textarea = valueContainer.querySelector('textarea');

    // pre-validate to colour the box
    const validInput = validateInput(textarea.value, tag, item);

    textarea.classList.toggle('border-gray-900', validInput);
    textarea.classList.toggle('dark:border-white', validInput);
    textarea.classList.toggle('border-red-500', !validInput);

    textarea.focus();

    const textLength = textarea.value.length;
    textarea.setSelectionRange(textLength, textLength);

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;

    textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = `${this.scrollHeight}px`;

        const validInput = validateInput(textarea.value, tag, item);

        textarea.classList.toggle('border-gray-900', validInput);
        textarea.classList.toggle('dark:border-white', validInput);
        textarea.classList.toggle('border-red-500', !validInput);
    });

    textarea.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            clearItemClick(`${osmType}/${osmId}`);
            renderNumbers();
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const validInput = validateInput(textarea.value, tag, item);

            if (validInput) {
                saveChangeToStorage(osmType, parseInt(osmId), null, { [tag]: textarea.value });
                transitionRemoveItem(osmType, parseInt(osmId));
            }
        }
    });
}

/**
 * Sets up an element to be edited in place by replacing the values with editable input fields.
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
export function editInPlace(itemType, itemId) {
    const container = document.querySelector(`[data-item-id="${itemType}/${itemId}"] .list-item-details-wrapper`);

    const textarea = container.querySelector('textarea');
    if (textarea) {
        clearItemClick(`${itemType}/${itemId}`);
        renderNumbers();
        return;
    }

    // Re-render to reset any other existing textboxes
    renderNumbers();

    const rowIds = Array.from(container?.querySelectorAll('div[data-row-id]') || []).map(el =>
        el.getAttribute('data-row-id')
    );

    for (const rowId of rowIds) {
        enableRowEditing(rowId);
    }
}
