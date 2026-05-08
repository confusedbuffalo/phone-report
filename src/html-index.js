const { promises: fsPromises } = require('fs');
const path = require('path');
const { Eta } = require('eta');
const { PUBLIC_DIR, COUNTRIES, NAMES_BUILD_DIR, GITHUB_LINK } = require('./constants');
const { translate } = require('./i18n');
const { getFooterData, getIconAttributionHtml } = require('./html-utils');
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

    const eta = new Eta({
        views: path.join(process.cwd(), "src", "templates"),
        cache: true,
    });

    const templateData = {
        locale,
        reportType,
        countryStats,
        translations,
        translate,
        getFooterData,
        buildSearchIndex,
        getIconAttributionHtml,
        GITHUB_LINK,
    };

    const htmlContent = eta.render("index", templateData);

    const fileName = reportType === 'name' ? path.join(NAMES_BUILD_DIR, 'index.html') : path.join(PUBLIC_DIR, 'index.html');
    await fsPromises.writeFile(fileName, htmlContent);
    console.log('Main index.html generated.');
}

module.exports = {
    generateMainIndexHtml,
};
