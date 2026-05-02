import { sortDirection, sortKey, UPLOADED_ITEMS_KEY } from "./report-state.js";

/**
 * Sorts an array of report items based on a specified key and direction.
 * Sorting by 'invalid' or 'fixable' uses the value of the first key within
 * the corresponding nested object (e.g., item.invalidNumbers.phone).
 *
 * @param {Array<Object>} items - The list of report items to be sorted. Each item must contain
 * 'featureTypeName', 'invalidNumbers' ({[key: string]: string}), 'suggestedFixes' ({[key: string]: string}),
 * and 'timestamp' (string|number|Date).
 * @param {('none'|'name'|'invalid'|'fixable'|'date')} key - The column key to sort by.
 * - 'name': Sorts by the item's 'featureTypeName'.
 * - 'invalid': Sorts by the first value in 'invalidNumbers'.
 * - 'fixable': Sorts by the first value in 'suggestedFixes'.
 * - 'date': Sorts by the item's 'timestamp'.
 * - 'foreign': Sorts by the first value in 'validForeignNumbers'.
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
            case 'date':
                valA = a.timestamp ? new Date(a.timestamp).getTime() : null;
                valB = b.timestamp ? new Date(b.timestamp).getTime() : null;
                break;
            case 'invalid':
                // Get the value of the first key in invalidNumbers
                valA = getFirstNonNullValue(a.invalidNumbers);
                valB = getFirstNonNullValue(b.invalidNumbers);
                break;
            case 'foreign':
                // Get the value of the first key in validForeignNumbers
                valA = Object.keys(getFirstNonNullValue(a.validForeignNumbers))[0];
                valB = Object.keys(getFirstNonNullValue(b.validForeignNumbers))[0];
                break;
            case 'fixable':
                // Get the value of the first key in suggestedFixes
                // If there isn't one, get the first from invalid numbers
                // (suggested might be null if the value is being removed)

                let firstA = getFirstNonNullValue(a.suggestedFixes);
                if (!firstA) {
                    firstA = getFirstNonNullValue(a.invalidNumbers);
                }

                let firstB = getFirstNonNullValue(b.suggestedFixes);
                if (!firstB) {
                    firstB = getFirstNonNullValue(b.invalidNumbers);
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

        if (key === 'date') {
            if (valA === valB) return 0;
            // For first click ('asc'), we want higher (newer) numbers to come first
            return direction === 'asc' 
                ? (valB - valA)  // Newest to Oldest
                : (valA - valB); // Oldest to Newest
        }

        // Regular comparison (works for numbers/timestamps and strings)
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
 * Retrieves the subset of report items (either autofixable or manual fix)
 * that have not been marked as edited or uploaded, and applies the current
 * section-specific sorting parameters.
 * @param {'fixable' | 'invalid' | 'foreign'} filterType - The category of items to retrieve.
 * @returns {Array<Object>} A new, sorted array of items for the specified section.
 */
export function getSortedItems(filterType) {
    const edits = JSON.parse(localStorage.getItem('edits')) || {};
    const uploadedChanges = JSON.parse(localStorage.getItem(UPLOADED_ITEMS_KEY));

    const targetItems = reportDataIds.filter(item => {
        const isWanted = 
            filterType === 'foreign' ? item.isForeignItem :
            filterType === 'fixable' ? item.autoFixable :
            (!item.autoFixable && !item.isForeignItem); // 'invalid' case
        const isNotInUploadedChanges = !(
            uploadedChanges?.[subdivisionName]?.[item.type]?.[item.id]
        );
        const isNotInCurrentEdits = !(
            edits?.[subdivisionName]?.[item.type]?.[item.id]
        );
        return isWanted && isNotInUploadedChanges && isNotInCurrentEdits;
    });

    const sortedItems = sortItems(targetItems, sortKey[filterType], sortDirection[filterType]);
    return sortedItems;
}

/**
 * Filters the createdNotes array to keep only the elements
 * that have a corresponding type/id in the reportData array.
 *
 * @param {string[]} createdNotes An array of strings like 'node/1234'.
 * @param {object[]} reportData An array of objects, where each object has a 'type' and an 'id' property.
 * @returns {string[]} The filtered createdNotes array.
 */
export function filterCreatedNotes(createdNotes, reportData) {
    const reportDataIds = new Set(
        reportData.map(item => `${item.type}/${item.id}`)
    );

    const filteredNotes = createdNotes.filter(id => {
        return reportDataIds.has(id);
    });

    return filteredNotes;
}
