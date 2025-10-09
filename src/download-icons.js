const fs = require('fs/promises');
const path = require('path');
const { ICONS_DIR, GITHUB_ICON_PACKS, GITHUB_API_BASE_URL } = require('./constants.js')


/**
 * Downloads all SVG files for a single icon pack.
 * @param {string} packName The descriptive name of the icon pack.
 * @param {object} packDetails The owner, repo, and path details.
 */
async function downloadSinglePack(packName, packDetails) {
    const { owner, repo, folder_path } = packDetails;
    const GITHUB_API_URL = `${GITHUB_API_BASE_URL}/${owner}/${repo}/contents/${folder_path}`;
    const FINAL_OUTPUT_DIR = path.join(ICONS_DIR, packDetails.output_sub_dir);
    console.log(`\n--- Processing Pack: ${packName} ---`);
    console.log(`  Source: ${owner}/${repo}/${folder_path}`);

    // Use dynamic import for fetch
    const { default: fetch } = await import('node-fetch');

    const headers = {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
    };

    // 1. Get the list of files
    const response = await fetch(GITHUB_API_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch directory contents: ${response.statusText}`);
    }
    const files = await response.json();

    // 2. Filter for SVG files and ensure the output directory exists
    const svgFiles = files.filter(file => file.type === 'file' && file.name.endsWith('.svg'));
    await fs.mkdir(FINAL_OUTPUT_DIR, { recursive: true });

    console.log(`  Found ${svgFiles.length} SVG icons. Starting download...`);

    let successCount = 0;
    const failedDownloads = []; // Array to store error messages for failed files

    // 3. Download each SVG file
    const downloadPromises = svgFiles.map(async (file) => {
        const rawUrl = file.download_url;
        const filePath = path.join(FINAL_OUTPUT_DIR, file.name);

        try {
            const fileResponse = await fetch(rawUrl);
            if (!fileResponse.ok) {
                throw new Error(`Failed to download ${file.name}: ${fileResponse.statusText}`);
            }

            const fileContent = await fileResponse.text();
            await fs.writeFile(filePath, fileContent, 'utf-8');

            successCount++;
        } catch (error) {
            // Push the error details to the failures array
            failedDownloads.push(`  - FAILED ${file.name}: ${error.message}`);
        }
    });

    // Wait for all downloads to complete
    await Promise.all(downloadPromises);

    const totalFiles = svgFiles.length;
    const failCount = failedDownloads.length;

    console.log(`\n  --- Download Summary for ${packName} ---`);
    console.log(`  Total files processed: ${totalFiles}`);
    console.log(`  Successful downloads: ${successCount}`);
    console.log(`  Failed downloads: ${failCount}`);

    if (failCount > 0) {
        console.log('\n  --- Errors for Failed Downloads ---');
        failedDownloads.forEach(errorMsg => console.error(errorMsg));
    }
    console.log('------------------------------------------');
}

/**
 * Main function to iterate over all configured icon packs and download them.
 */
async function downloadAllIcons() {
    console.log('==============================================');
    console.log('== STARTING ICON DOWNLOAD FOR STATIC BUILD ==');
    console.log('==============================================');

    const packPromises = Object.entries(GITHUB_ICON_PACKS).map(([name, details]) => {
        return downloadSinglePack(name, details);
    });

    await Promise.all(packPromises);

    console.log('\n=============================================');
    console.log('== ALL ICON DOWNLOADS COMPLETE / SKIPPED ==');
    console.log('=============================================');
}


// --- Execution ---

downloadAllIcons().catch(error => {
    // This catches fatal errors outside of the individual pack download logic
    console.error('\n*** FATAL ERROR in icon download script:', error);
    process.exit(1);
});