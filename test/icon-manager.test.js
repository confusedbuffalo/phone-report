import { jest } from '@jest/globals';
import { IconManager } from '../src/icon-manager.js';

describe('IconManager', () => {
    let iconManager;

    beforeEach(() => {
        iconManager = new IconManager();
    });

    test('should resolve pinhead icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('pinhead-airport_terminal');
        expect(html).toContain('href="#pinhead-airport_terminal"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: pinhead-airport_terminal');
        consoleSpy.mockRestore();
    });

    test('should resolve fas (FontAwesome solid) icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('fas-phone');
        expect(html).toContain('href="#fas-phone"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: fas-phone');
        consoleSpy.mockRestore();
    });

    test('should resolve far (FontAwesome regular) icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('far-clock');
        expect(html).toContain('href="#far-clock"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: far-clock');
        consoleSpy.mockRestore();
    });

    test('should resolve maki icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('maki-restaurant');
        expect(html).toContain('href="#maki-restaurant"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: maki-restaurant');
        consoleSpy.mockRestore();
    });

    test('should resolve temaki icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('temaki-airport');
        expect(html).toContain('href="#temaki-airport"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: temaki-airport');
        consoleSpy.mockRestore();
    });

    test('should resolve iD icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('iD-icon-point');
        expect(html).toContain('href="#iD-icon-point"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: iD-icon-point');
        consoleSpy.mockRestore();
    });

    test('should resolve roentgen icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('roentgen-bench');
        expect(html).toContain('href="#roentgen-bench"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: roentgen-bench');
        consoleSpy.mockRestore();
    });

    test('should resolve Flagpedia icons correctly', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('Flagpedia-us');
        expect(html).toContain('href="#Flagpedia-us"');
        expect(html).toContain('class="flag-svg-container"');
        expect(consoleSpy).not.toHaveBeenCalledWith('Icon not found: Flagpedia-us');
        consoleSpy.mockRestore();
    });

    test('should fallback to iD-icon-point for non-existent icons', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('nonexistent-icon_xyz');
        expect(consoleSpy).toHaveBeenCalledWith('Icon not found: nonexistent-icon_xyz');
        expect(consoleSpy).toHaveBeenCalledWith('No icon found for nonexistent-icon_xyz, using fallback');
        expect(html).toContain('href="#iD-icon-point"');
        consoleSpy.mockRestore();
    });

    test('should fallback to flag emoji for non-existent Flagpedia icons', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const html = iconManager.getIconHtml('Flagpedia-nonexistent');
        expect(consoleSpy).toHaveBeenCalledWith('Icon not found: Flagpedia-nonexistent');
        expect(consoleSpy).toHaveBeenCalledWith('No icon found for Flagpedia-nonexistent, using fallback');
        expect(html).toContain('🏳️');
        consoleSpy.mockRestore();
    });

    test('should generate SVG sprite with added icons', () => {
        iconManager.getIconHtml('pinhead-airport_terminal');
        const spriteHtml = iconManager.generateSvgSprite();
        expect(spriteHtml).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
        expect(spriteHtml).toContain('<symbol id="pinhead-airport_terminal"');
    });
});
