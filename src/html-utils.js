const { translate } = require('./i18n');
const { ICON_ATTRIBUTION, GITHUB_LINK } = require('./constants.js')

/**
 * Creates the HTML box displaying statistics.
 * @param {'phone' | 'name'} reportType - The type of report being created.
 * @param {number} total - Total values
 * @param {number} firstStat - First statistic after total to display
 * @param {number} secondStat - Second statistic to display
 * @param {number} secondStat - Third statistic to display
 * @param {string} locale - Locale to display stats in
 * @param {boolean} includeProgress - Whether or not to include a link to the progress page
 * @returns {string}
 */
function createStatsBox(reportType, data, locale, includeProgress = false) {
    const percentageOptions = {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    };

    let statsData = [];

    if (reportType === 'phone') {
        const invalidPercentageNumber = data.totalCount > 0 ? (data.invalidCount / data.totalCount) * 100 : 0;
        const fixablePercentageNumber = data.invalidCount > 0 ? (data.autoFixableCount / data.invalidCount) * 100 : 0;

        const formattedInvalidPercentage = invalidPercentageNumber.toLocaleString(locale, percentageOptions);
        const formattedFixablePercentage = fixablePercentageNumber.toLocaleString(locale, percentageOptions);

        statsData = [
            {
                value: data.totalCount.toLocaleString(locale),
                label: translate('numbersChecked', locale),
                numberClass: 'stats-box-number',
                percentage: null
            },
            {
                value: data.invalidCount.toLocaleString(locale),
                label: translate('invalidNumbers', locale),
                numberClass: 'stats-box-number-invalid',
                percentage: translate('invalidPercentageOfTotal', locale, [formattedInvalidPercentage])
            },
            {
                value: data.autoFixableCount.toLocaleString(locale),
                label: translate('potentiallyFixable', locale),
                numberClass: 'stats-box-number-fixable',
                percentage: translate('fixablePercentageOfInvalid', locale, [formattedFixablePercentage])
            }
        ];
        if (!includeProgress) {
            statsData.push(
                {
                    value: data.foreignCount.toLocaleString(locale),
                    label: translate('foreignNumbersHeader', locale),
                    numberClass: 'stats-box-number',
                    percentage: null
                }
            )
        }
    } else if (reportType === 'name') {
        const invalidPercentageNumber = data.totalCount > 0 ? (data.invalidCount / data.totalCount) * 100 : 0;
        const missingPercentageNumber = data.totalCount > 0 ? (data.missingNamesCount / data.totalCount) * 100 : 0;

        const formattedInvalidPercentage = invalidPercentageNumber.toLocaleString(locale, percentageOptions);
        const formattedMissingPercentage = missingPercentageNumber.toLocaleString(locale, percentageOptions);

        statsData = [
            {
                value: data.totalCount.toLocaleString(locale),
                label: translate('multilingualNames', locale),
                numberClass: 'stats-box-number',
                percentage: null
            },
            {
                value: data.invalidCount.toLocaleString(locale),
                label: translate('incompleteNames', locale),
                numberClass: 'stats-box-number-invalid',
                percentage: translate('invalidPercentageOfTotal', locale, [formattedInvalidPercentage])
            },
            {
                value: data.missingNamesCount.toLocaleString(locale),
                label: translate('missingNames', locale),
                numberClass: 'stats-box-number-fixable',
                percentage: translate('invalidPercentageOfTotal', locale, [formattedMissingPercentage])
            }
        ];
    } else {
        return;
    }

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

    const statsBoxClass = reportType === 'phone' ? "stats-box-four" :
        includeProgress ? "stats-box-four" : "stats-box-three";

    const statsContent = statsData.map(stat => `
        <div>
            <p class="${stat.numberClass}">${stat.value}</p>
            <p class="stats-box-label">${stat.label}</p>
            ${stat.percentage ? `<p class="stats-box-percentage">${stat.percentage}</p>` : ''}
        </div>
    `).join('');

    return `
        <div class="stats-box ${statsBoxClass}">
            ${statsContent}
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
 * Prepares the localized date and time strings for the footer.
 */
function getFooterData(locale, timestamp) {
    const dataTimestamp = timestamp ? new Date(timestamp) : new Date();
    
    return {
        timestampMs: dataTimestamp.getTime(),
        formattedDate: dataTimestamp.toLocaleDateString(locale, {
            year: 'numeric', month: 'long', day: 'numeric'
        }),
        formattedTime: dataTimestamp.toLocaleTimeString(locale, {
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
        })
    };
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
    createStatsBox,
    getFooterData,
    escapeHTML,
    getIconAttributionHtml,
};
