const {
    escapeHTML,
    createStatsBox,
    createFooter,
    getIconAttributionHtml
} = require('../src/html-utils.js');

// Mock i18n
jest.mock('../src/i18n', () => ({
    translate: (key, locale, subs) => {
        if (subs) {
            return `${key}[${subs.join(',')}]`;
        }
        return `${key}`;
    },
    loadTranslations: () => { }
}));

describe('html-utils', () => {
    describe('escapeHTML', () => {
        test('should escape special HTML characters', () => {
            expect(escapeHTML('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });

        test('should return an empty string if input is null or undefined', () => {
            expect(escapeHTML(null)).toBe('');
            expect(escapeHTML(undefined)).toBe('');
        });

        test('should not change a string with no special characters', () => {
            expect(escapeHTML('hello world')).toBe('hello world');
        });

        test('should escape single quotes', () => {
            expect(escapeHTML("it's a test")).toBe('it&#039;s a test');
        });
    });

    describe('createStatsBox', () => {
        test('should generate stats box with correct numbers and percentages', () => {
            const html = createStatsBox(1000, 100, 10, 'en-US');
            expect(html).toContain('1,000');
            expect(html).toContain('100');
            expect(html).toContain('10');
            expect(html).toContain('invalidPercentageOfTotal[10.00]');
            expect(html).toContain('fixablePercentageOfInvalid[10.00]');
        });

        test('should handle zero total numbers', () => {
            const html = createStatsBox(0, 0, 0, 'en-US');
            expect(html).toContain('>0<');
            expect(html).toContain('invalidPercentageOfTotal[0.00]');
            expect(html).toContain('fixablePercentageOfInvalid[0.00]');
        });

        test('should handle zero invalid numbers', () => {
            const html = createStatsBox(1000, 0, 0, 'en-US');
            expect(html).toContain('1,000');
            expect(html).toContain('>0<');
            expect(html).toContain('invalidPercentageOfTotal[0.00]');
            expect(html).toContain('fixablePercentageOfInvalid[0.00]');
        });

        test('should use locale for number formatting', () => {
            // Using a locale that uses a comma as a decimal separator
            const html = createStatsBox(1000, 100, 10, 'de-DE');
            expect(html).toContain('1.000'); // thousands separator
            expect(html).toContain('invalidPercentageOfTotal[10,00]'); // decimal separator
            expect(html).toContain('fixablePercentageOfInvalid[10,00]'); // decimal separator
        });
    });

    describe('getIconAttributionHtml', () => {
        beforeEach(() => {
            jest.resetModules();
        });

        test('should generate attribution HTML', () => {
            const constants = require('../src/constants');
            constants.ICON_ATTRIBUTION = [{ name: 'Test Icons', link: 'http://test.com', attribution: 'by Me', license: 'MIT', license_link: 'http://license.com' }];
            const { getIconAttributionHtml } = require('../src/html-utils');
            const html = getIconAttributionHtml('en-US');
            expect(html).toContain('iconsSourcedFrom');
            expect(html).toContain('<a href="http://test.com"');
            expect(html).toContain('Test Icons');
            expect(html).toContain('by Me');
            expect(html).toContain('<a href="http://license.com"');
            expect(html).toContain('MIT');
        });

        test('should handle missing links or licenses gracefully', () => {
            const constants = require('../src/constants');
            constants.ICON_ATTRIBUTION = [{ name: 'Test Icons', attribution: 'by Me' }];
            const { getIconAttributionHtml } = require('../src/html-utils');
            const html = getIconAttributionHtml('en-US');
            expect(html).not.toContain('<a href');
            expect(html).toContain('Test Icons by Me');
        });
    });

    describe('createFooter', () => {
        beforeAll(() => {
            // Mock Date for consistent output
            const mockDate = new Date('2023-10-27T10:00:00Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
        });

        afterAll(() => {
            jest.restoreAllMocks();
        });

        test('should generate footer with timestamp and GitHub link', () => {
            const footer = createFooter('en-GB', {});
            expect(footer).toContain('dataSourcedTemplate');
            expect(footer).toContain('https://github.com/confusedbuffalo/phone-report/');
            expect(footer).toContain('letMeKnowOnGitHub');
        });

        test('should include icon attribution when requested', () => {
            const footer = createFooter('en-GB', {}, true);
            expect(footer).toContain('iconsSourcedFrom');
        });

        test('should not include icon attribution when not requested', () => {
            const footer = createFooter('en-GB', {}, false);
            expect(footer).not.toContain('iconsSourcedFrom');
        });

        test('should embed client-side script for time updates', () => {
            const footer = createFooter('en-GB', { 'timeAgoJustNow': 'just now' });
            expect(footer).toContain('<script>');
            expect(footer).toContain('function updateTimeAgo()');
            expect(footer).toContain('const translations = {"timeAgoJustNow":"just now"};');
        });
    });
});