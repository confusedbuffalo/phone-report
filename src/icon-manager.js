const path = require('path');
const { readFileSync, existsSync } = require('fs');
const { ICONS_DIR } = require('./constants');

class IconManager {
    constructor() {
        this.iconSvgData = new Map();
    }

    /**
     * Adds an icon's SVG content and viewBox to the global collection for sprite generation.
     * @param {string} iconName - The ID the icon will have in the sprite (e.g., 'maki-restaurant').
     * @param {string} svgContent - The cleaned SVG path/group content (inner XML).
     * @param {string} viewBox - The SVG's viewBox attribute value.
     */
    addIconToSprite(iconName, svgContent, viewBox) {
        if (!this.iconSvgData.has(iconName)) {
            this.iconSvgData.set(iconName, { content: svgContent, viewBox: viewBox });
        }
    }

    /**
     * Generates the complete SVG sprite content.
     * @returns {string} The HTML string for the hidden SVG sprite.
     */
    generateSvgSprite() {
        let symbols = '';
        const defaultViewBox = '0 0 15 15';

        for (const [iconName, data] of this.iconSvgData.entries()) {
            const viewBox = data.viewBox || defaultViewBox;
            const cleanContent = data.content
                .replace(/ fill="#[^"]+"/g, '')
                .replace(/ stroke="#[^"]+"/g, '')
                .replace(/ fill='[^']+'/g, '')
                .replace(/ stroke='[^']+'/g, '');

            symbols += `
                <symbol id="${iconName}" viewBox="${viewBox}">
                    ${cleanContent}
                </symbol>
            `;
        }

        return `
            <svg xmlns="http://www.w3.org/2000/svg" style="display: none;" aria-hidden="true" focusable="false">
                ${symbols}
            </svg>
        `;
    }

    /**
     * Reads an SVG file, cleans it, extracts the viewBox, and returns the inner content.
     * @param {string} iconPath - The full path to the SVG file.
     * @returns {{content: string, viewBox: string}} An object with the inner content and the viewBox string.
     */
    getSvgContent(iconPath) {
        let svgContent = readFileSync(iconPath, 'utf8');

        const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/i);
        const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 24 24';

        svgContent = svgContent.replace(/<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
        svgContent = svgContent.replace(/<\?xml[^>]*\?>/, '');
        svgContent = svgContent.replace(/<!--[\s\S]*?-->/g, '');
        svgContent = svgContent.replace(/<!DOCTYPE[^>]*>/i, '');

        return {
            content: svgContent.trim(),
            viewBox: viewBox
        };
    }

    /**
     * Generates the HTML string for a specified icon, supporting Font Awesome classes,
     * and collects SVGs for the sprite.
     *
     * @param {string} iconName - The full icon name string (e.g., 'maki-restaurant' or 'roentgen-food_court').
     * @returns {string} The HTML string containing the icon (Font Awesome <i> or <svg><use>).
     */
    getIconHtml(iconName) {
        if (!iconName) {
            // Fallback case: If no iconName is provided, use the ultimate fallback
            return this.getIconHtml('iD-icon-point');
        }

        const parts = iconName.split('-');
        const library = parts[0];
        const icon = parts.slice(1).join('-');

        let iconHtml = '';
        let iconPath = '';
        let packageName = '';
        let faStyleDir = '';

        switch (library) {
            case 'fas':
                packageName = '@fortawesome/fontawesome-free';
                faStyleDir = 'solid';
                break;
            case 'far':
                packageName = '@fortawesome/fontawesome-free';
                faStyleDir = 'regular';
                break;
            case 'maki':
                packageName = '@mapbox/maki';
                break;
            case 'temaki':
                packageName = '@rapideditor/temaki';
                break;
            default: // iD and Roentgen icons
                const basePath = path.resolve(ICONS_DIR, library);
                iconPath = path.join(basePath, `${icon}.svg`);
        }

        if (packageName) { // This covers 'fas', 'far', 'maki', and 'temaki'
            let svgSubPath = '';
            if (faStyleDir) { // Font Awesome Icons
                svgSubPath = `svgs/${faStyleDir}/${icon}.svg`;
            } else if (library === 'temaki') {
                svgSubPath = `icons/${icon.replace('-', '_')}.svg`;
            } else { // Maki
                svgSubPath = `icons/${icon}.svg`;
            }
            iconPath = path.resolve(__dirname, '..', `node_modules/${packageName}/${svgSubPath}`);
        }

        if (existsSync(iconPath)) {
            const { content, viewBox } = this.getSvgContent(iconPath);
            this.addIconToSprite(iconName, content, viewBox);
            iconHtml = `<span class="icon-svg-container"><svg class="icon-svg"><use href="#${iconName}"></use></svg></span>`;
        } else {
            console.log(`Icon not found: ${library}-${icon}`);
        }

        if (!iconHtml && iconName !== 'iD-icon-point') {
            console.log(`No icon found for ${iconName}, using point fallback`);
            return this.getIconHtml('iD-icon-point');
        }

        return iconHtml || `<span class="list-item-icon-container icon-fallback">?</span>`;
    }

    clearIconSprite() {
        this.iconSvgData.clear();
    }
}

module.exports = {
    IconManager
};
