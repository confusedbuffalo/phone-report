import { promises as fsPromises } from 'fs';
import path from 'path';
import { Eta } from 'eta';
import { minify } from 'html-minifier-terser';
import { translate } from './i18n.js';
import { COUNTRIES, GITHUB_LINK, IS_TEST_MODE, MINIFY_OPTIONS, BUILD_DIR, REPORT_TYPES } from './constants.js';
import { getFooterData, getIconAttributionHtml } from './html-utils.js';
import { getTranslations } from './i18n.js';
import { safeName } from './data-processor.js';
import { fileURLToPath } from 'url';
const BUILD_TYPE = process.env.BUILD_TYPE;
const testMode = BUILD_TYPE === 'simplified';

/**
 * Generates the progress.html page, which displays charts visualizing the
 * history of invalid phone number counts over time.
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report to generate history for.
 * @param {string} country - The slug for the country to create the progress page for (e.g. 'south-africa').
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 */
export async function generateProgressPage(reportType, country = null, locale = 'en-GB') {
    const rootDir = BUILD_DIR[reportType];
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
        views: path.join(process.cwd(), 'src', 'templates'),
        cache: true,
    });

    const translations = getTranslations(locale);

    const progressConfig = {
        reportType,
        locale,
        translations,
        reportCountryKey: country ? country : 'ALL',
    };

    const templateData = {
        reportType,
        locale,
        translate,
        country,
        getFooterData,
        translations,
        getIconAttributionHtml,
        GITHUB_LINK,
        progressConfig,
    };

    const htmlContent = eta.render('progress', templateData);

    let finalHtml = htmlContent;

    if (!IS_TEST_MODE) {
        try {
            finalHtml = await minify(htmlContent, MINIFY_OPTIONS);
        } catch (err) {
            console.error(`Minification failed for ${outputPath}:`, err);
            // Fallback to unminified content
        }
    }

    const outputDir = country ? path.join(rootDir, country) : rootDir;
    const outputPath = path.join(outputDir, 'progress.html');

    await fsPromises.mkdir(outputDir, { recursive: true }).catch(err => {
        // Ignore the error if the directory already exists
        if (err.code !== 'EEXIST') throw err;
    });

    await fsPromises.writeFile(outputPath, finalHtml);

    console.log(`Progress page generated at ${outputPath}`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    (async () => {
        REPORT_TYPES.forEach(async reportType => {
            await generateProgressPage(reportType);
        });

        for (const countryKey in COUNTRIES) {
            const countryData = COUNTRIES[countryKey];
            const locale = countryData.locale;

            REPORT_TYPES.forEach(async reportType => {
                await generateProgressPage(reportType, safeName(countryKey), locale);
            });

            if (testMode) {
                break;
            }
        }
    })();
}
