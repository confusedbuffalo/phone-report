const { promises: fsPromises } = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./constants');
const { translate } = require('./i18n');
const {favicon, themeButton, createFooter} = require('./html-utils')

/**
 * Generates the main index.html file listing all country reports.
 * @param {Array<Object>} countryStats - Array of country statistic objects, including country.locale.
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 * @param {Object} translations
 */
async function generateMainIndexHtml(countryStats, locale, translations) {

    const listContent = countryStats.map(country => {
        const safeCountryName = country.slug;
        const countryPageName = `${safeCountryName}/`;
        const percentage = country.totalNumbers > 0 ? (country.invalidCount / country.totalNumbers) * 100 : 0;
        const invalidPercentage = Math.max(0, Math.min(100, percentage));

        // Use the country's specific locale for number formatting and description text
        const itemLocale = country.locale || locale; // Fallback to the main page locale

        // Format numbers using the *country's* specific locale
        const formattedInvalid = country.invalidCount.toLocaleString(itemLocale);
        const formattedFixable = country.autoFixableCount.toLocaleString(itemLocale);
        const formattedTotal = country.totalNumbers.toLocaleString(itemLocale);

        // Use the country's specific locale for the description translation
        const description = translate('invalidNumbersOutOf', itemLocale, [formattedInvalid, formattedFixable, formattedTotal]);

        return `
            <a href="./${countryPageName}" class="country-link">
                <div class="country-link-content">
                    <div class="color-indicator" data-percentage="${invalidPercentage}"></div>
                    <div class="country-link-text-container">
                        <h3 class="country-name">${country.name}</h3>
                        <p class="country-description">${description}</p>
                    </div>
                </div>
                <div class="country-stats-container">
                    <p class="country-percentage">${invalidPercentage.toLocaleString(itemLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span class="country-percentage-symbol">%</span></p>
                    <p class="country-invalid-label">${translate('invalid', itemLocale)}</p>
                </div>
            </a>
        `;
    }).join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('mainIndexTitle', locale)}</title>
        ${favicon}
        <link href="./styles.css" rel="stylesheet">
        <script src="theme.js"></script>
    </head>
    <body class="body-styles">
        <div class="page-container">
            <header class="page-header">
                <div class="index-header-container">
                    <div class="items-start">
                        <div class="theme-toggle-button invisible">
                            <div class="w-7 h-7"></div>
                        </div>
                    </div>
                    <h1 class="page-title">${translate('osmPhoneNumberValidation', locale)}</h1>
                    <div class="items-end">${themeButton}</div>
                </div>
                <p class="report-subtitle">${translate('reportSubtitle', locale)}</p>
            </header>
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${translate('countryReports', locale)}</h2>
                    <a href="./progress.html" class="btn-progress">
                        <div class="flex row items-center">
                                <svg class="progress-icon-index" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M128 128C128 110.3 113.7 96 96 96C78.3 96 64 110.3 64 128L64 464C64 508.2 99.8 544 144 544L544 544C561.7 544 576 529.7 576 512C576 494.3 561.7 480 544 480L144 480C135.2 480 128 472.8 128 464L128 128zM534.6 214.6C547.1 202.1 547.1 181.8 534.6 169.3C522.1 156.8 501.8 156.8 489.3 169.3L384 274.7L326.6 217.4C314.1 204.9 293.8 204.9 281.3 217.4L185.3 313.4C172.8 325.9 172.8 346.2 185.3 358.7C197.8 371.2 218.1 371.2 230.6 358.7L304 285.3L361.4 342.7C373.9 355.2 394.2 355.2 406.7 342.7L534.7 214.7z"/></svg>
                                <div>${translate('progressHistory', locale)}</div>
                        </div>
                    </a>
                </div>
                <div class="space-y-4">
                    ${listContent}
                </div>
            </div>
            <div class="footer-container">
                ${createFooter(locale, translations)}
            </div>
        </div>
        <script src="./background-colour.js"></script>
    </body>
    </html>
    `;
    await fsPromises.writeFile(path.join(PUBLIC_DIR, 'index.html'), htmlContent);
    console.log('Main index.html generated.');
}

module.exports = {
    generateMainIndexHtml,
};