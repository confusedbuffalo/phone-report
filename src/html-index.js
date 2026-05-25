import { promises as fsPromises } from 'fs';
import path from 'path';
import { Eta } from 'eta';
import { minify } from 'html-minifier-terser';
import { COUNTRIES, GITHUB_LINK, IS_TEST_MODE, MINIFY_OPTIONS, BUILD_DIR } from './constants.js';
import { translate } from './i18n.js';
import { getFooterData, getIconAttributionHtml } from './html-utils.js';
import { safeName } from './data-processor.js';

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
            type: 'Country',
            url: `./${countrySafe}/`,
        });

        // Handle standard "divisions"
        if (countryObj.divisions) {
            for (const divName of Object.keys(countryObj.divisions)) {
                index.push({
                    name: divName,
                    type: 'Region',
                    url: `./${countrySafe}/${safeName(divName)}.html`,
                    parent: countryName,
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
                        type: 'Region',
                        url: `./${countrySafe}/`,
                        parent: countryName,
                    });
                }

                for (const subName of Object.keys(subdivisions)) {
                    // If names match (e.g., Berlin/Berlin), only add the deeper one
                    const isDuplicate = subName.toLowerCase() === divName.toLowerCase();

                    const item = {
                        name: subName,
                        type: 'Subdivision',
                        parent: isDuplicate ? countryName : `${countryName} > ${divName}`,
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
 * @param {'phone' | 'name' | 'hours'} reportType - The type of report being created.
 * @param {Array<Object>} countryStats - Array of country statistic objects, including country.locale.
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 * @param {Object} translations
 */
export async function generateMainIndexHtml(reportType, countryStats, locale, translations) {
    const eta = new Eta({
        views: path.join(process.cwd(), 'src', 'templates'),
        cache: true,
    });

    const indexConfig = {
        reportType,
        locale,
        translations,
        searchIndex: buildSearchIndex(),
    };

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
        indexConfig,
    };

    const htmlContent = eta.render('index', templateData);

    let finalHtml = htmlContent;

    const outputPath = path.join(BUILD_DIR, reportType, 'index.html');

    if (!IS_TEST_MODE) {
        try {
            finalHtml = await minify(htmlContent, MINIFY_OPTIONS);
        } catch (err) {
            console.error(`Minification failed for ${outputPath}:`, err);
            // Fallback to unminified content
        }
    }

    await fsPromises.writeFile(outputPath, finalHtml);
    console.log(`${reportType}: Main index.html generated.`);
}
