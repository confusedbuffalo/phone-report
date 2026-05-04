import { appState, currentPage, pageSize, sortDirection, sortKey } from "./report-state.js";
import { renderNumbers } from "./report-ui-controller.js";
import { getSortedItems } from "./report-utils.js";

/**
 * Handles pagination control logic by calculating the new current page,
 * updating the relevant global state variable, triggering a full re-render and smoothly scrolling to the section.
 * @param {('fixable'|'invalid'|'foreign')} section - The section being navigated ('Fixable' for autofixable, 'Invalid' for manual fix).
 * @param {number} delta - The change in page number, typically +1 for Next or -1 for Previous.
 */
export function changePage(section, delta) {
    delta = Number(delta)
    if (!appState.reportData) {
        console.error("Cannot change page before data is loaded.");
        return;
    }
    const totalPages =
        section === 'fixable' ? Math.ceil(appState.reportData.filter(item => item.autoFixable).length / pageSize) :
            section === 'foreign' ? Math.ceil(appState.reportData.filter(item => item.isForeignItem).length / pageSize) :
                Math.ceil(appState.reportData.filter(item => (!item.autoFixable && !item.isForeignItem)).length / pageSize); // invalid

    currentPage[section] = Math.max(1, Math.min(totalPages, currentPage[section] + delta));
    renderNumbers();
    document.getElementById(`${section}Section`).scrollIntoView({ 'behavior': 'smooth' });
}

/**
 * Handles the user request to sort a report section. It toggles the sort direction
 * if the same key is clicked, or sets a new key and resets the direction to ascending.
 * It also resets the current page to 1 and triggers a full UI re-render and a smooth scroll.
 * @param {('fixable'|'invalid'|'foreign')} section - The section being sorted.
 * @param {('name'|'invalid'|'fixable')} newKey - The column key requested for sorting.
 */
export function handleSort(section, newKey) {
    let currentKey = sortKey[section];
    let currentDirection = sortDirection[section];

    if (newKey === currentKey) {
        // Same key clicked, toggle direction
        sortDirection[section] = (currentDirection === 'asc') ? 'desc' : 'asc';
    } else {
        // New key clicked, set key and default to ascending
        sortKey[section] = newKey;
        sortDirection[section] = 'asc'
    }

    // Reset to the first page after sorting
    currentPage[section] = 1;

    renderNumbers();
    document.getElementById(`${section}Section`).scrollIntoView({ 'behavior': 'smooth' });
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
        console.log('No item or too many items found');
        return
    }
    const item = targetItem[0];
    return {
        'item': item,
        'index': sortedItems.indexOf(item),
    };
}
