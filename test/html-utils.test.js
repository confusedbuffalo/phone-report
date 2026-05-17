import { jest } from '@jest/globals';

// Mock i18n
jest.unstable_mockModule('../src/i18n.js', () => ({
    translate: (key, locale, subs) => {
        if (subs) {
            return `${key}[${subs.join(',')}]`;
        }
        return `${key}`;
    },
    loadTranslations: () => {},
}));

const { escapeHTML, createStatsBox } = await import('../src/html-utils.js');

describe('html-utils', () => {
    describe('escapeHTML', () => {
        test('should escape special HTML characters', () => {
            expect(escapeHTML('<script>alert("xss")</script>')).toBe(
                '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
            );
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
            const html = createStatsBox(
                'phone',
                { totalCount: 1000, invalidCount: 100, autoFixableCount: 10, foreignCount: 5 },
                'en-US'
            );
            expect(html).toContain('1,000');
            expect(html).toContain('100');
            expect(html).toContain('10');
            expect(html).toContain('invalidPercentageOfTotal[10.00]');
            expect(html).toContain('fixablePercentageOfInvalid[10.00]');
        });

        test('should generate stats box with correct numbers and percentages for names', () => {
            const html = createStatsBox(
                'name',
                { totalCount: 1000, invalidCount: 100, missingNamesCount: 50 },
                'en-US'
            );
            expect(html).toContain('1,000');
            expect(html).toContain('100');
            expect(html).toContain('50');
            expect(html).toContain('invalidPercentageOfTotal[10.00]');
            expect(html).toContain('invalidPercentageOfTotal[5.00]');
        });

        test('should handle zero total numbers', () => {
            const html = createStatsBox(
                'phone',
                { totalCount: 0, invalidCount: 0, autoFixableCount: 0, foreignCount: 0 },
                'en-US'
            );
            expect(html).toContain('>0<');
            expect(html).toContain('invalidPercentageOfTotal[0.00]');
            expect(html).toContain('fixablePercentageOfInvalid[0.00]');
        });

        test('should handle zero invalid numbers', () => {
            const html = createStatsBox(
                'phone',
                { totalCount: 1000, invalidCount: 0, autoFixableCount: 0, foreignCount: 0 },
                'en-US'
            );
            expect(html).toContain('1,000');
            expect(html).toContain('>0<');
            expect(html).toContain('invalidPercentageOfTotal[0.00]');
            expect(html).toContain('fixablePercentageOfInvalid[0.00]');
        });

        test('should use locale for number formatting', () => {
            // Using a locale that uses a comma as a decimal separator
            const html = createStatsBox(
                'phone',
                { totalCount: 1000, invalidCount: 100, autoFixableCount: 10, foreignCount: 0 },
                'de-DE'
            );
            expect(html).toContain('1.000'); // thousands separator
            expect(html).toContain('invalidPercentageOfTotal[10,00]'); // decimal separator
            expect(html).toContain('fixablePercentageOfInvalid[10,00]'); // decimal separator
        });
    });

    describe('getIconAttributionHtml', () => {
        test('should generate attribution HTML', async () => {
            const { getIconAttributionHtml } = await import('../src/html-utils.js');
            const html = getIconAttributionHtml('en-US');
            expect(html).toContain('iconsSourcedFrom');
            expect(html).toContain('Font Awesome Icons');
        });
    });
});
