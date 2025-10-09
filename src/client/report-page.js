/**
 * Sends a command to the JOSM Remote Control API.
 * Prevents the default link action and provides user feedback in the console.
 * @param {string} url - The JOSM Remote Control URL to fetch.
 * @param {Event} event - The click event, to prevent its default action.
 */
function openInJosm(url, event) {
    event.preventDefault();
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
 * Checks if the current viewport width corresponds to a mobile device.
 * @returns {boolean} True if the viewport is likely a mobile device.
 */
function isMobileView() {
    // This checks if the viewport width is less than a common tablet/desktop breakpoint (e.g., 768px for Tailwind's 'md')
    return window.matchMedia("(max-width: 767px)").matches;
}

const DEFAULT_EDITORS = isMobileView() ? DEFAULT_EDITORS_MOBILE : DEFAULT_EDITORS_DESKTOP;

const settingsToggle = document.getElementById('settings-toggle');
const settingsMenu = document.getElementById('editor-settings-menu');

let currentActiveEditors = [];

// Storage & Utility Functions

/**
 * Loads the user's preferred editor settings from localStorage.
 * If no settings are found, it falls back to the default editors.
 */
function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            currentActiveEditors = JSON.parse(saved);
            return;
        }
    } catch (e) {
        console.error("Error loading settings from localStorage:", e);
    }
    // Fallback to defaults
    currentActiveEditors = [...DEFAULT_EDITORS]; 
}

/**
 * Saves the current editor visibility settings to localStorage.
 */
function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentActiveEditors));
    } catch (e) {
        console.error("Error saving settings to localStorage:", e);
    }
}

// UI Rendering and Event Handlers

/**
 * Renders the editor selection checkboxes inside the settings menu
 * based on the list of all available editors.
 */
function createSettingsCheckboxes() {
    settingsMenu.innerHTML = '';

    ALL_EDITOR_IDS.forEach(id => {
        const isChecked = currentActiveEditors.includes(id);
        const checkboxHtml = `
            <div class="flex items-center justify-between py-5 px-5">
                <label for="editor-${id}" class="text-sm text-gray-700 dark:text-gray-300 w-full text-right mr-2">${id}</label>
                <input id="editor-${id}" type="checkbox" data-editor-id="${id}" ${isChecked ? 'checked' : ''}
                    class="h-4 w-4 text-blue-600 border-gray-300 rounded-sm focus:ring-blue-500 flex-shrink-0">
            </div>
        `;
        settingsMenu.insertAdjacentHTML('beforeend', checkboxHtml);
    });

    settingsMenu.addEventListener('change', handleEditorChange);
}

/**
 * Handles the change event for editor visibility checkboxes.
 * Updates the \`currentActiveEditors\` array and saves the settings.
 * @param {Event} event - The change event from the checkbox.
 */
function handleEditorChange(event) {
    const checkbox = event.target;
    if (checkbox.type === 'checkbox') {
        const editorId = checkbox.dataset.editorId;
        
        if (checkbox.checked) {
            if (!currentActiveEditors.includes(editorId)) {
                currentActiveEditors.push(editorId);
            }
        } else {
            currentActiveEditors = currentActiveEditors.filter(id => id !== editorId);
        }
        
        saveSettings();
        applyEditorVisibility();
    }
}

// Visibility Application

/**
 * Shows or hides editor buttons on the page based on the user's
 * current visibility settings in \`currentActiveEditors\`.
 */
function applyEditorVisibility() {
    // Find all editor buttons using the data-editor-id attribute
    const buttons = document.querySelectorAll(':not(input)[data-editor-id]');
    
    buttons.forEach(button => {
        const editorId = button.dataset.editorId;
        
        // Special handling for the JOSM Fix button: always visible if JOSM is active
        // Display fix label if fix button is invisible
        if (editorId === 'josm-fix') {
            const isVisible = currentActiveEditors.includes('JOSM');
            button.style.display = isVisible ? 'inline-flex' : 'none';
            return;
        }
        if (editorId === 'fix-label') {
            const isVisible = !currentActiveEditors.includes('JOSM');
            button.style.display = isVisible ? 'inline-flex' : 'none';
            return;
        }
        
        const isVisible = currentActiveEditors.includes(editorId);
        button.style.display = isVisible ? 'inline-flex' : 'none';
    });
}

// Initialization

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