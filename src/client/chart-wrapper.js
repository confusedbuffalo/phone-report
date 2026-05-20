/**
 * A wrapper for the Chart.js library.
 * It imports the UMD bundle which sets window.Chart, and then exports it.
 */
export async function getChart() {
    if (!window.Chart) {
        await import('./vendor/chart.js');
    }
    return window.Chart;
}
