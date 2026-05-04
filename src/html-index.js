const { promises: fsPromises } = require('fs');
const path = require('path');
const { PUBLIC_DIR, COUNTRIES, NAMES_BUILD_DIR } = require('./constants');
const { translate } = require('./i18n');
const { themeButton, createFooter, getFavicon } = require('./html-utils');
const { safeName } = require('./data-processor');

/**
 * Flattens the countries JSON into a searchable array.
 * @returns {Array} List of searchable objects { name, type, url, parent }
 */
function buildSearchIndex() {
    const index = [];

    for (const [countryName, countryObj] of Object.entries(COUNTRIES)) {
        const countrySafe = safeName(countryName);

        // Add the Country itself
        index.push({
            name: countryName,
            type: "Country",
            url: `./${countrySafe}/`
        });

        // Handle standard "divisions"
        if (countryObj.divisions) {
            for (const divName of Object.keys(countryObj.divisions)) {
                index.push({
                    name: divName,
                    type: "Region",
                    url: `./${countrySafe}/${safeName(divName)}.html`,
                    parent: countryName
                });
            }
        }

        // Handle "divisionMap" (e.g. UK, Germany, Italy)
        if (countryObj.divisionMap) {
            for (const [divName, subdivisions] of Object.entries(countryObj.divisionMap)) {
                const divSafe = safeName(divName);

                if (Object.entries(subdivisions).length > 1) {
                    index.push({
                        name: divName,
                        type: "Region",
                        url: `./${countrySafe}/`,
                        parent: countryName
                    });
                }

                for (const [subName, relId] of Object.entries(subdivisions)) {
                    // If names match (e.g., Berlin/Berlin), only add the deeper one
                    const isDuplicate = (subName.toLowerCase() === divName.toLowerCase());

                    const item = {
                        name: subName,
                        type: "Subdivision",
                        parent: isDuplicate ? countryName : `${countryName} > ${divName}`
                    };

                    // Path logic: united-kingdom/wales.html vs united-kingdom/england/east-midlands.html
                    if (isDuplicate) {
                        item.url = `./${countrySafe}/${divSafe}.html`;
                    } else {
                        item.url = `./${countrySafe}/${divSafe}/${safeName(subName)}.html`;
                    }

                    index.push(item);
                }
            }
        }
    }
    return index;
}

/**
 * Generates the main index.html file listing all country reports.
 * @param {'phone' | 'name'} reportType - The type of report being created.
 * @param {Array<Object>} countryStats - Array of country statistic objects, including country.locale.
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 * @param {Object} translations
 */
async function generateMainIndexHtml(reportType, countryStats, locale, translations) {

    const listContent = countryStats.map(country => {
        const safeCountryName = country.slug;
        const countryPageName = `${safeCountryName}/`;
        const percentage = country.totalCount > 0 ? (country.invalidCount / country.totalCount) * 100 : 0;
        const invalidPercentage = Math.max(0, Math.min(100, percentage));

        // Use the country's specific locale for number formatting and description text
        const itemLocale = country.locale || locale; // Fallback to the main page locale

        const formattedInvalid = country.invalidCount.toLocaleString(itemLocale);
        const formattedTotal = country.totalCount.toLocaleString(itemLocale);

        const description = reportType === 'phone' ?
            translate('invalidNumbersOutOf', itemLocale, [formattedInvalid, country.autoFixableCount.toLocaleString(itemLocale), formattedTotal]) :
            translate('incompleteNamesOutOf', itemLocale, [formattedInvalid, formattedTotal]);

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
        ${getFavicon(reportType)}
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
                    <h1 class="page-title">${translate(reportType === 'phone' ? 'osmPhoneNumberValidation' : 'osmIncompleteNameValidation', locale)}</h1>
                    <div class="items-end">${themeButton}</div>
                </div>
                <p class="report-subtitle">${translate(reportType === 'phone' ? 'reportSubtitle' : 'reportSubtitleNames', locale)}</p>
            </header>
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${translate('countryReports', locale)}</h2>
                    <div class="search-wrapper">
                        <div class="relative">
                            <input type="text" id="region-search" class="search-input" 
                                placeholder="Search countries or regions..." autocomplete="off">
                            <div class="search-icon-container">
                                <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                            </div>
                        </div>
                        <div id="autocomplete-results" class="autocomplete-dropdown hidden"></div>
                    </div>
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
        <script>const searchIndex = ${JSON.stringify(buildSearchIndex())};</script>
        <script src="./index-search.js"></script>
        <script src="./background-colour.js"></script>
    </body>
    </html>
    `;
    const fileName = reportType === 'name' ? path.join(NAMES_BUILD_DIR, 'index.html') : path.join(PUBLIC_DIR, 'index.html');
    await fsPromises.writeFile(fileName, htmlContent);
    console.log('Main index.html generated.');
}

module.exports = {
    generateMainIndexHtml,
};