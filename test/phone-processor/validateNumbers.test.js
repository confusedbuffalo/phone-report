import { Readable } from 'stream';
import os from 'os';
import path from 'path';
import fs from 'fs';

import { validateNumbers } from '../../src/phone-processor.js';

// =====================================================================
// validateNumbers Tests
// =====================================================================
describe('validateNumbers', () => {
    const COUNTRY_CODE = 'GB';
    const COUNTRY_CODE_DE = 'DE';
    const COUNTRY_CODE_US = 'US';
    let testCounter = 0;
    let tmpFilePath;

    beforeEach(() => {
        testCounter++;
        tmpFilePath = path.join(os.tmpdir(), `validate-numbers-test-${testCounter}.json`);
    });

    afterEach(() => {
        if (fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
        }
    });

    // Helper to wrap elements into GeoJSON-like objects with Map properties
    const createGeoJson = (id, tags, lat = 0.0, lon = 0.0, type = 'node') => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [lon, lat],
        },
        properties: {
            ...tags,
            '@id': id,
            '@type': type,
            '@user': 'test-user',
            '@timestamp': '1776196800',
            '@changeset': '12345',
        },
    });

    // UK numbers used for testing
    const VALID_LANDLINE = '+44 20 7946 0000';
    const VALID_LANDLINE_NO_SPACE = '+442079460000';
    const FIXABLE_LANDLINE_INPUT = '0207 9460000';
    const FIXABLE_LANDLINE_SUGGESTED_FIX = '+44 20 7946 0000';
    const VALID_LANDLINE_2 = '+44 20 7946 1111';
    const UNFIXABLE_INPUT = '020 794'; // Too short
    const BAD_SEPARATOR_INPUT_COMMA = '020 7946 0000, 07712 900000';
    const BAD_SEPARATOR_INPUT_SLASH = '020 7946 0000/ 07712 900000';
    const BAD_SEPARATOR_INPUT_PIPE = '020 7946 0000 | 07712 900000';
    const BAD_SEPARATOR_FIX = '+44 20 7946 0000; +44 7712 900000';
    const VALID_MOBILE = '+44 7712 900000';
    const VALID_MOBILE_2 = '+44 7712 900001';
    const FIXABLE_MOBILE_INPUT = '07712  900000';
    const FIXABLE_MOBILE_SUGGESTED_FIX = '+44 7712 900000';
    const VALID_TOLL_FREE = '+44 800 001234';

    // DE numbers
    const SLASH_IN_NUMBER_DE = '+498131/275715';
    const SLASH_IN_NUMBER_DE_FIX = '+49 8131 275715';

    // US numbers
    const VALID_US_NUMBER = '+1-202-627-1951';
    const FIXABLE_US_NUMBER = '+1 2026271951';

    test('should correctly identify a single valid number and return zero invalid items', async () => {
        const elements = [createGeoJson(1001, { phone: VALID_LANDLINE, name: 'Valid Shop' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('should correctly handle ISO 3166-2 code for country code', async () => {
        const elements = [createGeoJson(1001, { phone: VALID_LANDLINE, name: 'Valid Shop' })];

        const result = await validateNumbers(Readable.from(elements), 'GB-ENG', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('should identify a single fixable invalid number (no country code) and provide suggested fix', async () => {
        const elements = [createGeoJson(2002, { 'contact:phone': FIXABLE_LANDLINE_INPUT })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(2002);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('AT: should identify a single fixable invalid toll free number (no country code) and provide suggested fix', async () => {
        const elements = [createGeoJson(2002, { phone: '(0800) 6624 5324' })];

        const result = await validateNumbers(Readable.from(elements), 'AT', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(2002);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            phone: '(0800) 6624 5324',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            phone: '0800 66245324',
        });
    });

    test('should identify a fundamentally unfixable number (too short) and mark it as unfixable', async () => {
        const elements = [createGeoJson(3003, { mobile: UNFIXABLE_INPUT, name: 'Short Mobile' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(false);
        expect(invalidItem.invalidNumbers.mobile).toBe(UNFIXABLE_INPUT);
    });

    test('should handle multiple numbers in a single tag using a bad separator (comma)', async () => {
        const elements = [createGeoJson(4004, { phone: BAD_SEPARATOR_INPUT_COMMA, name: 'Multiple Contacts' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(BAD_SEPARATOR_INPUT_COMMA);
        expect(invalidItem.suggestedFixes.phone).toBe(BAD_SEPARATOR_FIX);
    });

    test('should handle multiple numbers in a single tag using a bad separator (pipe)', async () => {
        const elements = [createGeoJson(4004, { phone: BAD_SEPARATOR_INPUT_PIPE, name: 'Multiple Contacts' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(BAD_SEPARATOR_INPUT_PIPE);
        expect(invalidItem.suggestedFixes.phone).toBe(BAD_SEPARATOR_FIX);
    });

    test('should handle multiple numbers in a single tag using a bad separator (slash)', async () => {
        const elements = [createGeoJson(4004, { phone: BAD_SEPARATOR_INPUT_SLASH, name: 'Multiple Contacts' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(BAD_SEPARATOR_INPUT_SLASH);
        expect(invalidItem.suggestedFixes.phone).toBe(BAD_SEPARATOR_FIX);
    });

    test('should not consider a slash as a separator in DE', async () => {
        const elements = [createGeoJson(4004, { phone: SLASH_IN_NUMBER_DE, name: 'Slashing Sales' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_DE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe(SLASH_IN_NUMBER_DE);
        expect(invalidItem.suggestedFixes.phone).toBe(SLASH_IN_NUMBER_DE_FIX);
    });

    test('should consider a slash as a space if removing it makes a valid number', async () => {
        const elements = [createGeoJson(4004, { phone: '010/420.420' })];

        const result = await validateNumbers(Readable.from(elements), 'BE', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers.phone).toBe('010/420.420');
        expect(invalidItem.suggestedFixes.phone).toBe('+32 10 42 04 20');
    });

    test('should aggregate results from multiple phone tags on a single element', async () => {
        const elements = [
            createGeoJson(5005, {
                'contact:phone': FIXABLE_LANDLINE_INPUT,
                'contact:mobile': FIXABLE_MOBILE_INPUT,
                phone: VALID_LANDLINE_2,
                name: 'Mixed Contact Info',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
            'contact:mobile': FIXABLE_MOBILE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': FIXABLE_LANDLINE_SUGGESTED_FIX,
            'contact:mobile': FIXABLE_MOBILE_SUGGESTED_FIX,
        });
    });

    test('should correctly process website tag (without protocol) and include protocol in base item', async () => {
        const websiteInput = 'www.test-site.co.uk';
        const elements = [createGeoJson(6006, { phone: FIXABLE_LANDLINE_INPUT, website: websiteInput })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.website).toBe(`http://${websiteInput}`);
    });

    test('should not change website tag if it already has a protocol', async () => {
        const websiteInput = 'https://secure.site.com';
        const elements = [createGeoJson(6006, { phone: FIXABLE_LANDLINE_INPUT, website: websiteInput })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.website).toBe(websiteInput);
    });

    test('should correctly calculate totalCount across multiple elements', async () => {
        const elements = [
            createGeoJson(7001, { phone: VALID_LANDLINE }),
            createGeoJson(7002, { 'contact:phone': FIXABLE_LANDLINE_INPUT }),
            createGeoJson(7003, { mobile: BAD_SEPARATOR_INPUT_COMMA }),
            createGeoJson(7004, {}),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        // 1 (7001) + 1 (7002) + 2 (7003) = 4 total numbers checked
        expect(result.totalCount).toBe(4);
        expect(result.invalidCount).toBe(2); // Elements 7002 and 7003 are invalid
    });

    test('should do nothing with mobile=yes and process actual phone number', async () => {
        const elements = [
            createGeoJson(5005, {
                mobile: 'yes',
                phone: FIXABLE_LANDLINE_INPUT,
                name: 'Mobile caterer',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            phone: FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            phone: FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('phone=no is valid as marking object as having no phone number', async () => {
        const elements = [createGeoJson(5005, { phone: 'no' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(0);
        expect(result.invalidCount).toBe(0);
    });

    test('should fix and move landline number out of mobile tag', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:mobile': FIXABLE_LANDLINE_INPUT,
                name: 'Landline in Mobile',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': null,
            phone: FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('should fix and move landline number out of mobile tag and append to existing phone tag', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:mobile': FIXABLE_LANDLINE_INPUT,
                phone: VALID_LANDLINE_2,
                name: 'Landline in Mobile',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_INPUT,
            phone: VALID_LANDLINE_2,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': null,
            phone: `${VALID_LANDLINE_2}; ${FIXABLE_LANDLINE_SUGGESTED_FIX}`,
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('should keep mobile number in mobile tag when moving another number out', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:mobile': `${FIXABLE_LANDLINE_INPUT}; ${FIXABLE_MOBILE_INPUT}`,
                name: 'Confused mobile',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': `${FIXABLE_LANDLINE_INPUT}; ${FIXABLE_MOBILE_INPUT}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': FIXABLE_MOBILE_SUGGESTED_FIX,
            phone: FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            'contact:mobile': FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('should remove duplicate number in different tags', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': VALID_LANDLINE,
                phone: VALID_LANDLINE,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE,
            phone: VALID_LANDLINE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
        });
    });

    test('DE should remove duplicate number with extension in different tags', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': '+49 651 146262-0',
                phone: '+49 651 146262-0',
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), 'DE', tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': '+49 651 146262-0',
            phone: '+49 651 146262-0',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
        });
    });

    test('FR should remove duplicate valid national numbers in different tags', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': '0 890 64 97 13',
                phone: '0 890 64 97 13',
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), 'FR', tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': '0 890 64 97 13',
            phone: '0 890 64 97 13',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
        });
    });

    test('should only remove duplicate number with multiple numbers where one is a duplicate to another tag', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:mobile': `${VALID_MOBILE}; ${VALID_MOBILE_2}`,
                phone: VALID_MOBILE,
                name: 'Triple phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:mobile': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:mobile': `${VALID_MOBILE}; ${VALID_MOBILE_2}`,
            phone: VALID_MOBILE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:mobile': VALID_MOBILE_2,
        });
    });

    test('should only remove duplicate number with multiple numbers where one is a duplicate to another tag, phone and contact:phone', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': '+27 11 984 4050;+27 83 462 3316',
                phone: '+27 11 984 4050',
                name: 'Triple phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), 'ZA', tmpFilePath);

        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': '+27 11 984 4050;+27 83 462 3316',
            phone: '+27 11 984 4050',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': '+27 83 462 3316',
        });
    });

    test('should remove duplicate number in the same tag', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE}`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE,
        });
    });

    test('should remove duplicate numbers with different formatting in the same tag', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE_NO_SPACE}`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE,
        });
    });

    test('should respect country formatting with duplicate numbers in the same tag', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${VALID_US_NUMBER}; ${VALID_US_NUMBER}`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_US_NUMBER}; ${VALID_US_NUMBER}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_US_NUMBER,
        });
    });

    test('should fix duplicate numbers with different formatting in the same tag', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${FIXABLE_LANDLINE_INPUT}; ${VALID_LANDLINE_NO_SPACE}`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'contact:phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${FIXABLE_LANDLINE_INPUT}; ${VALID_LANDLINE_NO_SPACE}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': VALID_LANDLINE,
        });
    });

    test('different extensions are not duplicates', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${VALID_LANDLINE}x123`,
                phone: `${VALID_LANDLINE}x456`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('different extensions are not duplicates, US', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${VALID_US_NUMBER} x123`,
                phone: `${VALID_US_NUMBER} x456`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('duplicate numbers with extensions should be detected and fixed, US', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${FIXABLE_US_NUMBER} x123`,
                phone: `${FIXABLE_US_NUMBER} x123`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${FIXABLE_US_NUMBER} x123`,
            phone: `${FIXABLE_US_NUMBER} x123`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            phone: `${VALID_US_NUMBER} x123`,
        });
    });

    test('different spacing is still a duplicate', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': VALID_LANDLINE_NO_SPACE,
                phone: VALID_LANDLINE,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE_NO_SPACE,
            phone: VALID_LANDLINE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
        });
    });

    test('fixable and correct formatting are duplicates', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': FIXABLE_LANDLINE_INPUT,
                phone: VALID_LANDLINE,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
            phone: VALID_LANDLINE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
        });
    });

    test('duplicate with bad formatting gets fixed', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': FIXABLE_LANDLINE_INPUT,
                phone: VALID_LANDLINE_NO_SPACE,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': FIXABLE_LANDLINE_INPUT,
            phone: VALID_LANDLINE_NO_SPACE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            phone: VALID_LANDLINE,
        });
    });

    test('duplicate with bad formatting gets fixed, respecting country formatting', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': VALID_US_NUMBER,
                phone: VALID_US_NUMBER,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_US_NUMBER,
            phone: VALID_US_NUMBER,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
        });
    });

    test('duplicate non-mobile numbers in phone and mobile are duplicate, not type mismatch', async () => {
        const elements = [
            createGeoJson(1234, {
                mobile: VALID_LANDLINE,
                phone: VALID_LANDLINE,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.hasTypeMismatch).toBe(false);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            mobile: 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            mobile: VALID_LANDLINE,
            phone: VALID_LANDLINE,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            mobile: null,
        });
    });

    test('non-mobile number in mobile tag and other duplicate numbers has duplicate and type mismatch', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': VALID_LANDLINE_2,
                mobile: VALID_LANDLINE,
                phone: VALID_LANDLINE_2,
                name: 'Triple phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.hasTypeMismatch).toBe(true);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': VALID_LANDLINE_2,
            mobile: VALID_LANDLINE,
            phone: VALID_LANDLINE_2,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            mobile: null,
            phone: `${VALID_LANDLINE_2}; ${VALID_LANDLINE}`,
        });
        expect(invalidItem.mismatchTypeNumbers).toEqual({
            mobile: VALID_LANDLINE,
        });
    });

    test('should fix separator and report duplicates for duplicate numbers with incorrect separator', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:phone': `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
                phone: `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
                name: 'Double phone',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(4);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:phone': `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
            phone: `${VALID_LANDLINE}, ${VALID_LANDLINE_2}`,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:phone': null,
            phone: `${VALID_LANDLINE}; ${VALID_LANDLINE_2}`,
        });
    });

    test('should find and remove duplicates among other numbers in one tag', async () => {
        const elements = [
            createGeoJson(5775129635, {
                phone: '+44 1768 779 280;+44 7901854574;+44 7554806119;+44 7554806119;+44 7554806119',
                name: 'Many phones',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(5);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            phone: 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            phone: '+44 1768 779 280;+44 7901854574;+44 7554806119;+44 7554806119;+44 7554806119',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            phone: '+44 17687 79280; +44 7901 854574; +44 7554 806119',
        });
    });

    test('should fix duplicates in a single tag where number is duplicated in another tag as well', async () => {
        const elements = [
            createGeoJson(5775129635, {
                phone: '+44 17687 79280; +441768779280',
                'contact:phone': '+44 (17687) 79280',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.duplicateNumbers).toEqual({
            phone: 'phone',
            'contact:phone': 'phone',
        });
        expect(invalidItem.invalidNumbers).toEqual({
            phone: '+44 17687 79280; +441768779280',
            'contact:phone': '+44 (17687) 79280',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            phone: '+44 17687 79280',
            'contact:phone': null,
        });
    });

    test('whatsapp number is not duplicate to phone tags', async () => {
        const elements = [
            createGeoJson(1234, {
                'contact:whatsapp': `${VALID_MOBILE}`,
                'contact:mobile': `${VALID_MOBILE}`,
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('should fix a fax number on a single element', async () => {
        const elements = [
            createGeoJson(123456, {
                fax: FIXABLE_LANDLINE_INPUT,
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            fax: FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            fax: FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });

    test('toll free fax number is valid', async () => {
        const elements = [
            createGeoJson(123456, {
                fax: VALID_TOLL_FREE,
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('mobile phone fax number is valid', async () => {
        const elements = [
            createGeoJson(123456, {
                fax: VALID_MOBILE,
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('should fix both phone and fax numbers on a single element', async () => {
        const elements = [
            createGeoJson(123456, {
                phone: FIXABLE_MOBILE_INPUT,
                fax: FIXABLE_LANDLINE_INPUT,
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            fax: FIXABLE_LANDLINE_INPUT,
            phone: FIXABLE_MOBILE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            fax: FIXABLE_LANDLINE_SUGGESTED_FIX,
            phone: FIXABLE_MOBILE_SUGGESTED_FIX,
        });
    });

    test('same number for phone and fax is not duplicate', async () => {
        const elements = [
            createGeoJson(123456, {
                phone: VALID_LANDLINE,
                fax: VALID_LANDLINE,
                name: 'Faxable',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(0);
    });

    test('duplicate numbers in fax tags is invalid and fixable', async () => {
        const elements = [
            createGeoJson(123456, {
                'contact:fax': FIXABLE_LANDLINE_INPUT,
                fax: FIXABLE_LANDLINE_INPUT,
                name: 'Double Faxable',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'contact:fax': FIXABLE_LANDLINE_INPUT,
            fax: FIXABLE_LANDLINE_INPUT,
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'contact:fax': null,
            fax: FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
        expect(invalidItem.duplicateNumbers).toEqual({
            'contact:fax': 'fax',
        });
    });

    test('phonewords is invalid and fixable and adds phone:mnemonic', async () => {
        const elements = [createGeoJson(123456, { phone: '1-870-KAKESNY' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'phone:mnemonic': null,
            phone: '1-870-KAKESNY',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'phone:mnemonic': '1-870-KAKESNY',
            phone: '+1-870-525-3769',
        });
    });

    test('AU phonewords is invalid and fixable and adds phone:mnemonic', async () => {
        const elements = [createGeoJson(123456, { phone: '1300-TICKET' })];

        const result = await validateNumbers(Readable.from(elements), 'AU', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        const invalidItem = invalidItems[0];

        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.validPhonewords).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            'phone:mnemonic': null,
            phone: '1300-TICKET',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'phone:mnemonic': '1300-TICKET',
            phone: '1300 842 538',
        });
    });

    test('WhatsApp wa.me message link in whatsapp key is valid', async () => {
        const elements = [
            createGeoJson(123456, {
                'contact:whatsapp': 'https://wa.me/message/ZQ4YRTMO7OUAJ1',
            }),
        ];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
    });

    test('should identify a valid foreign number', async () => {
        const elements = [createGeoJson(2002, { phone: VALID_LANDLINE })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.foreignCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(2002);
        expect(invalidItem.isForeignItem).toBe(true);
        expect(invalidItem.validForeignNumbers).toEqual({
            phone: { [VALID_LANDLINE]: 'GB' },
        });
    });

    test('should identify multiple valid foreign numbers of different countries', async () => {
        const elements = [createGeoJson(2002, { phone: `${VALID_LANDLINE}; ${SLASH_IN_NUMBER_DE_FIX}` })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(2);
        expect(result.invalidCount).toBe(0);
        expect(result.foreignCount).toBe(2);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(2002);
        expect(invalidItem.isForeignItem).toBe(true);
        expect(invalidItem.validForeignNumbers).toEqual({
            phone: {
                [VALID_LANDLINE]: 'GB',
                [SLASH_IN_NUMBER_DE_FIX]: 'DE',
            },
        });
    });

    // US uses hyphens, UK uses spaces. Fix should have spaces, not brackets.
    test('should format a foreign number with formatting for that country, not the local country', async () => {
        const elements = [createGeoJson(2002, { phone: '(+44) 0207 9460000' })];

        const result = await validateNumbers(Readable.from(elements), COUNTRY_CODE_US, tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(2); // second is foreign item
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(2002);
        expect(invalidItem.autoFixable).toBe(true);
        expect(invalidItem.invalidNumbers).toEqual({
            phone: '(+44) 0207 9460000',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            phone: FIXABLE_LANDLINE_SUGGESTED_FIX,
        });
    });
});
