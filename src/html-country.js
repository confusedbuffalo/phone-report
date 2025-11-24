const { promises: fsPromises } = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./constants');
const { translate } = require('./i18n');
const {favicon, themeButton, createFooter, createStatsBox, escapeHTML} = require('./html-utils');
const { safeName } = require('./data-processor');

/**
 * Creates the client constants for the country index page.
 * @param {Object} countryData
 * @param {string} locale
 * @returns {string}
 */
function createClientConstants(countryData, locale) {

    // Server-side translation of dynamic client script strings
    const clientTranslations = {
        invalidNumbersOutOf: translate('invalidNumbersOutOf', locale),
        invalid: translate('invalid', locale),
        noSubdivisionsFound: translate('noSubdivisionsFound', locale)
    };

    return `
    <script>
        const groupedDivisionStats = ${JSON.stringify(countryData.groupedDivisionStats)};
        const safeCountryName = '${safeName(countryData.name)}';
        const locale = '${locale}'; 
        const T_CLIENT = {
            invalidNumbersOutOf: \`${clientTranslations.invalidNumbersOutOf}\`,
            invalid: \`${clientTranslations.invalid}\`,
            noSubdivisionsFound: \`${clientTranslations.noSubdivisionsFound}\`
        };
    </script>
    `;
}

/**
 * Generates the country index page with a list of its subdivisions.
 * @param {Object} countryData
 * @param {Object} translations
 */
async function generateCountryIndexHtml(countryData, translations) {
    const locale = countryData.locale;
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('countryReportTitle', locale, [escapeHTML(countryData.name)])}</title>
        ${favicon}
        <link href="../styles.css" rel="stylesheet">
        <script src="../theme.js"></script>
    </head>
    <body class="body-styles">
        <div class="page-container">
            <header class="page-header">
                <div class="action-row">
                    <a href="../" class="back-link">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span class="align-middle">${translate('backToAllCountries', locale)}</span>
                    </a>
                    ${themeButton}
                </div>
                <h1 class="page-title">${translate('osmPhoneNumberValidation', locale)}</h1>
                <p class="report-subtitle">${translate('reportSubtitle', locale, [escapeHTML(countryData.name)])}</p>
            </header>
            ${createStatsBox(countryData.totalNumbers, countryData.invalidCount, countryData.autoFixableCount, locale, true)}
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${translate('divisionalReports', locale)}</h2>
                    <div class="card-actions">
                        <div class="sort-controls">
                            <span class="sort-label">${translate('sortBy', locale)}</span>
                            <button id="sort-percentage" data-sort="percentage" class="sort-btn sort-btn-style">${translate('invalidPercentage', locale)}</button>
                            <button id="sort-invalid" data-sort="invalidCount" class="sort-btn sort-btn-style">${translate('invalidCount', locale)}</button>
                            <button id="sort-name" data-sort="name" class="sort-btn sort-btn-style">${translate('name', locale)}</button>
                        </div>
                        <div class="checkbox-container">
                            <label for="show-empty" class="checkbox-label">${translate('showEmptyDivisions', locale)}</label>
                            <input type="checkbox" id="show-empty" class="checkbox-input">
                        </div>
                    </div>
                </div>
                <div id="division-list" class="space-y-4">
                </div>
            </div>
            <div class="footer-container">
                ${createFooter(locale, translations)}
            </div>
        </div>
        <script src="../background-colour.js"></script>
        ${createClientConstants(countryData, locale)}
        <script src="../country-page.js"></script>
    </body>
    </html>
    `;
    pageFileName = path.join(PUBLIC_DIR, countryData.slug, 'index.html')
    await fsPromises.writeFile(pageFileName, htmlContent);
    console.log(`Report for ${countryData.name} generated at ${pageFileName}.`);
}

module.exports = {
    generateCountryIndexHtml,
};