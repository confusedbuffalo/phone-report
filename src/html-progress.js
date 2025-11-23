const { promises: fsPromises } = require('fs');
const path = require('path');
const { translate } = require('./i18n');
const { PUBLIC_DIR, COUNTRIES } = require('./constants');
const { favicon, themeButton, createFooter, escapeHTML } = require('./html-utils');
const { getTranslations } = require('./i18n');
const { safeName } = require('./data-processor');
const BUILD_TYPE = process.env.BUILD_TYPE;
const testMode = BUILD_TYPE === 'simplified';

/**
 * Generates the progress.html page, which displays charts visualizing the
 * history of invalid phone number counts over time.
 * @param {string} country - The slug for the country to create the progress page for (e.g. 'south-africa').
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 */
async function generateProgressPage(country = null, locale = 'en-GB') {
    const translations = getTranslations(locale);
    const REPORT_COUNTRY_KEY = country ? country : 'ALL';
    const backText = country ? translate('backToCountryPage', locale) : translate('backToAllCountries', locale);
    const srcPrefix = country ? '../' : './';

    const historyDataPath = path.join(PUBLIC_DIR, 'history-data.json');
    const clientHistoryPath = './history-data.json';

    try {
        await fsPromises.access(historyDataPath);   
    } catch (error) {
        // 'ENOENT' (File Not Found)
        if (error.code === 'ENOENT') {
            console.log('history-data.json not found. Skipping progress page generation.');
            return;
        }
        // For any other error (e.g., permission denied, disk error), rethrow it
        throw error;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('progressHistory', locale)}</title>
        ${favicon}
        <link href="${srcPrefix}styles.css" rel="stylesheet">
        <script src="${srcPrefix}theme.js"></script>
        <script src="${srcPrefix}vendor/chart.js"></script>
        <script src="${srcPrefix}chart-generator.js"></script>
    </head>
    <body class="body-styles">
        <div class="page-container">
            <header class="page-header">
                <div class="action-row">
                    <a href="./" class="back-link">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span class="align-middle">${backText}</span>
                    </a>
                    ${themeButton}
                </div>
                <h1 class="page-title">${translate('progressHistory', locale)}</h1>
            </header>

            <div class="card">
                <div class="chart-container">
                    <canvas id="progressChart"></canvas>
                </div>
            </div>
            <div class="card">
                <div class="chart-container">
                    <canvas id="progressChartPercent"></canvas>
                </div>
            </div>

            <div class="footer-container">
                ${createFooter(locale, translations)}
            </div>
        </div>
        <script>
            const REPORT_COUNTRY_KEY = '${REPORT_COUNTRY_KEY}';
        </script>
    </body>
    </html>
    `;

    const outputDir = country ? path.join(PUBLIC_DIR, country) : PUBLIC_DIR;
    const outputPath = path.join(outputDir, 'progress.html')

    await fsPromises.mkdir(outputDir, { recursive: true }).catch(err => {
        // Ignore the error if the directory already exists
        if (err.code !== 'EEXIST') throw err;
    });

    await fsPromises.writeFile(outputPath, htmlContent);

    console.log(`Progress page generated at ${outputPath}`);
}


if (require.main === module) {
    (async () => {
        await generateProgressPage();

        for (const countryKey in COUNTRIES) {
            const countryData = COUNTRIES[countryKey];
            const countryName = escapeHTML(countryKey);
            const locale = countryData.locale;

            await generateProgressPage(safeName(countryName), locale)
            if (testMode) {
                break;
            }
        }
    })();
}   

module.exports = { generateProgressPage };