const fs = require('fs');
const path = require('path');
const { HISTORY_DIR, PUBLIC_DIR } = require('./constants');

/**
 * Reads all historical data snapshots, aggregates them by date, and generates a
 * single JSON file suitable for charting.
 *
 * The process is as follows:
 * 1. It scans the `history/` directory to find all country-specific subdirectories.
 * 2. For each country, it reads all date-stamped JSON snapshot files (e.g., '2025-10-05.json').
 * 3. It aggregates the data, creating a time-series array for each country and an
 *    overall summary across all countries.
 * 4. The final aggregated data is written to `public/history-data.json`.
 */
function processHistory() {
    if (!fs.existsSync(HISTORY_DIR)) {
        console.log('History directory not found. Skipping history processing.');
        return;
    }

    const aggregatedData = {
        overall: {},
        countries: {},
    };

    const countryDirs = fs.readdirSync(HISTORY_DIR);

    for (const countryDir of countryDirs) {
        const countryPath = path.join(HISTORY_DIR, countryDir);
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
                totalNumbers: stats.totalNumbers,
            };

            // Add to country-specific history
            aggregatedData.countries[countrySlug].push(record);

            // Aggregate for overall history
            if (!aggregatedData.overall[date]) {
                aggregatedData.overall[date] = { invalidCount: 0, totalNumbers: 0 };
            }
            aggregatedData.overall[date].invalidCount += stats.invalidCount;
            aggregatedData.overall[date].totalNumbers += stats.totalNumbers;

            if (Object.keys(stats.groupedDivisionStats).length === 1) {
                const divisionStats = Object.values(stats.groupedDivisionStats)[0];

                for (division of divisionStats) {
                    const divisionName = division.name;

                    const divisionRecord = {
                        date: date,
                        invalidCount: division.invalidCount,
                        totalNumbers: division.totalNumbers,
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
                        accumulator.totalNumbers += subdivision.totalNumbers;
                        return accumulator;
                    }, { invalidCount: 0, totalNumbers: 0 });

                    const divisionRecord = {
                        date: date,
                        invalidCount: divisionTotals.invalidCount,
                        totalNumbers: divisionTotals.totalNumbers,
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

        const outputDir = path.join(PUBLIC_DIR, countrySlug);
        const outputPath = path.join(outputDir, 'history-data.json');
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(aggregatedCountryData, null));

        console.log(`History data for ${countrySlug} processed and saved to ${outputPath}`);
    }

    // Convert overall data from a map to a sorted array
    const overallArray = Object.keys(aggregatedData.overall).map(date => ({
        date: date,
        invalidCount: aggregatedData.overall[date].invalidCount,
        totalNumbers: aggregatedData.overall[date].totalNumbers,
    }));
    overallArray.sort((a, b) => new Date(a.date) - new Date(b.date));
    aggregatedData.overall = overallArray;

    const outputPath = path.join(PUBLIC_DIR, 'history-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(aggregatedData, null));

    console.log(`History data processed and saved to ${outputPath}`);
}

// Execute the function if run directly
if (require.main === module) {
    processHistory();
}

module.exports = { processHistory };