export let pageSize = 50;

export const currentPage = {
    fixable: 1,
    invalid: 1,
    foreign: 1,
    missing: 1,
}

export const sortDirection = {
    fixable: 'asc',
    invalid: 'asc',
    foreign: 'asc',
    missing: 'asc',
}

export const sortKey = {
    fixable: 'none',
    invalid: 'none',
    foreign: 'none',
    missing: 'none',
}

export const undoData = {
    stack: JSON.parse(localStorage.getItem(`undoStack_${subdivisionName}`)) ?? [],
    position: +localStorage.getItem(`undoPosition_${subdivisionName}`) ?? 0,
}

export const appState = {
    noteButtonClickHandler: null,
    currentActiveEditors: [],
    reportData: null,
}

export const CLICKED_ITEMS_KEY = `clickedItems_${DATA_LAST_UPDATED}`;
export const UPLOADED_ITEMS_KEY = `uploaded_${DATA_LAST_UPDATED}`;

export const settingsToggle = document.getElementById('settings-toggle');
export const settingsMenu = document.getElementById('editor-settings-menu');

export const uploadCancelBtn = document.getElementById('cancel-modal-btn');
export const uploadCloseBtnBottom = document.getElementById('close-modal-btn-bottom');
export const uploadBtn = document.getElementById('upload-changes-btn');
export const uploadModal = document.getElementById('upload-modal-overlay');
export const commentBox = document.getElementById('changesetComment');

export const editsModal = document.getElementById('edits-modal-overlay');

export const noteCancelBtn = document.getElementById('cancel-note-modal-btn');
export const noteCloseBtnBottom = document.getElementById('close-note-modal-btn-bottom');
export const addNoteBtn = document.getElementById('add-note-btn');
export const noteModal = document.getElementById('note-modal-overlay');

const isMobileView = window.matchMedia("(max-width: 767px)").matches;
export const DEFAULT_EDITORS = isMobileView ? DEFAULT_EDITORS_MOBILE : DEFAULT_EDITORS_DESKTOP;
