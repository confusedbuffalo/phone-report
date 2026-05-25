import {
    appState,
    CLICKED_ITEMS_KEY,
    DEFAULT_EDITORS,
    EDITS_KEY,
    undoData,
    UPLOADED_ITEMS_KEY,
} from './report-state.js';
import {
    enableRedo,
    disableRedo,
    renderNumbers,
    closeEditsModal,
    setUpSaveBtn,
    setUpUndoRedoBtns,
    transitionRemoveItem,
    transitionInsertItem,
    enableUndo,
    enableSave,
    disableUndo,
} from './report-ui-controller.js';
import { subdivisionName, storageKey } from './config.js';

/**
 * Adds an item's ID to localStorage to mark it as clicked.
 * @param {string} itemId - The unique ID of the item (e.g., "way/12345").
 */
export function recordItemClick(itemId) {
    try {
        const clickedItems = JSON.parse(localStorage.getItem(CLICKED_ITEMS_KEY)) || {};
        clickedItems[itemId] = true;
        localStorage.setItem(CLICKED_ITEMS_KEY, JSON.stringify(clickedItems));
    } catch (e) {
        console.error('Could not save clicked item to localStorage:', e);
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
        console.error('Could not save clicked item to localStorage:', e);
    }
}

/**
 * Applies the 'clicked' visual state to all buttons of a specific item.
 * @param {string} itemId - The unique ID of the item (e.g., "way/12345").
 */
export function setButtonsAsClicked(itemId) {
    const listItem = document.querySelector(`li[data-item-id="${itemId}"]`);
    if (listItem) {
        const buttons = listItem.querySelectorAll(':not(input):not(.label-help)[data-editor-id]');
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
export function isItemClicked(itemId) {
    try {
        const clickedItems = JSON.parse(localStorage.getItem(CLICKED_ITEMS_KEY)) || {};
        return Object.hasOwn(clickedItems, itemId) && clickedItems[itemId];
    } catch (e) {
        console.error('Could not read clicked items from localStorage:', e);
        return false;
    }
}

/**
 * Loads the user's preferred editor settings from localStorage.
 * If no settings are found, it falls back to the default editors.
 */
export function loadSettings() {
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            appState.currentActiveEditors = JSON.parse(saved);
            return;
        }
    } catch (e) {
        console.error('Error loading settings from localStorage:', e);
    }
    // Fallback to defaults
    appState.currentActiveEditors = [...DEFAULT_EDITORS];
}

/**
 * Saves the current editor visibility settings to localStorage.
 */
export function saveSettings() {
    try {
        localStorage.setItem(storageKey, JSON.stringify(appState.currentActiveEditors));
    } catch (e) {
        console.error('Error saving settings to localStorage:', e);
    }
}

/**
 * Retrieves the local 'edits' storage object.
 * @returns {Object} The parsed edits object, or an empty object if none exists or on error.
 */
export function getEdits() {
    try {
        return JSON.parse(localStorage.getItem(EDITS_KEY)) || {};
    } catch (e) {
        console.error('Error reading edits from localStorage:', e);
        return {};
    }
}

/**
 * Saves the local 'edits' storage object.
 * @param {Object} edits - The edits object to save.
 */
export function saveEdits(edits) {
    try {
        localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
    } catch (e) {
        console.error('Error saving edits to localStorage:', e);
    }
}

/**
 * Moves the currently saved local edits for the current subdivision from the
 * 'edits' localStorage key to the 'uploaded' localStorage key, and then clears
 * the edits for the subdivision from the 'edits' key.
 * This function is called after a successful OSM upload.
 * @returns {void}
 */
export function moveEditsToUploadedStorage() {
    const edits = getEdits();
    let uploadedChanges = JSON.parse(localStorage.getItem(UPLOADED_ITEMS_KEY));

    if (uploadedChanges && uploadedChanges[subdivisionName]) {
        for (const type in edits[subdivisionName]) {
            uploadedChanges[subdivisionName][type] = {
                ...(edits[subdivisionName][type] || {}),
                ...uploadedChanges[subdivisionName][type],
            };
        }
    } else if (uploadedChanges) {
        uploadedChanges[subdivisionName] = edits[subdivisionName];
    } else {
        uploadedChanges = {};
        uploadedChanges[subdivisionName] = edits[subdivisionName];
    }

    localStorage.setItem(UPLOADED_ITEMS_KEY, JSON.stringify(uploadedChanges));
    delete edits[subdivisionName];
    saveEdits(edits);
}

/**
 * Permanently discards all locally saved edits for the current subdivision,
 * clears the undo/redo stack, and updates the UI to reflect no pending changes.
 * @returns {void}
 */
export function discardEdits() {
    const edits = getEdits();
    if (edits[subdivisionName]) {
        for (const osmType in edits[subdivisionName]) {
            for (const osmIdStr in edits[subdivisionName][osmType]) {
                const osmId = parseInt(osmIdStr, 10);
                clearItemClick(`${osmType}/${osmId}`);
            }
        }

        delete edits[subdivisionName];
        saveEdits(edits);

        localStorage.removeItem(`undoPosition_${subdivisionName}`);
        localStorage.removeItem(`undoStack_${subdivisionName}`);

        undoData.position = 0;
        undoData.stack = [];

        setUpSaveBtn();
        setUpUndoRedoBtns();
        closeEditsModal();
        renderNumbers();
    }
}

/**
 * Determines the suggested fix object for an item, optionally with a language.
 * @param {Object} item - The report item.
 * @param {string|null} language - The language for name reports.
 * @returns {Object} The suggested fix object.
 */
function getSuggestedFix(item, language) {
    if (language) {
        if (item.name) {
            return { [`name:${language}`]: item.name };
        } else {
            return { name: item.nameTags['name:' + language] };
        }
    }
    return item['suggestedFixes'];
}

/**
 * Persists the current undo stack and position to localStorage.
 */
function persistUndoState() {
    localStorage.setItem(`undoStack_${subdivisionName}`, JSON.stringify(undoData.stack));
    localStorage.setItem(`undoPosition_${subdivisionName}`, undoData.position);
}

/**
 * Saves a proposed fix for an OpenStreetMap element to the local 'edits' storage.
 * It also marks the item as 'clicked' and adds the action to the undo stack.
 *
 * @param {string} osmType - The OpenStreetMap element type (e.g., 'node', 'way').
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
function saveChangeToStorage(osmType, osmId, language = null) {
    const edits = getEdits();
    if (!edits[subdivisionName]) {
        edits[subdivisionName] = {};
    }
    if (!edits[subdivisionName][osmType]) {
        edits[subdivisionName][osmType] = {};
    }

    const item = appState.reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });

    edits[subdivisionName][osmType][osmId] = getSuggestedFix(item, language);

    saveEdits(edits);
    addToUndo(osmType, osmId, language);
    setUpSaveBtn();
}

/**
 * Handles the application of an autofix. It records the item as clicked,
 * saves the change to local storage, and initiates the visual removal transition.
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
export function applyFix(osmType, osmId, language = null) {
    const itemIdTypeStr = `${osmType}/${osmId}`;

    recordItemClick(itemIdTypeStr);
    setButtonsAsClicked(itemIdTypeStr);
    saveChangeToStorage(osmType, osmId, language);
    transitionRemoveItem(osmType, osmId);
}

/**
 * Adds a fixed item's ID and type to the local undo stack and updates the
 * undo position. It also enables the Undo button and updates the Save button state.
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @param {string | null} language - The language selected for the edit.
 * @returns {void}
 */
function addToUndo(osmType, osmId, language) {
    const undoBtn = document.getElementById('undo-btn');
    if (undoData.stack.length !== undoData.position) {
        undoData.stack = undoData.stack.slice(0, undoData.position);
    }
    undoData.stack.push([osmType, osmId, language]);
    undoData.position = undoData.stack.length;
    if (undoData.stack.length > 0 && undoBtn.disabled) {
        enableUndo();
    }
    if (OSM.isLoggedIn()) {
        enableSave();
    }
    disableRedo();
    persistUndoState();
}

/**
 * Undoes the last recorded change by moving the undo position back,
 * removing the edit from local storage, and transitioning the item back
 * into the fixable list section. Updates button states (Undo/Redo/Save).
 * @returns {void}
 */
export function undoChange() {
    if (undoData.position === 0) {
        return;
    }
    undoData.position -= 1;
    if (undoData.position === 0) {
        disableUndo();
    }
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn.disabled) {
        enableRedo();
    }

    const edits = getEdits();
    const undoneElement = undoData.stack[undoData.position];
    const osmType = undoneElement[0];
    const osmId = undoneElement[1];

    delete edits[subdivisionName][osmType][osmId];
    clearItemClick(`${osmType}/${osmId}`);

    saveEdits(edits);
    setUpSaveBtn();
    persistUndoState();

    transitionInsertItem(osmType, osmId);
}

/**
 * Redoes the last undone change by moving the undo position forward,
 * re-applying the fix to local storage, and transitioning the item out
 * of the fixable list section. Updates button states (Undo/Redo/Save).
 * @returns {void}
 */
export function redoChange() {
    if (undoData.position === undoData.stack.length) {
        return;
    }

    const undoneElement = undoData.stack[undoData.position];
    const osmType = undoneElement[0];
    const osmId = undoneElement[1];
    const language = undoneElement[2];

    const item = appState.reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });

    const edits = getEdits();
    edits[subdivisionName][osmType][osmId] = getSuggestedFix(item, language);

    recordItemClick(`${osmType}/${osmId}`);

    undoData.position += 1;
    setUpUndoRedoBtns();
    persistUndoState();

    saveEdits(edits);
    setUpSaveBtn();
    transitionRemoveItem(osmType, osmId);
}
