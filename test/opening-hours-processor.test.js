import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { isAmbiguousHours, validateHoursTag, validateOpeningHours } from '../src/opening-hours-processor';

describe('isAmbiguousHours', () => {
    test('Empty value is not ambiguous', () => {
        const emptyNew = isAmbiguousHours('Mo-Fr 9:00-10:30', '', 'opening_hours', 'en');
        expect(emptyNew).toBe(false);

        const emptyOld = isAmbiguousHours('', 'Mo-Fr 9:00-10:30', 'opening_hours', 'en');
        expect(emptyOld).toBe(false);

        const emptyBoth = isAmbiguousHours('', '', 'opening_hours', 'en');
        expect(emptyBoth).toBe(false);
    });

    test('Single-digit hour to hour less than 12 is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 9:00-10:30', 'Mo-Fr 09:00-10:30', 'opening_hours', 'en');
        expect(result).toBe(true);
    });

    test('Single-digit hour with missing space is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr9:00-10:30', 'Mo-Fr 09:00-10:30', 'opening_hours', 'en');
        expect(result).toBe(true);
    });

    test('Single-digit hour to with dot is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 4.00-5.00', 'Mo-Fr 04:00-05:00', 'opening_hours', 'en');
        expect(result).toBe(true);
    });

    test('Single-digit hour with am is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3:00am-3:00pm', 'Mo-Fr 03:00-15:00', 'opening_hours', 'en');
        expect(result).toBe(false);
    });

    test('Single-digit hour with a.m. is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3:00 a.m.-3:00 p.m.', 'Mo-Fr 03:00-15:00', 'opening_hours', 'en');
        expect(result).toBe(false);
    });

    test('Single-digit hour with P.M. is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3:00A.M.-3:00P.M.', 'Mo-Fr 03:00-15:00', 'opening_hours', 'en');
        expect(result).toBe(false);
    });

    test('Single-digit hour with am and no minutes is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3am-4pm', 'Mo-Fr 03:00-16:00', 'opening_hours', 'en');
        expect(result).toBe(false);
    });

    test('Adding missing zero to minutes is not ambiguous', () => {
        const result = isAmbiguousHours('09:0-17:00', '09:00-17:00', 'opening_hours', 'en');
        expect(result).toBe(false);
    });

    test('Adding missing zero to month day is not ambiguous', () => {
        const result = isAmbiguousHours('Jan 1 09:00-17:00', 'Jan 01 09:00-17:00', 'opening_hours', 'en');
        expect(result).toBe(false);
    });
});

describe('validateHoursTag', () => {
    test('Valid opening hours is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Opening hours with capitalised days is invalid but fixable', () => {
        const result = validateHoursTag('MO-FR 08:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.prettyValue).toBe('Mo-Fr 08:00-17:00');
        expect(result.disconnected).toBe(false);
    });

    test('Opening hours with lower case off is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00; Sa,Su off', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Opening hours with title case off is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00; Sa,Su Off', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Opening hours with title case off multiple times is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00; Sa,Su Off; PH Off', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Opening hours with title case closed is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00; Sa,Su Closed', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Opening hours with title case Easter is valid', () => {
        const result = validateHoursTag('Easter-Oct 31 Mo-Su 10:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Opening hours with three-letter days is invalid but fixable', () => {
        const result = validateHoursTag('Mon-Fri 08:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.prettyValue).toBe('Mo-Fr 08:00-17:00');
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('Opening hours with missing leading zero in hours is invalid but fixable', () => {
        // This must be kept, because sometimes there are things like "Mo-Fr 08:15-4:45"
        // which would be corrected to "Mo-Fr 08:15-04:45", which is wrong, but needs to be flagged
        const result = validateHoursTag('Mo-Fr 8:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.prettyValue).toBe('Mo-Fr 08:00-17:00');
        expect(result.disconnected).toBe(false);
        expect(result.isAmbiguous).toBe(true);
    });

    test('Totally invalid opening hours is invalid and unfixable', () => {
        const result = validateHoursTag('Sometimes', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
        expect(result.prettyValue).toBeNull();
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('Valid point in time collection times is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00', 'collection_times', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Valid range collection times is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-08:30', 'collection_times', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Valid point in time service times is valid', () => {
        const result = validateHoursTag('Su 10:00', 'service_times', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Valid range collection times is valid', () => {
        const result = validateHoursTag('Su 10:00-12:00', 'service_times', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('No spaces after semicolon is valid', () => {
        const result = validateHoursTag(
            'Mo,We,Th 09:30-18:30;Tu,Fr 09:30-20:30;Sa 09:00-18:30;Su 09:30-18:00',
            'opening_hours',
            'en'
        );
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Spaces in time range is valid', () => {
        const result = validateHoursTag('Mo-Sa 12:00-14:30, 17:00-21:30', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Space before comma is valid', () => {
        const result = validateHoursTag('Mo-Sa 12:00-14:30 , 17:00-21:30', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Spaces between days is valid', () => {
        const result = validateHoursTag('Mo-Th, Sa 10:00-17:00; Fr 10:00-18:00; Su 11:00-15:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Spaces around a hyphen is valid', () => {
        const result = validateHoursTag('Mo - Th, Sa 10:00 - 17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Inconsistent spaces around a hyphen is valid', () => {
        const result = validateHoursTag('Mo- Th, Sa 10:00 -17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('No space between day and time is valid', () => {
        const result = validateHoursTag('Mo-Fr10:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Double spaces is valid', () => {
        const result = validateHoursTag('Mo-Fr  10:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Space between days and week modifier is valid', () => {
        const result = validateHoursTag('Su [1,3] 08:00-14:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('No space after week modifier is valid', () => {
        const result = validateHoursTag('Su[1,3]08:00-14:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('No space between month and day with colon is valid', () => {
        const result = validateHoursTag('Jul-Sep:Sa 15:00-19:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Spaces between month and day with colon is valid', () => {
        const result = validateHoursTag('Jul-Sep : Sa 15:00-19:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('No spaces around fallback separator is valid', () => {
        const result = validateHoursTag('Mo-Fr 10:00-17:00||"by appointment"', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Comma separated days that could be a range is valid', () => {
        const result = validateHoursTag('Mo,Tu,We,Th 10:00-16:30', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Comma separated days that could be a range is valid for two consecutive days', () => {
        const result = validateHoursTag('Mo,Tu 10:00-16:30', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Days as range is valid for two consecutive days', () => {
        const result = validateHoursTag('Mo-Tu 10:00-16:30', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Single digit day is valid', () => {
        const result = validateHoursTag('Mo-Fr 10:00-17:00; Jan 1 off', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Single digit day with some other issue is invalid', () => {
        const result = validateHoursTag('Monday-Friday 10:00-17:00; Jan 1 off', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.prettyValue).toEqual('Mo-Fr 10:00-17:00; Jan 01 off');
        expect(result.disconnected).toBe(false);
    });

    test('Single digit week number is valid', () => {
        const result = validateHoursTag('week 1-12 Mo-Fr 10:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
        expect(result.disconnected).toBe(false);
    });

    test('Warning for disconnected time range', () => {
        const result = validateHoursTag('Mo 10:00-16:30 Tu 10:00-16:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.disconnected).toBe(true);
        expect(result.prettyValue).toBeNull();
    });

    test('Warning for disconnected time range with partial fix', () => {
        const result = validateHoursTag('Monday 10:00-16:30 Tuesday 10:00-16:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.disconnected).toBe(true);
        expect(result.prettyValue).toEqual('Mo 10:00-16:30 Tu 10:00-16:00');
    });

    test('Warning for ambiguous single-digit hours', () => {
        const result = validateHoursTag('Mo-Fr 9:00-10:30', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.disconnected).toBe(false);
        expect(result.isAmbiguous).toBe(true);
        expect(result.prettyValue).toEqual('Mo-Fr 09:00-10:30');
    });
});

describe('validateOpeningHours', () => {
    let testCounter = 0;
    let tmpFilePath;

    beforeEach(() => {
        testCounter++;
        tmpFilePath = path.join(os.tmpdir(), `validate-hours-test-${testCounter}.json`);
    });

    afterEach(() => {
        if (fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
        }
    });

    // Helper to wrap elements into GeoJSON-like objects with Map properties
    const createGeoJson = (tags, lat = 0.0, lon = 0.0, type = 'node') => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [lon, lat],
        },
        properties: {
            ...tags,
            '@id': 1000,
            '@type': type,
            '@user': 'test-user',
            '@timestamp': '1776196800',
            '@changeset': '12345',
        },
    });

    test('Parse a single valid opening hours', async () => {
        const elements = [createGeoJson({ opening_hours: 'Mo-Fr 08:00-17:00' })];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.autoFixableCount).toBe(0);
    });

    test('Count hours across multiple keys', async () => {
        const elements = [
            createGeoJson({
                opening_hours: 'Mo-Fr 08:00-17:00',
                'opening_hours:kitchen': 'Mo-Fr 16:00-17:00',
                'opening_hours:drive_through': 'Mo-Fr 10:00-12:00',
            }),
        ];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(0);
        expect(result.autoFixableCount).toBe(0);
    });

    test('Fix a single invalid opening hours', async () => {
        const elements = [createGeoJson({ opening_hours: 'MON-FRI 08:00-17:00' })];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.autoFixableCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.invalidHours).toEqual({
            opening_hours: 'MON-FRI 08:00-17:00',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            opening_hours: 'Mo-Fr 08:00-17:00',
        });
        expect(invalidItem.warnings['opening_hours']).toBeDefined();
    });

    test('Fix hours across multiple keys', async () => {
        const elements = [
            createGeoJson({
                opening_hours: 'MON-FRI 08:00-17:00',
                'opening_hours:kitchen': 'Monday-Friday 16:00-17:00',
                'opening_hours:drive_through': 'Monday to Friday 10:00-12:00',
            }),
        ];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(3);
        expect(result.autoFixableCount).toBe(3);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.invalidHours).toEqual({
            opening_hours: 'MON-FRI 08:00-17:00',
            'opening_hours:kitchen': 'Monday-Friday 16:00-17:00',
            'opening_hours:drive_through': 'Monday to Friday 10:00-12:00',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            opening_hours: 'Mo-Fr 08:00-17:00',
            'opening_hours:kitchen': 'Mo-Fr 16:00-17:00',
            'opening_hours:drive_through': 'Mo-Fr 10:00-12:00',
        });
        expect(invalidItem.warnings['opening_hours']).toBeDefined();
        expect(invalidItem.warnings['opening_hours:kitchen']).toBeDefined();
        expect(invalidItem.warnings['opening_hours:drive_through']).toBeDefined();
    });
});
