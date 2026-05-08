const { promises: fsPromises } = require('fs');
const path = require('path');
const { Eta } = require('eta');
const { minify } = require('html-minifier-terser');
const { PUBLIC_DIR, NAMES_BUILD_DIR, GITHUB_LINK, IS_TEST_MODE, MINIFY_OPTIONS } = require('./constants');
const { translate } = require('./i18n');
const { createStatsBox, escapeHTML, getFooterData, getIconAttributionHtml} = require('./html-utils');
const { safeName } = require('./data-processor');

/**
 * Generates the country index page with a list of its subdivisions.
 * @param {'phone' | 'name'} reportType - The type of report being created.
 * @param {Object} countryData
 */
async function generateCountryIndexHtml(reportType, countryData) {
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

    const outputDir = reportType === 'name' ? NAMES_BUILD_DIR : PUBLIC_DIR;
    const pageFileName = path.join(outputDir, countryData.slug, 'index.html');
    await fsPromises.writeFile(pageFileName, finalHtml);
    console.log(`Report for ${countryData.name} generated at ${pageFileName}.`);
}

module.exports = {
    generateCountryIndexHtml,
};