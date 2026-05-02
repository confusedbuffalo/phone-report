import { fixableCurrentPage, fixableSortDirection, fixableSortKey, foreignCurrentPage, foreignSortDirection, foreignSortKey, invalidCurrentPage, invalidSortDirection, invalidSortKey, pageSize, reportData } from "./report-state";
import { renderNumbers } from "./report-ui-controller";
import { getSortedItems } from "./report-utils";

/**
 * Handles pagination control logic by calculating the new current page,
 * updating the relevant global state variable (fixableCurrentPage or invalidCurrentPage),
 * triggering a full re-render, and smoothly scrolling to the section.
 * @param {('Fixable'|'Invalid')} section - The section being navigated ('Fixable' for autofixable, 'Invalid' for manual fix).
 * @param {number} delta - The change in page number, typically +1 for Next or -1 for Previous.
 */
export function changePage(section, delta) {
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
 * @param {('fixable'|'invalid'|'foreign')} section - The section being sorted.
 * @param {('name'|'invalid'|'fixable')} newKey - The column key requested for sorting.
 */
export function handleSort(section, newKey) {
    let currentKey, currentDirection;

    if (section === 'fixable') {
        currentKey = fixableSortKey;
        currentDirection = fixableSortDirection;
    } else if (section === 'invalid') {
        currentKey = invalidSortKey;
        currentDirection = invalidSortDirection;
    } else { // foreign
        currentKey = foreignSortKey;
        currentDirection = foreignSortDirection;
    }

    if (newKey === currentKey) {
        // Same key clicked, toggle direction
        if (section === 'fixable') {
            fixableSortDirection = (currentDirection === 'asc') ? 'desc' : 'asc';
        } else if (section === 'invalid') {
            invalidSortDirection = (currentDirection === 'asc') ? 'desc' : 'asc';
        } else {
            foreignSortDirection = (currentDirection === 'asc') ? 'desc' : 'asc';
        }
    } else {
        // New key clicked, set key and default to ascending
        if (section === 'fixable') {
            fixableSortKey = newKey;
            fixableSortDirection = 'asc';
        } else if (section === 'invalid') {
            invalidSortKey = newKey;
            invalidSortDirection = 'asc';
        } else {
            foreignSortKey = newKey;
            foreignSortDirection = 'asc';
        }
    }

    // Reset to the first page after sorting
    if (section === 'fixable') fixableCurrentPage = 1;
    else if (section === 'invalid') invalidCurrentPage = 1;
    else foreignCurrentPage = 1;

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
    item = targetItem[0];
    return {
        'item': item,
        'index': sortedItems.indexOf(item),
    };
}
