const { promises: fsPromises } = require('fs');
const path = require('path');
const { Eta } = require('eta');
const { translate } = require('./i18n');
const { PUBLIC_DIR, COUNTRIES, NAMES_BUILD_DIR } = require('./constants');
const { favicon, themeButton, createFooter } = require('./html-utils');
const { getTranslations } = require('./i18n');
const { safeName } = require('./data-processor');
const BUILD_TYPE = process.env.BUILD_TYPE;
const testMode = BUILD_TYPE === 'simplified';

/**
 * Generates the progress.html page, which displays charts visualizing the
 * history of invalid phone number counts over time.
 * @param {'phone' | 'name'} reportType - The type of report to generate history for.
 * @param {string} country - The slug for the country to create the progress page for (e.g. 'south-africa').
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 */
async function generateProgressPage(reportType, country = null, locale = 'en-GB') {
    const rootDir = reportType === 'phone' ? PUBLIC_DIR : NAMES_BUILD_DIR;
    const historyDataPath = path.join(rootDir, 'history-data.json');

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

    const eta = new Eta({
        views: path.join(process.cwd(), "src", "templates"),
        cache: true,
    });

    const translations = getTranslations(locale);

    const templateData = {
        reportType,
        favicon,
        locale,
        translate,
        country,
        themeButton,
        createFooter,
        translations,
    };

    const htmlContent = eta.render("progress", templateData);

    const outputDir = country ? path.join(rootDir, country) : rootDir;
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
        await generateProgressPage('phone');
        await generateProgressPage('name');

        for (const countryKey in COUNTRIES) {
            const countryData = COUNTRIES[countryKey];
            const locale = countryData.locale;

            await generateProgressPage('phone', safeName(countryKey), locale);
            await generateProgressPage('name', safeName(countryKey), locale);
            if (testMode) {
                break;
            }
        }
    })();
}   

module.exports = { generateProgressPage };
