const { translate } = require('./i18n');
const { ICON_ATTRIBUTION } = require('./constants.js')
const githubLink = "https://github.com/confusedbuffalo/phone-report/";

/**
 * Phone number emoji as the favicon
 */
const favicon = '<link rel="icon" href="data:image/svg+xml,&lt;svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22&gt;&lt;text y=%22.9em%22 font-size=%2290%22&gt;📞&lt;/text&gt;&lt;/svg&gt;">';

const themeButton = `<button id="theme-toggle" type="button" class="theme-toggle-button">
                        <svg id="theme-toggle-dark-icon" class="hidden w-7 h-7" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                        <svg id="theme-toggle-light-icon" class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="5"/><line x1="12" y1="3" x2="12" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="19" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="19" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5.64" y1="5.64" x2="6.8" y2="6.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="17.2" y1="17.2" x2="18.36" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5.64" y1="18.36" x2="6.8" y2="17.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="17.2" y1="6.8" x2="18.36" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>`;

/**
 * Creates the HTML box displaying statistics.
 * @param {number} total - Total phone numbers
 * @param {number} invalid - Number of invalid numbers
 * @param {number} fixable - Number of autofixable numbers
 * @param {string} locale - Locale to display numbers in
 * @param {boolean} includeProgress - Whether or not to include a link to the progress page
 * @returns {string}
 */
function createStatsBox(total, invalid, fixable, locale, includeProgress = false) {
    const percentageOptions = {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    };
    const totalPercentageNumber = total > 0 ? (invalid / total) * 100 : 0;
    const fixablePercentageNumber = invalid > 0 ? (fixable / invalid) * 100 : 0;

    const formattedTotal = total.toLocaleString(locale);
    const formattedInvalid = invalid.toLocaleString(locale);
    const formattedFixable = fixable.toLocaleString(locale);

    const formattedTotalPercentage = totalPercentageNumber.toLocaleString(locale, percentageOptions);
    const formattedFixablePercentage = fixablePercentageNumber.toLocaleString(locale, percentageOptions);

    const statsBoxClass = includeProgress ? "stats-box-progress" : "stats-box-no-progress";

    const progressDiv = includeProgress ? `
        <div>
            <a href="./progress.html">
                <div>
                    <svg class="progress-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M128 128C128 110.3 113.7 96 96 96C78.3 96 64 110.3 64 128L64 464C64 508.2 99.8 544 144 544L544 544C561.7 544 576 529.7 576 512C576 494.3 561.7 480 544 480L144 480C135.2 480 128 472.8 128 464L128 128zM534.6 214.6C547.1 202.1 547.1 181.8 534.6 169.3C522.1 156.8 501.8 156.8 489.3 169.3L384 274.7L326.6 217.4C314.1 204.9 293.8 204.9 281.3 217.4L185.3 313.4C172.8 325.9 172.8 346.2 185.3 358.7C197.8 371.2 218.1 371.2 230.6 358.7L304 285.3L361.4 342.7C373.9 355.2 394.2 355.2 406.7 342.7L534.7 214.7z"/></svg>
                </div>
                <p class="stats-box-label underline">${translate('progressHistory', locale)}</p>
            </a>
        </div>
        ` : '';

    return `
        <div class="stats-box ${statsBoxClass}">
            <div>
                <p class="stats-box-number">${formattedTotal}</p>
                <p class="stats-box-label">${translate('numbersChecked', locale)}</p>
            </div>
            <div>
                <p class="stats-box-number-invalid">${formattedInvalid}</p>
                <p class="stats-box-label">${translate('invalidNumbers', locale)}</p>
                <p class="stats-box-percentage">${translate('invalidPercentageOfTotal', locale, [formattedTotalPercentage])}</p>
            </div>
            <div>
                <p class="stats-box-number-fixable">${formattedFixable}</p>
                <p class="stats-box-label">${translate('potentiallyFixable', locale)}</p>
                <p class="stats-box-percentage">${translate('fixablePercentageOfInvalid', locale, [formattedFixablePercentage])}</p>
            </div>
            ${progressDiv}
        </div>
    `;
}


/**
 * Generates the HTML for icon attributions.
 * It combines data from the `ICON_ATTRIBUTION` constant into a readable paragraph.
 * @param {string} locale - The locale for translating the introductory text.
 * @returns {string} The HTML string for the icon attributions.
 */
function getIconAttributionHtml(locale) {
    const attributionSections = ICON_ATTRIBUTION.map(iconPack => {
        const nameElement = (iconPack.name && iconPack.link)
            ? `<a href="${iconPack.link}" target="_blank" rel="noopener noreferrer" class="footer-link">${iconPack.name}</a>`
            : iconPack.name || '';

        const attributionElement = iconPack.attribution || '';

        const licenseElement = (iconPack.license && iconPack.license_link)
            ? `<a href="${iconPack.license_link}" target="_blank" rel="noopener noreferrer" class="footer-link">${iconPack.license}</a>`
            : iconPack.license || '';

        const combinedContent = [nameElement, attributionElement, licenseElement]
            .filter(Boolean)
            .join(' ');

        return combinedContent;
    });

    const allAttributions = attributionSections.filter(Boolean).join('. ');

    return allAttributions
        ? `<p class="footer-text">${translate('iconsSourcedFrom', locale)} ${allAttributions}</p>`
        : '';
}


/**
 * Creates the HTML footer with data timestamp and GitHub link.
 * @param {string} locale - Locale to format the date in
 * @param {Object} translations - The translations dictionary for the current locale
 * @returns {string}
 */
function createFooter(locale = 'en-GB', translations, includeIconAttribution = false) {
    translations = translations || {};

    const dataTimestamp = new Date();
    // Formatting the date and time
    const formattedDate = dataTimestamp.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = dataTimestamp.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
    });

    // Use translation keys for static text, with fallbacks to hardcoded text
    const dataSourcedTemplate = translate('dataSourcedTemplate', locale, [formattedDate, formattedTime, 'UTC', translate('timeAgoJustNow', locale)]);
    const suggestionIssueLink = translate('suggestionIssueLink', locale);
    const letMeKnowOnGitHub = translate('letMeKnowOnGitHub', locale);

    const openStreetMapLinkHtml = `<a href="https://www.openstreetmap.org/copyright/" target="_blank" rel="noopener noreferrer" class="footer-link">OpenStreetMap</a>`;
    const dataAttribution = `<p class="footer-text">${translate('numberDetailsNamesDataFrom', locale, [openStreetMapLinkHtml])}</p>`;
    const iconAttribution = includeIconAttribution ? getIconAttributionHtml(locale) : '';

    return `
    <p id="data-timestamp-container" 
       class="footer-text"
       data-timestamp="${dataTimestamp.getTime()}">
        ${dataSourcedTemplate}
    </p>
    <p class="footer-text">${suggestionIssueLink} <a href="${githubLink}" target="_blank" rel="noopener noreferrer" class="footer-link">${letMeKnowOnGitHub}</a>.</p>
    ${dataAttribution}
    ${iconAttribution}
    <script>
        const clientFormattedDate = '${formattedDate}';
        const clientFormattedTime = '${formattedTime}';
        const translations = ${JSON.stringify(translations)};
        
        /**
         * A simple client-side translation utility that uses the embedded translations object.
         * @param {string} key - The translation key.
         * @param {Object} [substitutions={}] - An object with values for placeholders.
         * @returns {string} The translated string.
         */
        function translate(key, substitutions = {}) {
            let str = translations[key] || 'MISSING_KEY:' + key;
            if (str.includes('%n') && substitutions['%n'] !== undefined) {
                str = str.replace('%n', substitutions['%n']);
            }
            if (str.includes('%t') && substitutions['%t'] !== undefined) {
                str = str.replace('%t', substitutions['%t']);
            }
            return str;
        }

        /**
         * Updates the 'time ago' part of the data timestamp on the page.
         * It calculates the difference between the current time and the data's timestamp
         * and displays a human-readable relative time (e.g., "just now", "5 minutes ago").
         */
        function updateTimeAgo() {
            const container = document.getElementById('data-timestamp-container');
            if (!container) return;

            const dataTimestampMs = parseInt(container.getAttribute('data-timestamp'), 10);
            if (isNaN(dataTimestampMs)) {
                container.textContent = translations['timeAgoError'] || 'error in time calculation';
                return;
            }

            const dataDate = new Date(dataTimestampMs);
            const now = new Date();
            const millisecondsAgo = now.getTime() - dataDate.getTime();
            const totalMinutes = Math.floor(millisecondsAgo / (1000 * 60));
            
            let timeAgoText;
            if (totalMinutes < 1) {
                timeAgoText = translate('timeAgoJustNow');
            } else if (totalMinutes < 60) {
                const minutes = totalMinutes;
                const key = minutes > 1 ? 'timeAgoMinutesPlural' : 'timeAgoMinute';
                timeAgoText = translate(key, { '%n': minutes }); 
            } else {
                const hours = Math.floor(totalMinutes / 60);
                const key = hours > 1 ? 'timeAgoHoursPlural' : 'timeAgoHour';
                timeAgoText = translate(key, { '%n': hours }); 
            }

            const dataSourcedTemplate = translations['dataSourcedTemplate'] || 'Data sourced on %d at %t %z (%a)';
            container.innerHTML = dataSourcedTemplate
                .replace('%d', clientFormattedDate)
                .replace('%t', clientFormattedTime)
                .replace('%z', 'UTC')
                .replace('%a', timeAgoText); 
        }

        updateTimeAgo();
        setInterval(updateTimeAgo, 60000);
    </script>
    `
}

/**
 * Escapes special HTML characters in a string.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHTML(str) {
    if (!str) {
        return '';
    }
    return str.replace(/[&<>"']/g, (match) => {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return match;
        }
    });
}

module.exports = {
    themeButton,
    favicon,
    createStatsBox,
    createFooter,
    escapeHTML,
    getIconAttributionHtml,
};