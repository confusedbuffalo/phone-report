const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateNames } = require("../src/names-processor");

describe('validateNames', () => {
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
    const createGeoJson = (id, tags, lat=0.0, lon=0.0, type = 'node') => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [lon, lat]
        },
        properties: {
            ...tags,
            '@id': id,
            '@type': type,
            '@user': 'test-user',
            '@timestamp': '1776196800',
            '@changeset': '12345'
        }
    });

    test('just a name is valid', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(0);
    });

    test('no name tags is not counted', async () => {
        const elements = [
            createGeoJson(1001, { highway: 'residential' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(0);
        expect(result.incompleteNames).toBe(0);
    });

    test('name and matching name in subtag is valid', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:en': 'Test' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(0);
    });

    test('name and matching name in subtag is valid with other different names', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:en': 'Test', 'name:fr': 'Le Test', 'name:de': 'Das Test' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(0);
    });

    test('multiple matching names is valid', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:en': 'Test', 'name:en-GB': 'Test', 'name:fr': 'Le Test', 'name:de': 'Das Test' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(0);
    });

    test('name and different names with no matching is invalid', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:fr': 'Le Test', 'name:de': 'Das Test' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));

        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(1001);

        expect(invalidItem.name).toBe('Test');
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'Le Test',
            'name:de': 'Das Test',
        })
    });

    test('No name but name subtag is invalid', async () => {
        const elements = [
            createGeoJson(1001, { 'name:en': 'Test' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.name).toBeUndefined();
        expect(invalidItem.nameTags).toEqual({
            'name:en': 'Test',
        })
    });

    test('name:signed is not a name', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:signed': 'no' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(0);
    });

    test('name:signed without a name is not a name', async () => {
        const elements = [
            createGeoJson(1001, { 'name:signed': 'no' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalNames).toBe(0);
        expect(result.incompleteNames).toBe(0);
    });

    test('name:etymology is not a name', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:etymology': 'Testing' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);


        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(0);
    });

    test('name:zh-Hant is a name', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:zh-Hant': '測試' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        
        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(1);
    });

    test('name:zh-Latn-pinyin is a name', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:zh-Latn-pinyin': 'cè shì' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        
        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(1);
    });

    test('name:be-tarask is a name', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:be-tarask': 'Тэст' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        
        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(1);
    });

    test('name:ja-Latn is a name', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:ja-Latn': 'Tesuto' })
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        
        expect(result.totalNames).toBe(1);
        expect(result.incompleteNames).toBe(1);
    });
});
