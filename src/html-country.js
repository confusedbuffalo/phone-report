const { promises: fsPromises } = require('fs');
const path = require('path');
const { Eta } = require('eta');
const { PUBLIC_DIR, NAMES_BUILD_DIR } = require('./constants');
const { translate } = require('./i18n');
const {favicon, themeButton, createFooter, createStatsBox, escapeHTML} = require('./html-utils');
const { safeName } = require('./data-processor');

/**
 * Generates the country index page with a list of its subdivisions.
 * @param {'phone' | 'name'} reportType - The type of report being created.
 * @param {Object} countryData
 */
async function generateCountryIndexHtml(reportType, countryData) {
    console.log(reportType, countryData.groupedDivisionStats);
    const eta = new Eta({
        views: path.join(process.cwd(), "src", "templates"),
        cache: false,
    });

    const locale = countryData.locale;

    const templateData = {
        reportType,
        favicon,
        themeButton,
        createStatsBox,
        createFooter,
        locale,
        escapeHTML,
        countryData,
        safeName,
        translate,
    };

    const htmlContent = eta.render("country", templateData);

    const outputDir = reportType === 'name' ? NAMES_BUILD_DIR : PUBLIC_DIR;
    const pageFileName = path.join(outputDir, countryData.slug, 'index.html');
    await fsPromises.writeFile(pageFileName, htmlContent);
    console.log(`Report for ${countryData.name} generated at ${pageFileName}.`);
}

module.exports = {
    generateCountryIndexHtml,
};