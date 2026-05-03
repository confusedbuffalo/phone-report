import { addNoteBtn, appState, noteCancelBtn, noteCloseBtnBottom, undoData, uploadBtn, uploadCancelBtn, uploadCloseBtnBottom } from "./report-state.js";
import { moveEditsToUploadedStorage } from "./report-storage.js";
import { enableModalCloseListeners, openNoteModal, renderNumbers, toggleUploadingSpinner } from "./report-ui-controller.js";

const redirectUrl = reportType === 'phone' ? 'https://confusedbuffalo.github.io/phone-report/land.html' : 'https://names-report.pages.dev/land.html';

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
                console.error('Failed to send command to JOSM. Please ensure JOSM is running with Remote Control enabled.');
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
export function login() {
    const errorDiv = document.querySelector("#error-div");
    errorDiv.innerText = "";
    errorDiv.hidden = true;

    OSM.login({
        mode: "popup",
        clientId: "bexjmcD0H12VKCGMYNmbIA10FYh1O96vgF4-1xH6qKs",
        redirectUrl: redirectUrl,
        scopes: ["write_api", "read_prefs", "write_notes"],
    })
        .then(initLogin)
        .catch((err) => {
            errorDiv.hidden = false;
            errorDiv.innerText = `${err}`;
        });
}

/**
 * Logs the user out of the OSM API and clears the local storage of the display name.
 * Triggers re-initialization of the login state.
 * @returns {void}
 */
export function logout() {
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
function getUser() {
    const logoutBtn = document.getElementById("logout-btn");
    const errorDiv = document.getElementById("error-div");
    const displayName = localStorage.getItem('osm_display_name');

    if (displayName) {
        logoutBtn.innerText = `Logout ${displayName}`;
        return;
    }

    OSM.getUser("me")
        .then((result) => {
            logoutBtn.innerText = `Logout ${result.display_name}`;
            localStorage.setItem('osm_display_name', result.display_name);
            errorDiv.innerText = '';
            errorDiv.hidden = true;
        })
        .catch((err) => {
            logoutBtn.innerText = `${err}`;
        });
}

/**
 * Checks the OSM login status and updates the visibility and text of the
 * login and logout buttons accordingly. Calls getUser if logged in.
 * @returns {void}
 */
export function initLogin() {
    if (OSM.isLoggedIn()) {
        document.getElementById("logout-btn").hidden = false;
        document.getElementById("login-btn").hidden = true;
        getUser();
    } else {
        document.getElementById("logout-btn").hidden = true;
        document.getElementById("login-btn").hidden = false;
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
    let edits = JSON.parse(localStorage.getItem('edits')) || {};

    let modifications = [];
    const subdivisionEdits = edits[subdivisionName];

    const elementTypes = ['node', 'way', 'relation'];

    const MAX_FEATURES_PER_FETCH = 500;

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
                    changed = applyEditsToFeatureTags(feature, editsForType[feature.id])
                    if (changed) {
                        modifications.push(feature);
                    }
                }
            }
        }
    }

    if (modifications.length > 0) {
        const result = await OSM.uploadChangeset(
            { ...CHANGESET_TAGS, ...{ 'comment': commentBox.value.trim() } },
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
        .then((result) => {
            const openNotesMessage = result
                .filter(note => note.status === 'open')
                .map(note => note.id)
                .map(id => translate('noteIsClose', { '%n': `<a href="https://www.openstreetmap.org/note/${id}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${id}</a>` }))
                .join('\n');
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
        .catch((err) => {
            disableCreateNoteWithMessage(`Error fetching notes: ${err}`);
        });
}

/**
 * Validates the note comment, creates the note if valid,
 * and handles the UI state (disabling/enabling buttons, showing messages/spinner)
 * before, during, and after the creation or error.
 * @returns {void}
 */
function checkAndCreateNote(itemId, lat, lon) {
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

        OSM.createNote(lat, lon, noteCommentBox.value.trim())
            .then((result) => {
                const successMessage = translate(
                    'noteCreated',
                    { '%n': `<a href="https://www.openstreetmap.org/note/${result.id}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${result.id}</a>` }
                );
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
            .catch((err) => {
                addNoteBtn.disabled = false;
                addNoteBtn.classList.add('cursor-pointer');
                addNoteBtn.classList.remove('cursor-progress');

                messageBox.className = 'message-box-error';
                messageBox.innerHTML = `There was an error: ${err}`;
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
    const commentBox = document.getElementById('changesetComment')
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
            .then((result) => {
                if (result) {
                    const changesetIds = Object.keys(result || {});
                    const links = changesetIds.map(id =>
                        `<a href="https://www.openstreetmap.org/changeset/${id}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${id}</a>`
                    ).join(', ');
                    const successMessage = translate(
                        'changesetCreated',
                        { '%n': links }
                    );

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
            .catch((err) => {
                toggleUploadingSpinner(false);
                uploadBtn.innerHTML = translate('upload');
                uploadBtn.disabled = false;
                uploadBtn.classList.add('cursor-pointer');
                uploadBtn.classList.remove('cursor-progress');

                messageBox.className = 'message-box-error';
                messageBox.innerHTML = `There was an error: ${err}`;
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
