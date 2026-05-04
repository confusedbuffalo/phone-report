import { addNote, openInJosm, login, logout, checkAndSubmit } from "./report-osm-edit.js";
import { addNoteBtn, commentBox, editsModal, noteCancelBtn, noteCloseBtnBottom, noteModal, settingsMenu, uploadBtn, uploadCancelBtn, uploadCloseBtnBottom, uploadModal, pageSize, currentPage, sortKey, undoData, appState } from "./report-state.js";
import { applyFix, discardEdits, recordItemClick, redoChange, saveSettings, setButtonsAsClicked, undoChange } from "./report-storage.js";
import { changePage, getItemWithIndex, handleSort } from "./report-ui-actions.js";
import { createListItem, createSaveRow, decodeHtmlEntities } from "./report-ui-components.js";
import { getFilterType, getSortedItems } from "./report-utils.js";

let firstLoad = true;

const uploadModalTitle = document.getElementById('upload-modal-title');
const editsModalTitle = document.getElementById('edits-modal-title');
const noteModalTitle = document.getElementById('note-modal-title');

export function handleGlobalClicks(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const itemType = target.dataset.itemType;
    const itemId = Number(target.dataset.itemId);

    switch (action) {
        case 'fix':
            applyFix(itemType, itemId);
            break;

        case 'add-note':
            addNote(itemType, itemId);
            break;

        case 'josm':
            recordItemClick(`${itemType}/${itemId}`);
            setButtonsAsClicked(`${itemType}/${itemId}`);
            openInJosm(target.dataset.url);
            break;

        case 'edit':
            recordItemClick(`${itemType}/${itemId}`);
            setButtonsAsClicked(`${itemType}/${itemId}`);
            break;

        case 'add-name':
            applyFix(itemType, itemId, target.dataset.language);
            break;

        case 'complete-name':
            applyFix(itemType, itemId, target.dataset.language);
            break;

        case 'login':
            login();
            break;

        case 'logout':
            logout();
            break;

        case 'open-upload-modal':
            openUploadModal();
            break;

        case 'close-upload-modal':
            closeUploadModal();
            break;

        case 'close-edits-modal':
            closeEditsModal();
            break;

        case 'close-note-modal':
            closeNoteModal();
            break;

        case 'upload':
            checkAndSubmit();
            break;

        case 'discard':
            discardEdits();
            break;

        case 'undo':
            undoChange();
            break;

        case 'redo':
            redoChange();
            break;

        case 'sort':
            handleSort(target.dataset.section, target.dataset.sortKey);
            break;

        case 'page':
            changePage(target.dataset.section, target.dataset.pageChange);
            break;

        default:
            console.warn(`No handler defined for action: ${action}`);
    }
}

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
 * Main rendering function for the phone number report.
 * It filters the raw data, applies the current sorting parameters,
 * clears the display containers, and delegates the rendering of
 * the paginated sections to renderPaginatedSection.
 * @returns {void}
 */
export function renderNumbers() {
    if (!appState.reportData) {
        console.error("Attempted to render numbers before data was loaded.");
        return;
    }
    const fixableContainer = document.getElementById("fixableSection");
    const invalidContainer = document.getElementById("invalidSection");
    const foreignContainer = document.getElementById("foreignSection");
    const missingContainer = document.getElementById("missingSection");
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
            undoData.position = 0;
            undoData.stack = [];
        }
    }

    const sortedItems = {
        fixable: getSortedItems('fixable'),
        invalid: getSortedItems('invalid'),
        foreign: getSortedItems('foreign'),
        missing: getSortedItems('missing')
    }

    const anyFixable = sortedItems.fixable.length > 0;
    const anyInvalid = sortedItems.invalid.length > 0;
    const anyForeign = sortedItems.foreign.length > 0;
    const anyMissing = sortedItems.missing.length > 0;

    // Clear all containers first
    fixableContainer && (fixableContainer.innerHTML = '');
    invalidContainer && (invalidContainer.innerHTML = '');
    foreignContainer && (foreignContainer.innerHTML = '');
    missingContainer && (missingContainer.innerHTML = '');
    noInvalidContainer && (noInvalidContainer.innerHTML = '');

    if (anyFixable || anyInvalid || anyMissing || editCount > 0) {
        if (anyFixable || (reportType === 'phone' && editCount > 0)) {
            renderPaginatedSection(
                "fixableSection",
                sortedItems.fixable,
                translate('fixableNumbersHeader'),
                translate('fixableNumbersDescription'),
                currentPage['fixable'],
                (page) => currentPage['fixable'] = page,
                'fixable'
            );
        }

        if (anyInvalid) {
            renderPaginatedSection(
                "invalidSection",
                sortedItems.invalid,
                reportType === 'phone' ? translate('invalidNumbersHeader') : translate('incompleteNames'),
                reportType === 'phone' ? translate('invalidNumbersDescription') : translate('incompleteNamesDescription'),
                currentPage['invalid'],
                (page) => currentPage['invalid'] = page,
                'invalid'
            );
        }

        if (anyMissing) {
            renderPaginatedSection(
                "missingSection",
                sortedItems.missing,
                translate('missingNames'),
                translate('missingNamesDescription'),
                currentPage['missing'],
                (page) => currentPage['missing'] = page,
                'invalid'
            );
        }

        if (reportType === 'name') {
            const saveRow = document.getElementById('save-row');

            saveRow.innerHTML = `<div class="page-sort-card"><div class="save-sort-container">
                ${createSaveRow()}
                </div></div>`
        }
    } else {
        // No invalid numbers found at all
        noInvalidContainer.innerHTML = `
            <p class="report-list-item-empty">${translate(reportType === 'phone' ? 'noInvalidNumbers' : 'noIncompleteNames')}</p>
        `;
    }

    // Always render foreign items
    if (anyForeign) {
        renderPaginatedSection(
            "foreignSection",
            sortedItems.foreign,
            translate('foreignNumbersHeader'),
            translate('foreignNumbersDescription'),
            currentPage['foreign'],
            (page) => currentPage['foreign'] = page,
            'foreign'
        );
    }

    applyEditorVisibility();
    setUpSaveBtn();
    setUpUndoRedoBtns();
    firstLoad = false;
}

/**
 * Renders a paginated list section with controls.
 * @param {string} containerId - The ID of the HTML element to render into.
 * @param {Array<Object>} items - The full array of items for this section.
 * @param {string} headerStr - The main heading text.
 * @param {string} descriptionStr - The description text.
 * @param {number} currentPage - The current page number for this section.
 * @param {function} setCurrentPageFn - Function to call to update the current page in the global state.
 * @param {'fixable' | 'invalid' | 'foreign'} filterType - The category of items to render for (used for unique IDs). 
 */
function renderPaginatedSection(
    containerId,
    items,
    headerStr,
    descriptionStr,
    currentPage,
    setCurrentPageFn,
    filterType
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

    const currentSortKey = sortKey[filterType];

    const getSortStyle = (key) => {
        if (currentSortKey === key) {
            return 'sort-btn-style-active'
        } else {
            return 'sort-btn-style-inactive'
        }
    };

    const pageControls = totalItems > pageSize ? `
        <div class="page-btns-container">
            <button id="prevPage${filterType}" data-action="page" data-page-change="-1" data-section="${filterType}"
                    class="page-btn
                            ${currentPage <= 1 ? 'page-btn-disabled' : 'page-btn-active'}"
                    ${currentPage <= 1 ? 'disabled' : ''}>
                ${translate('previous')}
            </button>
            <span class="page-numbers">
                ${translate('pageOf', { '%n': currentPage, '%t': totalPages })}
            </span>
            <button id="nextPage${filterType}" data-action="page" data-page-change="1" data-section="${filterType}"
                    class="page-btn
                            ${currentPage >= totalPages ? 'page-btn-disabled' : 'page-btn-active'}"
                    ${currentPage >= totalPages ? 'disabled' : ''}>
                    ${translate('next')}
            </button>
        </div>` : '<div></div>';

    const saveRow = createSaveRow();

    const sortButtonLayout = (reportType === 'phone' && filterType === 'fixable')
        ? [
            { style: 'name', label: 'name' },
            { style: 'fixable', label: 'suggestedFix' },
            { style: 'invalid', label: 'invalidNumber' },
        ]
        : (reportType === 'phone' && filterType === 'foreign')
            ? [
                { style: 'name', label: 'name' },
                { style: 'date', label: 'date' },
                { style: 'foreign', label: 'phoneNumber' },
            ]
            : reportType === 'phone' //invalid phone
                ? [
                    { style: 'name', label: 'name' },
                    { style: 'date', label: 'date' },
                    { style: 'invalid', label: 'invalidNumber' },
                ]
                : [ // name
                    { style: 'name', label: 'name' },
                    { style: 'date', label: 'date' },
                ];

    const sortControlContainer = sortButtonLayout
        .map(row => `
            <button data-action="sort" data-section="${filterType}" data-sort-key="${row.style}"
                class="sort-btn sort-btn-style ${getSortStyle(row.style)}">
                ${translate(row.label)}
            </button>`).join('');

    const pageAndSortControls = `
        ${pageControls}
        <div class="sort-controls">
            <span class="sort-label">${translate('sortBy')}</span>
            ${sortButtonLayout.length === 2 ? '<span></span>' : ''}
            ${sortControlContainer}
        </div>`

    const paginationSortCard = `
        <div class="page-sort-card ${reportType === 'name' ? 'top-24' : ''}">
            ${filterType === 'fixable' ? `
                <div class="save-sort-container">
                    <div>${saveRow}</div>
                    <div class="page-sort-controls">${pageAndSortControls}</div>
                </div>
                `
            : pageAndSortControls}
        </div>
    `;

    const sectionContent = `
        <div class="section-header-container ${filterType === 'fixable' ? '' : 'text-center'}">
            <h2 class="section-header">${headerStr}</h2>
            <p class="section-description">${descriptionStr}</p>
        </div>
        ${paginationSortCard}
        <ul class="report-list mt-4" id="report-list-${filterType}">
            ${totalItems > 0 ? listContent : ''}
        </ul>
    `;

    document.getElementById(containerId).innerHTML = sectionContent;
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
 * Toggles the visibility of the upload spinner element.
 * @param {boolean} isLoading - True to show the spinner, false to hide it.
 * @returns {void}
 */
export function toggleUploadingSpinner(isLoading) {
    const uploadSpinner = document.getElementById('upload-spinner');
    if (isLoading) {
        uploadSpinner.classList.remove('hidden');
    } else {
        uploadSpinner.classList.add('hidden');
    }
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
    commentBox.value = `${subdivisionName}: ` + CHANGESET_TAGS.comment;

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
 * Displays the modal window for creating a note and checks if the user is logged into OSM.
 * @param {object} item - The item to create a note for.
 * @returns {void}
 */
export function openNoteModal(item) {
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

    let noteComment;

    if (reportType === 'phone') {
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

        noteComment = invalidWithoutFix.length > 1
            ? translate('hasInvalidPlural', { '%n': item.featureTypeName })
            : translate('hasInvalidSingular', { '%n': item.featureTypeName });

        noteComment += '\n\n';
        noteComment += invalidNumbersList;
    } else if (reportType === 'name') {
        noteComment = item.name
            ? translate('hasIncompleteName', { '%n': item.featureTypeName })
            : translate('hasMissingName', { '%n': item.featureTypeName });

        const namesList = item.fixRows
            .flatMap(obj =>
                Object.entries(obj).map(([key, value]) => `${key} = ${value}`)
            )
            .join('\n');

        noteComment += '\n\n';
        noteComment += namesList;
    }

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

    if (appState.noteButtonClickHandler) {
        addNoteBtn.removeEventListener('click', appState.noteButtonClickHandler);
        appState.noteButtonClickHandler = null;
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
export function closeEditsModal() {
    setUpSaveBtn();
    editsModal.classList.remove('active');
    setTimeout(() => {
        editsModal.classList.add('hidden');
    }, 300);
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
export function enableModalCloseListeners() {
    uploadModal.addEventListener('click', handleUploadModalClick);
    noteModal.addEventListener('click', handleNoteModalClick);
    document.addEventListener('keydown', handleDocumentKeydown);
}

/**
 * Removes the event listeners used for closing modals, typically called during an upload process.
 * @returns {void}
 */
export function disableModalCloseListeners() {
    uploadModal.removeEventListener('click', handleUploadModalClick);
    document.removeEventListener('keydown', handleDocumentKeydown);
}

/**
 * Renders the editor selection checkboxes inside the settings menu
 * based on the list of all available editors.
 */
export function createSettingsCheckboxes() {
    settingsMenu.innerHTML = '';

    ALL_EDITOR_IDS.forEach(id => {
        const isChecked = appState.currentActiveEditors.includes(id);
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
 * Updates the `currentActiveEditors` array and saves the settings.
 * @param {Event} event - The change event from the checkbox.
 */
function handleEditorChange(event) {
    const checkbox = event.target;
    if (checkbox.type === 'checkbox') {
        const editorId = checkbox.dataset.editorId;

        if (checkbox.checked) {
            if (!appState.currentActiveEditors.includes(editorId)) {
                appState.currentActiveEditors.push(editorId);
            }
        } else {
            appState.currentActiveEditors = appState.currentActiveEditors.filter(id => id !== editorId);
        }

        saveSettings();
        applyEditorVisibility();
    }
}

/**
 * Shows or hides editor buttons on the page based on the user's
 * current visibility settings in `currentActiveEditors`.
 */
export function applyEditorVisibility() {
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
            const isVisible = appState.currentActiveEditors.includes('JOSM');
            button.style.display = isVisible ? 'inline-flex' : 'none';
            return;
        }
        if (editorId === 'fix-label') {
            // const isVisible = !appState.currentActiveEditors.includes('JOSM');
            // TODO: determine whether to keep this label or just always show the fix button
            const isVisible = false;
            button.style.display = isVisible ? 'inline-flex' : 'none';
            return;
        }

        const isVisible = appState.currentActiveEditors.includes(editorId);
        button.style.display = isVisible ? 'inline-flex' : 'none';
    });
}

/**
 * Enables the 'Save' button by changing its styling and setting its disabled property to false.
 * @returns {void}
 */
export function enableSave() {
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
export function enableUndo() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) { enableGrayBtn(undoBtn) };
}

/**
 * Disables the 'Undo' button by changing its styling and setting its disabled property to true.
 * @returns {void}
 */
export function disableUndo() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) { disableGrayBtn(undoBtn) };
}

/**
 * Enables the 'Redo' button by changing its styling and setting its disabled property to false.
 * @returns {void}
 */
export function enableRedo() {
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) { enableGrayBtn(redoBtn) };
}

/**
 * Disables the 'Redo' button by changing its styling and setting its disabled property to true.
 * @returns {void}
 */
export function disableRedo() {
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
 * Updates the 'Save' button text and state (enabled/disabled) based on
 * the current count of pending local edits in the 'edits' storage.
 * @returns {void}
 */
export function setUpSaveBtn() {
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
 * on the current state of the `undoData` position and stack.
 * @returns {void}
 */
export function setUpUndoRedoBtns() {
    if (undoData.position === 0) {
        disableUndo();
    } else {
        enableUndo();
    }
    if (undoData.position < undoData.stack.length) {
        enableRedo();
    } else {
        disableRedo();
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
export function transitionRemoveItem(osmType, osmId) {
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
 * Inserts a newly "undone" item back into the fixable report list with a
 * transition animation, maintaining the current sort order.
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
export function transitionInsertItem(osmType, osmId) {
    const filterType = getFilterType(osmType, osmId);
    const sortedItems = getSortedItems(filterType);
    const { item: newItem, index } = getItemWithIndex(osmType, osmId, filterType);

    const newListItemHtmlString = createListItem(newItem);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newListItemHtmlString.trim();
    const newListItem = tempDiv.firstChild;

    newListItem.classList.add('fade-in-start');
    const reportList = document.getElementById(`report-list-${filterType}`);

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
