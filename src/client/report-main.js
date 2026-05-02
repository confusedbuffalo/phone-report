import { initLogin } from "./report-osm-edit.js";
import { appState, commentBox, settingsMenu, settingsToggle } from "./report-state.js";
import { loadSettings } from "./report-storage.js";
import { applyEditorVisibility, createSettingsCheckboxes, enableModalCloseListeners, renderNumbers } from "./report-ui-controller.js";
import { filterCreatedNotes } from "./report-utils.js";

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    createSettingsCheckboxes();
    applyEditorVisibility();

    settingsToggle.addEventListener('click', (event) => {
        settingsMenu.classList.toggle('hidden');
        event.stopPropagation(); // Stop click from propagating to document listener
    });

    // Close the menu if user clicks outside
    document.addEventListener('click', (event) => {
        if (!settingsMenu.contains(event.target) && !settingsToggle.contains(event.target)) {
            settingsMenu.classList.add('hidden');
        }
    });
});

/**
 * Initializes the report page by fetching the report data from the defined
 * path and then triggering the main rendering function. Displays an error
 * if data loading fails.
 * @async
 * @returns {void}
 */
async function initReportPage() {
    try {
        const response = await fetch(DATA_FILE_PATH);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        appState.reportData = await response.json();
    } catch (error) {
        console.error("Failed to load phone validation data:", error);
        // Display an error message to the user if data loading fails
        const container = document.getElementById("reportContainer");
        if (container) {
            container.innerHTML = '<p class="text-red-500 font-bold">Error: Could not load report data. Please check the network connection and the data file path.</p>';
        }
        return;
    }

    // Check stored ids of elements that have had notes created and clear any no longer in report data (presume fixed)
    let createdNotes = JSON.parse(localStorage.getItem(`createdNotes_${subdivisionName}`)) || [];
    const updatedNotes = filterCreatedNotes(createdNotes, appState.reportData);
    localStorage.setItem(`createdNotes_${subdivisionName}`, JSON.stringify(updatedNotes));

    renderNumbers();
}

commentBox.value = CHANGESET_TAGS['comment'];

enableModalCloseListeners();
initReportPage();
initLogin();
