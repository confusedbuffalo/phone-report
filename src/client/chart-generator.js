function getAxisColour() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    // gray-400 for dark mode, gray-500 for light mode
    return isDarkMode ? '#9ca3af' : '#6b7280'; 
}

document.addEventListener('DOMContentLoaded', () => {
    const axisColour = getAxisColour();
    const semiTransparentGridColour = axisColour + '40'; // 25% opacity for a lighter grid
    fetch('./history-data.json')
        .then(response => response.json())
        .then(data => {
            const allData = REPORT_COUNTRY_KEY === 'ALL' ? data.countries : data.divisions;

            // Filter the countries based on the REPORT_COUNTRY_KEY
            const regionKeys = Object.keys(allData);

            // Get all unique dates for the labels (X-axis) from the filtered data
            const allDates = new Set();
            Object.values(allData).forEach(regionArray => {
                regionArray.forEach(d => allDates.add(d.date));
            });
            const labels = Array.from(allDates).sort();

            // Generate a color palette for the lines
            const colours = generateColours(regionKeys.length);

            // ------------------------------------------------------------------
            // CHART FOR RAW COUNTS (progressChart)
            // ------------------------------------------------------------------
            const ctxCount = document.getElementById('progressChart').getContext('2d');
            const countDatasets = regionKeys.map((region, index) => {
                const regionHistory = allData[region];
                const displayName = regionHistory.length > 0 ? (regionHistory[0].name || region) : region;

                const dataPoints = labels.map(date => {
                    const entry = regionHistory.find(d => d.date === date);
                    return entry ? entry.invalidCount : null;
                });

                return {
                    label: displayName,
                    data: dataPoints,
                    fill: false,
                    borderColor: colours[index],
                    pointBackgroundColor: colours[index],
                    tension: 0.1,
                    yAxisID: 'y'
                };
            });

            new Chart(ctxCount, {
                type: 'line',
                data: { labels: labels, datasets: countDatasets },
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: axisColour
                            },
                            grid: {
                                color: semiTransparentGridColour,
                                borderColor: axisColour
                            }
                        },
                        x: {
                            ticks: {
                                color: axisColour
                            },
                            grid: {
                                color: semiTransparentGridColour,
                                borderColor: axisColour
                            }
                        }
                    },
                    plugins:{
                        legend: {
                            labels: {
                                color: axisColour,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                    }
                }
            });

            // ------------------------------------------------------------------
            // CHART FOR PERCENTAGE (progressChartPercent)
            // ------------------------------------------------------------------
            const ctxPercent = document.getElementById('progressChartPercent').getContext('2d');
            const percentDatasets = regionKeys.map((region, index) => {
                const regionHistory = allData[region];
                const displayName = regionHistory.length > 0 ? (regionHistory[0].name || region) : region;

                const dataPoints = labels.map(date => {
                    const entry = regionHistory.find(d => d.date === date);

                    if (entry && entry.totalNumbers > 0) {
                        return ((entry.invalidCount / entry.totalNumbers) * 100).toFixed(2);
                    }
                    return null;
                });

                return {
                    label: displayName,
                    data: dataPoints,
                    fill: false,
                    borderColor: colours[index],
                    pointBackgroundColor: colours[index],
                    tension: 0.1,
                };
            });

            new Chart(ctxPercent, {
                type: 'line',
                data: { labels: labels, datasets: percentDatasets },
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: 0,
                            ticks: {
                                color: axisColour,
                                callback: function (value) {
                                    return value + '%';
                                }
                            },
                            grid: {
                                color: semiTransparentGridColour,
                                borderColor: axisColour
                            }
                        },
                        x: {
                            ticks: {
                                color: axisColour
                            },
                            grid: {
                                color: semiTransparentGridColour,
                                borderColor: axisColour
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: axisColour,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += context.parsed.y + '%';
                                    } else {
                                        label += 'No Data';
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        })
        .catch(error => console.error('Error fetching data:', error));
});


// Helper function to generate distinct colors for the lines
function generateColours(numColours) {
    const colours = [];
    const colourPalette = [
        'oklch(63.7% 0.237 25.331)', // red-500
        'oklch(76.8% 0.233 130.85)', // lime-500
        'oklch(71.5% 0.143 215.221)', // cyan-500
        'oklch(62.7% 0.265 303.9)', // purple-500
        'oklch(64.5% 0.246 16.439)', // rose-500
        'oklch(55.4% 0.046 257.417)', // slate-500
        'oklch(76.9% 0.188 70.08)', // amber-500
        'oklch(69.6% 0.17 162.48)', // emerald-500
        'oklch(55.3% 0.013 58.071)', // stone-500
        'oklch(70.5% 0.213 47.604)', // orange-500
        'oklch(72.3% 0.219 149.579)', // green-500
        'oklch(62.3% 0.214 259.815)', // blue-500
        'oklch(66.7% 0.295 322.15)', // fuchsia-500
        'oklch(55.6% 0 0)', // neutral-500
        'oklch(79.5% 0.184 86.047)', // yellow-500
        'oklch(70.4% 0.14 182.503)', // teal-500
        'oklch(68.5% 0.169 237.323)', // sky-500
        'oklch(58.5% 0.233 277.117)', // indigo-500
        'oklch(60.6% 0.25 292.717)', // violet-500
        'oklch(65.6% 0.241 354.308)', // pink-500
        'oklch(55.1% 0.027 264.364)', // gray-500
        'oklch(55.2% 0.016 285.938)', // zine-500
    ];

    for (let i = 0; i < numColours; i++) {
        colours.push(colourPalette[i % colourPalette.length]);
    }
    return colours;
}