import { appState, CLICKED_ITEMS_KEY, DEFAULT_EDITORS, undoData, UPLOADED_ITEMS_KEY } from './report-state.js';
import { enableRedo, disableRedo, renderNumbers, closeEditsModal, setUpSaveBtn, setUpUndoRedoBtns, transitionRemoveItem, transitionInsertItem, enableUndo, enableSave } from './report-ui-controller.js';

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
export function setButtonsAsClicked(itemId) {
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
export function isItemClicked(itemId) {
    try {
        const clickedItems = JSON.parse(localStorage.getItem(CLICKED_ITEMS_KEY)) || {};
        return clickedItems.hasOwnProperty(itemId) && clickedItems[itemId];
    } catch (e) {
        console.error("Could not read clicked items from localStorage:", e);
        return false;
    }
}

/**
 * Loads the user's preferred editor settings from localStorage.
 * If no settings are found, it falls back to the default editors.
 */
export function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            appState.currentActiveEditors = JSON.parse(saved);
            return;
        }
    } catch (e) {
        console.error("Error loading settings from localStorage:", e);
    }
    // Fallback to defaults
    appState.currentActiveEditors = [...DEFAULT_EDITORS];
}

/**
 * Saves the current editor visibility settings to localStorage.
 */
export function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.currentActiveEditors));
    } catch (e) {
        console.error("Error saving settings to localStorage:", e);
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
 * Permanently discards all locally saved edits for the current subdivision,
 * clears the undo/redo stack, and updates the UI to reflect no pending changes.
 * @returns {void}
 */
export function discardEdits() {
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

        undoData.position = 0;
        undoData.stack = [];

        setUpSaveBtn();
        setUpUndoRedoBtns();
        closeEditsModal();
        renderNumbers();
    }
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
    let edits = JSON.parse(localStorage.getItem('edits')) || {};
    if (!edits[subdivisionName]) {
        edits[subdivisionName] = {};
    }
    if (!edits[subdivisionName][osmType]) {
        edits[subdivisionName][osmType] = {};
    }

    const item = appState.reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });

    if (language) {
        if (item.name) {
            edits[subdivisionName][osmType][osmId] = {[`name:${language}`]: item.name};
        } else{
            edits[subdivisionName][osmType][osmId] = {name: item.nameTags["name:" + language]};
        }
    } else {
        edits[subdivisionName][osmType][osmId] = item["suggestedFixes"];
    }

    localStorage.setItem('edits', JSON.stringify(edits));
    addToUndo(osmType, osmId);
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
 * @returns {void}
 */
function addToUndo(osmType, osmId) {
    const undoBtn = document.getElementById('undo-btn');
    if (undoData.stack.length !== undoData.position) {
        undoData.stack = undoData.stack.slice(0, undoData.position);
    }
    undoData.stack.push([osmType, osmId]);
    undoData.position = undoData.stack.length;
    if (undoData.stack.length > 0 && undoBtn.disabled) {
        enableUndo();
    }
    if (OSM.isLoggedIn()) {
        enableSave();
    }
    disableRedo();
    localStorage.setItem(`undoStack_${subdivisionName}`, JSON.stringify(undoData.stack));
    localStorage.setItem(`undoPosition_${subdivisionName}`, undoData.position);
}

/**
 * Undoes the last recorded change by moving the undo position back,
 * removing the edit from local storage, and transitioning the item back
 * into the fixable list section. Updates button states (Undo/Redo/Save).
 * @returns {void}
 */
export function undoChange() {
    if (undoData.position === 0) {
        return
    }
    undoData.position -= 1;
    if (undoData.position === 0) {
        disableUndo();
    }
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn.disabled) {
        enableRedo();
    }

    let edits = JSON.parse(localStorage.getItem('edits')) || {};
    const undoneElement = undoData.stack[undoData.position];
    const osmType = undoneElement[0];
    const osmId = undoneElement[1];

    delete edits[subdivisionName][osmType][osmId];
    clearItemClick(`${osmType}/${osmId}`);

    localStorage.setItem('edits', JSON.stringify(edits));
    setUpSaveBtn();
    localStorage.setItem(`undoStack_${subdivisionName}`, JSON.stringify(undoData.stack));
    localStorage.setItem(`undoPosition_${subdivisionName}`, undoData.position);

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
        return
    }

    const undoneElement = undoData.stack[undoData.position];
    const osmType = undoneElement[0];
    const osmId = undoneElement[1];

    const item = appState.reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });

    let edits = JSON.parse(localStorage.getItem('edits')) || {};

    edits[subdivisionName][osmType][osmId] = item["suggestedFixes"];
    recordItemClick(`${osmType}/${osmId}`);

    undoData.position += 1;
    setUpUndoRedoBtns();
    localStorage.setItem(`undoStack_${subdivisionName}`, JSON.stringify(undoData.stack));
    localStorage.setItem(`undoPosition_${subdivisionName}`, undoData.position);

    localStorage.setItem('edits', JSON.stringify(edits));
    setUpSaveBtn();
    transitionRemoveItem(osmType, osmId);
}
