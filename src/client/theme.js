/**
 * Initializes the theme toggle button logic.
 * It updates the toggle icon visibility and sets up the click event listener.
 */
export function initThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle');

    const updateIcons = () => {
        const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
        const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

        if (document.documentElement.classList.contains('dark')) {
            if (themeToggleLightIcon) themeToggleLightIcon.classList.remove('hidden');
            if (themeToggleDarkIcon) themeToggleDarkIcon.classList.add('hidden');
        } else {
            if (themeToggleDarkIcon) themeToggleDarkIcon.classList.remove('hidden');
            if (themeToggleLightIcon) themeToggleLightIcon.classList.add('hidden');
        }
    };

    // Initial icon state
    updateIcons();

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            // Toggle the theme
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('color-theme', isDark ? 'dark' : 'light');

            // Toggle the icons
            updateIcons();

            // Dispatch a custom event to notify other scripts of the theme change
            window.dispatchEvent(new Event('themeChanged'));
        });
    }
}
