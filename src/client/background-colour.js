/**
 * Calculates a background color based on a percentage and the current theme.
 * The color ranges from green to red, with different saturation and lightness for light and dark themes.
 * @param {number} percent - The percentage value, where lower is better.
 * @param {boolean} isDarkMode - True if the dark theme is active, false otherwise.
 * @returns {string} The calculated HSL color string.
 */
function getBackgroundColor(percent, isDarkMode) {
    if (isDarkMode) {
        if (percent > 2) return 'hsl(0, 40%, 30%)';
        const hue = ((2 - percent) / 2) * 120;
        return `hsl(${hue}, 40%, 30%)`;
    } else {
        if (percent > 2) return 'hsl(0, 70%, 50%)';
        const hue = ((2 - percent) / 2) * 120;
        return `hsl(${hue}, 70%, 50%)`;
    }
}

/**
 * Applies the calculated background colors to all elements with the 'color-indicator' class.
 * It reads the percentage from the 'data-percentage' attribute on each element.
 */
function applyColors() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.color-indicator').forEach(el => {
        const percentage = parseFloat(el.dataset.percentage);
        el.style.backgroundColor = getBackgroundColor(percentage, isDarkMode);
    });
}

document.addEventListener('DOMContentLoaded', applyColors);
window.addEventListener('themeChanged', applyColors);