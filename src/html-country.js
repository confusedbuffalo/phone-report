import { promises as fsPromises } from 'fs';
import path from 'path';
import { Eta } from 'eta';
import { minify } from 'html-minifier-terser';
import { GITHUB_LINK, IS_TEST_MODE, MINIFY_OPTIONS, BUILD_DIR } from './constants.js';
import { translate, getTranslations } from './i18n.js';
import { createStatsBox, escapeHTML, getFooterData, getIconAttributionHtml } from './html-utils.js';
import { safeName } from './data-processor.js';

/**
 * Generates the country index page with a list of its subdivisions.
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report being created.
 * @param {Object} countryData
 */
export async function generateCountryIndexHtml(reportType, countryData) {
    const eta = new Eta({
        views: path.join(process.cwd(), "src", "templates"),
        cache: false,
    });

    const locale = countryData.locale;

    const templateData = {
        reportType,
        createStatsBox,
        getFooterData,
        locale,
        escapeHTML,
        countryData,
        safeName,
        translate,
        getIconAttributionHtml,
        GITHUB_LINK,
        translations: getTranslations(locale),
    };

    const htmlContent = eta.render("country", templateData);

    let finalHtml = htmlContent;

    if (!IS_TEST_MODE) {
        try {
            finalHtml = await minify(htmlContent, MINIFY_OPTIONS);
        } catch (err) {
            console.error(`Minification failed for ${outputPath}:`, err);
            // Fallback to unminified content
        }
    }

    const outputDir = BUILD_DIR[reportType];
    const pageFileName = path.join(outputDir, countryData.slug, 'index.html');
    await fsPromises.writeFile(pageFileName, finalHtml);
    console.log(`Report for ${countryData.name} generated at ${pageFileName}.`);
}
