import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { validateHoursTag, validateOpeningHours } from '../src/opening-hours-processor';

describe('validateHoursTag', () => {
    test('Valid opening hours is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(false);
    });

    test('What happens with unknown tag', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00', 'made_up_tag', 'en');
        console.log(result);
        expect(result.isInvalid).toBe(false);
    });

    test('Opening hours with capitalised days is invalid but fixable', () => {
        const result = validateHoursTag('MO-FR 08:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.prettyValue).toBe('Mo-Fr 08:00-17:00');
    });

    test('Opening hours with three-letter days is invalid but fixable', () => {
        const result = validateHoursTag('Mon-Fri 08:00-17:00', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(true);
        expect(result.prettyValue).toBe('Mo-Fr 08:00-17:00');
        expect(result.warnings).toBeDefined();
    });

    test('Totally invalid opening hours is invalid and unfixable', () => {
        const result = validateHoursTag('Sometimes', 'opening_hours', 'en');
        expect(result.isInvalid).toBe(true);
        expect(result.isAutoFixable).toBe(false);
        expect(result.prettyValue).toBeNull();
        expect(result.warnings).toBeDefined();
    });

    test('Valid point in time collection times is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-17:00', 'collection_times', 'en');
        expect(result.isInvalid).toBe(false);
    });

    test('Valid range collection times is valid', () => {
        const result = validateHoursTag('Mo-Fr 08:00-08:30', 'collection_times', 'en');
        expect(result.isInvalid).toBe(false);
    });

    test('Valid point in time service times is valid', () => {
        const result = validateHoursTag('Su 10:00', 'service_times', 'en');
        expect(result.isInvalid).toBe(false);
    });

    test('Valid range collection times is valid', () => {
        const result = validateHoursTag('Su 10:00-12:00', 'service_times', 'en');
        expect(result.isInvalid).toBe(false);
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
    const createGeoJson = (tags, lat=0.0, lon=0.0, type = 'node') => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [lon, lat]
        },
        properties: {
            ...tags,
            '@id': 1000,
            '@type': type,
            '@user': 'test-user',
            '@timestamp': '1776196800',
            '@changeset': '12345'
        }
    });

    test('Parse a single valid opening hours', async () => {
        const elements = [
            createGeoJson({ opening_hours: 'Mo-Fr 08:00-17:00' })
        ];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        console.log(result);
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
            })
        ];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        console.log(result);
        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(0);
        expect(result.autoFixableCount).toBe(0);
    });

    test('Fix a single invalid opening hours', async () => {
        const elements = [
            createGeoJson({ opening_hours: 'MON-FRI 08:00-17:00' })
        ];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        console.log(result);
        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.autoFixableCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.invalidHours).toEqual({
            'opening_hours': 'MON-FRI 08:00-17:00',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'opening_hours': 'Mo-Fr 08:00-17:00',
        });
        expect(invalidItem.warnings['opening_hours']).toBeDefined();
    });

    test('Fix hours across multiple keys', async () => {
        const elements = [
            createGeoJson({
                opening_hours: 'MON-FRI 08:00-17:00',
                'opening_hours:kitchen': 'Monday-Friday 16:00-17:00',
                'opening_hours:drive_through': 'Monday to Friday 10:00-12:00',
            })
        ];

        const result = await validateOpeningHours(Readable.from(elements), 'en', tmpFilePath);

        console.log(result);
        expect(result.totalCount).toBe(3);
        expect(result.invalidCount).toBe(3);
        expect(result.autoFixableCount).toBe(3);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.invalidHours).toEqual({
            'opening_hours': 'MON-FRI 08:00-17:00',
            'opening_hours:kitchen': 'Monday-Friday 16:00-17:00',
            'opening_hours:drive_through': 'Monday to Friday 10:00-12:00',
        });
        expect(invalidItem.suggestedFixes).toEqual({
            'opening_hours': 'Mo-Fr 08:00-17:00',
            'opening_hours:kitchen': 'Mo-Fr 16:00-17:00',
            'opening_hours:drive_through': 'Mo-Fr 10:00-12:00',
        });
        expect(invalidItem.warnings['opening_hours']).toBeDefined();
        expect(invalidItem.warnings['opening_hours:kitchen']).toBeDefined();
        expect(invalidItem.warnings['opening_hours:drive_through']).toBeDefined();
    });
});
