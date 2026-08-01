import {
    addNoteBtn,
    appState,
    commentBox,
    noteCancelBtn,
    noteCloseBtnBottom,
    undoData,
    uploadBtn,
    uploadCancelBtn,
    uploadCloseBtnBottom,
    UPLOADED_ITEMS_KEY,
} from './report-state.js';
import { getEdits, moveEditsToUploadedStorage, persistUndoState, saveEdits } from './report-storage.js';
import {
    disableCreateNoteWithMessage,
    disableModalCloseListeners,
    enableModalCloseListeners,
    openNoteModal,
    renderNumbers,
    setUpSaveBtn,
    toggleUploadingSpinner,
} from './report-ui-controller.js';
import { calculateBufferedBBox, escapeHTML, getSortedItems, sortItems } from './report-utils.js';
import { subdivisionName, changesetTags, reportType, safeCountryName } from './config.js';
import { translate } from './i18n.js';
import { getOSM } from './osm-wrapper.js';

const redirectUrl = `${changesetTags.host}land.html`;

/**
 * Sends a command to the JOSM Remote Control API.
 * Prevents the default link action and provides user feedback in the console.
 * @param {string} url - The JOSM Remote Control URL to fetch.
 */
export function openInJosm(url) {
    fetch(url)
        .then(response => {
            if (response.ok) {
                console.log('JOSM command sent successfully.');
            } else {
                console.error(
                    'Failed to send command to JOSM. Please ensure JOSM is running with Remote Control enabled.'
                );
            }
        })
        .catch(error => {
            console.error('Could not connect to JOSM Remote Control. Please ensure JOSM is running.', error);
        });
}

/**
 * Initiates the OAuth 2.0 login flow with the OpenStreetMap (OSM) API.
 * Uses a popup mode and requests specific scopes (write_api, read_prefs, write_notes).
 * Upon successful login, it calls initLogin. Displays an error on failure.
 * @returns {void}
 */
export async function login() {
    const errorDiv = document.querySelector('#error-div');
    errorDiv.innerText = '';
    errorDiv.hidden = true;

    const OSM = await getOSM();
    OSM.login({
        mode: 'popup',
        clientId: 'bexjmcD0H12VKCGMYNmbIA10FYh1O96vgF4-1xH6qKs',
        redirectUrl: redirectUrl,
        scopes: ['write_api', 'read_prefs', 'write_notes'],
    })
        .then(initLogin)
        .catch(err => {
            errorDiv.hidden = false;
            errorDiv.innerText = `${err}`;
        });
}

/**
 * Logs the user out of the OSM API and clears the local storage of the display name.
 * Triggers re-initialization of the login state.
 * @returns {void}
 */
export async function logout() {
    const OSM = await getOSM();
    OSM.logout();
    localStorage.removeItem('osm_display_name');
    initLogin();
}

/**
 * Fetches the currently logged-in OSM user's details and updates the logout button text
 * to include the user's display name. Stores the display name in localStorage.
 * Handles errors if the user is not logged in or the request fails.
 * @returns {void}
 */
async function getUser() {
    const logoutBtn = document.getElementById('logout-btn');
    const errorDiv = document.getElementById('error-div');
    const displayName = localStorage.getItem('osm_display_name');

    if (displayName) {
        logoutBtn.innerText = `${translate('logout')} ${displayName}`;
        return;
    }

    const OSM = await getOSM();
    OSM.getUser('me')
        .then(result => {
            logoutBtn.textContent = `${translate('logout')} ${result.display_name}`;
            localStorage.setItem('osm_display_name', result.display_name);
            errorDiv.textContent = '';
            errorDiv.hidden = true;
        })
        .catch(err => {
            logoutBtn.textContent = String(err);
        });
}

/**
 * Checks the OSM login status and updates the visibility and text of the
 * login and logout buttons accordingly. Calls getUser if logged in.
 * @returns {void}
 */
export async function initLogin() {
    const OSM = await getOSM();
    if (OSM.isLoggedIn()) {
        document.getElementById('logout-btn').hidden = false;
        document.getElementById('login-btn').hidden = true;

        // For upload modal
        document.getElementById('modal-login-btn').hidden = true;
        uploadBtn.disabled = false;
        uploadBtn.classList.remove('cursor-not-allowed');
        uploadBtn.classList.add('cursor-pointer');
        document.getElementById('message-box').classList.add('hidden');
        getUser();
    } else {
        document.getElementById('logout-btn').hidden = true;
        document.getElementById('login-btn').hidden = false;
    }
}

/**
 * Applies a set of tag edits (key-value pairs) to an OSM feature's 'tags' object.
 * If an edit value is explicitly set to null, the corresponding tag key is deleted
 * from the feature's tags.
 *
 * @param {object} feature - The feature object (node, way, or relation) containing the 'tags' object.
 * @param {object} elementEdits - The object of key-value edits to apply. A value of null indicates a deletion.
 * @returns {boolean} Whether any changes were made
 */
function applyEditsToFeatureTags(feature, elementEdits) {
    let changed = false;

    // visible is false for deleted objects and unset for normal objects
    const isDeleted = (feature.visible ?? true) === false;

    // If a feature does not have any tags, it has dramatically changed since it was originally fetched
    if (isDeleted || !feature.tags || typeof feature.tags !== 'object') {
        return false;
    }

    const item = appState.reportData.find(item => {
        return item.id === feature.id && item.type === feature.type;
    });

    const tags = feature.tags;

    for (const key in elementEdits) {
        if (Object.hasOwn(elementEdits, key)) {
            const value = elementEdits[key];

            // If any of the target tags have changed, make no changes
            // originalValue could be undefined or null when a new tag is being added (moving from mobile or adding mnemonic)
            const originalValue = item.invalidNumbers?.[key];
            if (originalValue !== undefined && originalValue !== null && tags[key] !== originalValue) {
                return false;
            }

            if (value === null) {
                if (Object.hasOwn(tags, key)) {
                    delete tags[key];
                    changed = true;
                }
            } else if (tags[key] !== value) {
                tags[key] = value;
                changed = true;
            }
        }
    }

    return changed;
}

/**
 * Asynchronously uploads the local edits for the current subdivision to OpenStreetMap
 * as a single changeset. It fetches the latest feature data, applies the local
 * edits, checks for actual tag changes, and then calls the OSM API to upload.
 *
 * @async
 * @returns {Promise<number|undefined>} A promise that resolves with the new changeset ID if modifications were uploaded, or undefined if no modifications were submitted.
 */
async function uploadChanges() {
    const edits = getEdits();

    let modifications = [];
    const subdivisionEdits = edits[subdivisionName];

    const elementTypes = ['node', 'way', 'relation'];

    const MAX_FEATURES_PER_FETCH = 500;

    const OSM = await getOSM();

    for (const type of elementTypes) {
        const editsForType = subdivisionEdits[type];

        if (editsForType) {
            const featureIds = Object.keys(editsForType);

            if (featureIds.length > 0) {
                const featureIdChunks = [];
                for (let i = 0; i < featureIds.length; i += MAX_FEATURES_PER_FETCH) {
                    featureIdChunks.push(featureIds.slice(i, i + MAX_FEATURES_PER_FETCH));
                }

                let allFeatures = [];
                for (const chunk of featureIdChunks) {
                    const features = await OSM.getFeatures(type, chunk);
                    allFeatures.push(...features);
                }

                for (const feature of allFeatures) {
                    const changed = applyEditsToFeatureTags(feature, editsForType[feature.id]);
                    if (changed) {
                        modifications.push(feature);
                    }
                }
            }
        }
    }

    if (modifications.length > 0) {
        const result = await OSM.uploadChangeset(
            { ...changesetTags, ...{ comment: commentBox.value.trim() } },
            { create: [], modify: modifications, delete: [] }
        );
        moveEditsToUploadedStorage();
        return result;
    }

    moveEditsToUploadedStorage();
}

/**
 * Checks the area for any notes
 *
 * @param {string} lat - The centre latitude.
 * @param {number} long - The centre longitude.
 * @returns {void}
 */
async function checkForNotes(lat, lon) {
    const bbox = calculateBufferedBBox(lat, lon, 5);
    const OSM = await getOSM();
    const notesInArea = await OSM.getNotesForArea(bbox);
    return notesInArea;
}

/**
 * Starts the creation of a note for a given element
 *
 * @param {string} osmType - The OpenStreetMap element type.
 * @param {number} osmId - The ID of the OpenStreetMap element.
 * @returns {void}
 */
export function addNote(osmType, osmId) {
    const item = appState.reportData.find(item => {
        return item.id === osmId && item.type === osmType;
    });
    openNoteModal(item);
    checkForNotes(item.lat, item.lon)
        .then(result => {
            const openNotesMessage = result
                .filter(note => note.status === 'open')
                .map(note => note.id)
                .map(id =>
                    translate('noteIsClose', {
                        id: `<a href="https://www.openstreetmap.org/note/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${escapeHTML(id)}</a>`,
                    })
                )
                .join('<br>');
            if (openNotesMessage.length > 0) {
                disableCreateNoteWithMessage(openNotesMessage);
            } else {
                const itemId = `${item.type}/${item.id}`;
                if (appState.noteButtonClickHandler) {
                    addNoteBtn.removeEventListener('click', appState.noteButtonClickHandler);
                }

                appState.noteButtonClickHandler = function () {
                    checkAndCreateNote(itemId, item.lat, item.lon);
                };

                addNoteBtn.addEventListener('click', appState.noteButtonClickHandler);
            }
        })
        .catch(err => {
            disableCreateNoteWithMessage(`Error fetching notes: ${err}`);
        });
}

/**
 * Validates the note comment, creates the note if valid,
 * and handles the UI state (disabling/enabling buttons, showing messages/spinner)
 * before, during, and after the creation or error.
 * @returns {void}
 */
async function checkAndCreateNote(itemId, lat, lon) {
    const noteCommentBox = document.getElementById('note-comment');
    const comment = noteCommentBox.value.trim();
    const messageBox = document.getElementById('note-message-box');

    if (comment.length > 0) {
        messageBox.classList.add('hidden');

        disableModalCloseListeners();

        addNoteBtn.classList.remove('cursor-pointer');
        addNoteBtn.classList.add('cursor-progress');
        addNoteBtn.disabled = true;
        noteCancelBtn.classList.add('hidden');

        noteCommentBox.disabled = true;
        noteCommentBox.classList.add('cursor-not-allowed');

        const OSM = await getOSM();
        OSM.createNote(lat, lon, noteCommentBox.value.trim())
            .then(result => {
                const successMessage = translate('noteCreated', {
                    id: `<a href="https://www.openstreetmap.org/note/${encodeURIComponent(result.id)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${escapeHTML(result.id)}</a>`,
                });
                messageBox.className = 'message-box-success';
                messageBox.innerHTML = successMessage;
                messageBox.classList.remove('hidden');
                addNoteBtn.classList.add('hidden');
                noteCloseBtnBottom.classList.remove('hidden');

                let createdNotes = JSON.parse(localStorage.getItem(`createdNotes_${subdivisionName}`)) || [];
                createdNotes.push(itemId);
                localStorage.setItem(`createdNotes_${subdivisionName}`, JSON.stringify(createdNotes));

                enableModalCloseListeners();
                // Re-render to make note button grey
                renderNumbers();
            })
            .catch(err => {
                addNoteBtn.disabled = false;
                addNoteBtn.classList.add('cursor-pointer');
                addNoteBtn.classList.remove('cursor-progress');

                messageBox.className = 'message-box-error';
                messageBox.textContent = `There was an error: ${err}`;
                messageBox.classList.remove('hidden');

                noteCancelBtn.classList.remove('hidden');
                enableModalCloseListeners();
            });
    } else {
        messageBox.className = 'message-box-error';
        messageBox.innerHTML = translate('enterComment');
        messageBox.classList.remove('hidden');
    }
}

/**
 * Validates the changeset comment, initiates the upload process if valid,
 * and handles the UI state (disabling/enabling buttons, showing messages/spinner)
 * before, during, and after the upload or error.
 * @returns {void}
 */
export function checkAndSubmit() {
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
            .then(result => {
                if (result) {
                    const changesetIds = Object.keys(result || {});
                    const links = changesetIds
                        .map(
                            id =>
                                `<a href="https://www.openstreetmap.org/changeset/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${escapeHTML(id)}</a>`
                        )
                        .join(', ');
                    const successMessage = translate('changesetCreated', { id: links });

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

                undoData.position = 0;
                undoData.stack = [];

                // Re-render numbers to hide uploaded elements
                renderNumbers();
                enableModalCloseListeners();
            })
            .catch(err => {
                toggleUploadingSpinner(false);
                uploadBtn.textContent = translate('upload');
                uploadBtn.disabled = false;
                uploadBtn.classList.add('cursor-pointer');
                uploadBtn.classList.remove('cursor-progress');

                messageBox.className = 'message-box-error';
                messageBox.textContent = `There was an error: ${err}`;
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

const INVALID_PROPERTY_MAP = {
    phone: 'invalidNumbers',
    hours: 'invalidHours',
    name: 'nameTags',
};

/**
 * Compares the tags of an OpenStreetMap (OSM) feature against the expected invalid tag values
 * to determine if any changes have occurred.
 *
 * @param {Object} [osmFeature] - The fetched OSM feature object.
 * @param {Object} originalItem - The reference item containing original tag metadata.
 * @returns {boolean} `true` if any actual tag value differs from its expected invalid value; otherwise `false`.
 */
function compareTags(osmFeature, originalItem) {
    let hasChanges = false;
    const key = INVALID_PROPERTY_MAP[reportType];
    const invalidTags = key ? originalItem[key] : {};

    const fetchedTags = osmFeature?.tags || {};

    for (const [tagName, expectedValue] of Object.entries(invalidTags)) {
        const actualValue = fetchedTags[tagName] ?? null;
        hasChanges = actualValue !== expectedValue;
        if (hasChanges) return true;
    }
    return hasChanges;
}

/**
 * Processes a list of items to detect external OSM updates or deletions, purges stale
 * local pending edits/undo stacks for those features and updates local storage state.
 *
 * @async
 * @param {Array<Object>} items - The list of items to check.
 * @returns {Promise<void>} Resolves once feature updates are processed, edits are saved and the UI is re-rendered.
 */
async function updateFeatures(items) {
    const grouped = items.reduce((acc, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
    }, {});

    const changedItems = {};

    for (const [type, items] of Object.entries(grouped)) {
        const itemMap = new Map(items.map(item => [item.id, item]));
        const ids = items.map(item => item.id);

        const fetchedFeatures = await OSM.getFeatures(type, ids);

        for (const osmFeature of fetchedFeatures) {
            const originalItem = itemMap.get(osmFeature.id);

            if (!originalItem) continue;

            const isDeleted = (osmFeature.visible ?? true) === false;

            if (
                isDeleted ||
                !osmFeature.tags ||
                typeof osmFeature.tags !== 'object' ||
                compareTags(osmFeature, originalItem)
            ) {
                changedItems[type] ??= {};
                changedItems[type][osmFeature.id] = { changed: true };
            }
        }
    }

    // In case user quickly applied edits before features were checked
    // Need to do this outside of loop in case user is still clicking before re-render
    const edits = getEdits();
    for (const [osmType, features] of Object.entries(changedItems)) {
        for (const osmId of Object.keys(features)) {
            delete edits[subdivisionName]?.[osmType]?.[osmId];
            const index = undoData.stack.findIndex(([type, id]) => type === osmType && id === parseInt(osmId));
            if (index !== -1) {
                undoData.stack.splice(index, 1);
                undoData.position -= 1;
            }
        }
    }
    saveEdits(edits);
    setUpSaveBtn();
    persistUndoState();

    const uploadedChanges = JSON.parse(localStorage.getItem(UPLOADED_ITEMS_KEY)) ?? {};

    uploadedChanges[safeCountryName] ??= {};
    uploadedChanges[safeCountryName][subdivisionName] ??= {};

    const subdivisionUploaded = uploadedChanges[safeCountryName][subdivisionName];

    for (const type in changedItems) {
        subdivisionUploaded[type] = {
            ...(changedItems[type] || {}),
            ...subdivisionUploaded[type],
        };
    }
    localStorage.setItem(UPLOADED_ITEMS_KEY, JSON.stringify(uploadedChanges));
    renderNumbers();
}

/**
 * Checks a sample of the proposed changes to see if their value has changed since page creation
 * @returns {void}
 */
export async function checkForChanges() {
    const OSM = await getOSM();

    if (!OSM.isLoggedIn()) return;

    const fixableItems = getSortedItems('fixable');
    const missingItems = getSortedItems('missing');
    const invalidItems = getSortedItems('invalid');

    for (const itemSet of [fixableItems, missingItems, invalidItems]) {
        // Let's not hit the API with too many requests, if there are more than 1000 then don't bother checking at all
        if (!itemSet || itemSet.length > 1000) continue;
        const dateSortedItems = sortItems(itemSet, 'date', 'asc');
        const nameSortedItems = sortItems(itemSet, 'name', 'asc');

        const sampleItems = Array.from(
            new Set(
                [
                    itemSet.at(0),
                    itemSet.at(-1),
                    dateSortedItems.at(0),
                    dateSortedItems.at(-1),
                    nameSortedItems.at(0),
                    nameSortedItems.at(-1),
                ].filter(Boolean)
            )
        );

        if (sampleItems.length === 0) return;

        const grouped = sampleItems.reduce((acc, item) => {
            if (!acc[item.type]) acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {});

        let anyChanged = false;

        for (const [type, items] of Object.entries(grouped)) {
            const ids = items.map(item => item.id);

            const fetchedFeatures = await OSM.getFeatures(type, ids);

            const featureMap = new Map(fetchedFeatures.map(feat => [feat.id, feat]));

            for (const item of items) {
                const fetchedFeature = featureMap.get(item.id);

                anyChanged = compareTags(fetchedFeature, item);
                if (anyChanged) break;
            }
            if (anyChanged) break;
        }

        if (anyChanged) updateFeatures(itemSet);
    }
}
