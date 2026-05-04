const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, HISTORY_DIR_PHONE, HISTORY_DIR_NAME, NAMES_BUILD_DIR } = require('./constants');

/**
 * Reads all historical data snapshots, aggregates them by date, and generates a
 * single JSON file suitable for charting.
 *
 * The process is as follows:
 * 1. It scans the relevant history directory to find all country-specific subdirectories.
 * 2. For each country, it reads all date-stamped JSON snapshot files (e.g., '2025-10-05.json').
 * 3. It aggregates the data, creating a time-series array for each country and an
 *    overall summary across all countries.
 * 4. The final aggregated data is written to the relevant `history-data.json` file.
 * @param {'phone' | 'name'} reportType - The type of report to generate history for.
 */
function processHistory(reportType) {
    const historyDir = reportType === 'phone' ? HISTORY_DIR_PHONE : HISTORY_DIR_NAME;
    const rootOutputDir = reportType === 'phone' ? PUBLIC_DIR : NAMES_BUILD_DIR;

    if (!fs.existsSync(historyDir)) {
        console.log('History directory not found. Skipping history processing.');
        return;
    }

    const aggregatedData = {
        overall: {},
        countries: {},
    };

    const countryDirs = fs.readdirSync(historyDir);

    for (const countryDir of countryDirs) {
        const countryPath = path.join(historyDir, countryDir);
        if (!fs.statSync(countryPath).isDirectory()) {
            continue;
        }

        const countrySlug = countryDir;
        aggregatedData.countries[countrySlug] = [];

        const snapshotFiles = fs.readdirSync(countryPath).filter(f => f.endsWith('.json'));

        const aggregatedDivisionStats = {};

        for (const file of snapshotFiles) {
            const date = path.basename(file, '.json');
            const filePath = path.join(countryPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const stats = JSON.parse(content);

            const record = {
                name: stats.name,
                date: date,
                invalidCount: stats.invalidCount,
                totalCount: stats.totalCount ?? stats.totalNumbers,
            };

            // Add to country-specific history
            aggregatedData.countries[countrySlug].push(record);

            // Aggregate for overall history
            if (!aggregatedData.overall[date]) {
                aggregatedData.overall[date] = { invalidCount: 0, totalCount: 0 };
            }
            aggregatedData.overall[date].invalidCount += record.invalidCount;
            aggregatedData.overall[date].totalCount += record.totalCount;

            if (Object.keys(stats.groupedDivisionStats).length === 1) {
                const divisionStats = Object.values(stats.groupedDivisionStats)[0];

                for (division of divisionStats) {
                    const divisionName = division.name;

                    const divisionRecord = {
                        date: date,
                        invalidCount: division.invalidCount,
                        totalCount: division.totalCount,
                    }

                    if (!aggregatedDivisionStats[divisionName]) {
                        aggregatedDivisionStats[divisionName] = [];
                    }
                    aggregatedDivisionStats[divisionName].push(divisionRecord);
                }
            } else {
                // Aggregate data for the divisions
                for (const [divisionName, divisionStats] of Object.entries(stats.groupedDivisionStats)) {
                    const divisionTotals = divisionStats.reduce((accumulator, subdivision) => {
                        accumulator.invalidCount += subdivision.invalidCount;
                        accumulator.totalCount += subdivision.totalCount;
                        return accumulator;
                    }, { invalidCount: 0, totalCount: 0 });

                    const divisionRecord = {
                        date: date,
                        invalidCount: divisionTotals.invalidCount,
                        totalCount: divisionTotals.totalCount,
                    }

                    if (!aggregatedDivisionStats[divisionName]) {
                        aggregatedDivisionStats[divisionName] = [];
                    }
                    aggregatedDivisionStats[divisionName].push(divisionRecord);
                }
            }
        }

        // Sort country and division data by date
        aggregatedData.countries[countrySlug].sort((a, b) => new Date(a.date) - new Date(b.date));
        for (const divisionData of Object.values(aggregatedDivisionStats)) {
            divisionData.sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        const aggregatedCountryData = { 'overall': {}, 'divisions': {} };
        aggregatedCountryData['overall'] = aggregatedData.countries[countrySlug];
        aggregatedCountryData['divisions'] = aggregatedDivisionStats;

        const outputDir = path.join(rootOutputDir, countrySlug);
        const outputPath = path.join(outputDir, 'history-data.json');
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(aggregatedCountryData, null));

        console.log(`History data for ${countrySlug} processed and saved to ${outputPath}`);
    }

    // Convert overall data from a map to a sorted array
    const overallArray = Object.keys(aggregatedData.overall).map(date => ({
        date: date,
        invalidCount: aggregatedData.overall[date].invalidCount,
        totalCount: aggregatedData.overall[date].totalCount,
    }));
    overallArray.sort((a, b) => new Date(a.date) - new Date(b.date));
    aggregatedData.overall = overallArray;

    const outputPath = path.join(rootOutputDir, 'history-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(aggregatedData, null));

    console.log(`History data processed and saved to ${outputPath}`);
}

// Execute the function if run directly
if (require.main === module) {
    processHistory('phone');
    processHistory('name');
}

module.exports = { processHistory };