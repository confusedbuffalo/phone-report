/**
 * A wrapper for the osm-api library.
 * It imports the UMD bundle which sets window.OSM, and then exports it.
 */
export async function getOSM() {
    if (!window.OSM) {
        await import('./vendor/osm-api.min.js');
    }
    return window.OSM;
}
