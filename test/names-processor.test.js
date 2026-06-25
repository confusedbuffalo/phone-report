import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { validateNames } from '../src/names-processor.js';

describe('validateNames', () => {
    let testCounter = 0;
    let tmpFilePath;

    beforeEach(() => {
        testCounter++;
        tmpFilePath = path.join(os.tmpdir(), `validate-names-test-${testCounter}.json`);
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

    test('just a name is valid', async () => {
        const elements = [createGeoJson(1001, { name: 'Test' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(0);
    });

    test('no name tags is not counted', async () => {
        const elements = [createGeoJson(1001, { highway: 'residential' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(0);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('name and matching name in subtag is valid', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:en': 'Test' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('name and matching name in subtag is valid with other different names', async () => {
        const elements = [
            createGeoJson(1001, { name: 'Test', 'name:en': 'Test', 'name:fr': 'Le Test', 'name:de': 'Das Test' }),
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('multiple matching names is valid', async () => {
        const elements = [
            createGeoJson(1001, {
                name: 'Test',
                'name:en': 'Test',
                'name:en-GB': 'Test',
                'name:fr': 'Le Test',
                'name:de': 'Das Test',
            }),
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('multilingual names with no primary name is invalid', async () => {
        const elements = [createGeoJson(1001, { 'name:fr': 'Le Test', 'name:de': 'Das Test' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(1);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));

        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(1001);

        expect(invalidItem.name).toBeUndefined();
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'Le Test',
            'name:de': 'Das Test',
        });
    });

    test('name and different names with no matching is invalid', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:fr': 'Le Test', 'name:de': 'Das Test' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));

        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(1001);

        expect(invalidItem.name).toBe('Test');
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'Le Test',
            'name:de': 'Das Test',
        });
    });

    test('name and different names with no matching is invalid', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:fr': 'Le Test', 'name:de': 'Das Test' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));

        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.id).toBe(1001);

        expect(invalidItem.name).toBe('Test');
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'Le Test',
            'name:de': 'Das Test',
        });
    });

    test('French and Dutch names separated by hyphen with both languages tagged is not valid in another country', async () => {
        const elements = [createGeoJson(1001, { name: 'French - Dutch', 'name:fr': 'French', 'name:nl': 'Dutch' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);
    });

    test('French and Dutch names separated by hyphen with both languages tagged is valid in Brussels', async () => {
        const elements = [createGeoJson(1001, { name: 'French - Dutch', 'name:fr': 'French', 'name:nl': 'Dutch' })];

        const result = await validateNames(Readable.from(elements), 'BE-BRU', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('French and Dutch names separated by hyphen but the wrong way round is invalid in Brussels', async () => {
        const elements = [createGeoJson(1001, { name: 'Dutch - French', 'name:fr': 'French', 'name:nl': 'Dutch' })];

        const result = await validateNames(Readable.from(elements), 'BE-BRU', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.name).toEqual('Dutch - French');
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'French',
            'name:nl': 'Dutch',
        });
    });

    test('French and Dutch names separated by hyphen with one language missing is invalid in Brussels', async () => {
        const elements = [createGeoJson(1001, { name: 'French - Dutch', 'name:fr': 'French' })];

        const result = await validateNames(Readable.from(elements), 'BE-BRU', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.name).toEqual('French - Dutch');
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'French',
        });
    });

    test('French and Dutch names badly separated (slash) is invalid in Brussels', async () => {
        const elements = [createGeoJson(1001, { name: 'French / Dutch', 'name:fr': 'French', 'name:nl': 'Dutch' })];

        const result = await validateNames(Readable.from(elements), 'BE-BRU', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.name).toEqual('French / Dutch');
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'French',
            'name:nl': 'Dutch',
        });
    });

    test('French and Dutch names badly separated (no spaces) is invalid in Brussels', async () => {
        const elements = [createGeoJson(1001, { name: 'French-Dutch', 'name:fr': 'French', 'name:nl': 'Dutch' })];

        const result = await validateNames(Readable.from(elements), 'BE-BRU', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);

        const invalidItems = JSON.parse(fs.readFileSync(tmpFilePath, 'utf-8'));
        expect(invalidItems).toHaveLength(1);
        const invalidItem = invalidItems[0];

        expect(invalidItem.name).toEqual('French-Dutch');
        expect(invalidItem.nameTags).toEqual({
            'name:fr': 'French',
            'name:nl': 'Dutch',
        });
    });

    test('French and Dutch names separated by hyphen with both languages tagged is valid in Wallonia', async () => {
        const elements = [createGeoJson(1001, { name: 'French - Dutch', 'name:fr': 'French', 'name:nl': 'Dutch' })];

        const result = await validateNames(Readable.from(elements), 'BE-WAL', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('French and Dutch names separated by hyphen with both languages tagged is valid in Flanders', async () => {
        const elements = [createGeoJson(1001, { name: 'French - Dutch', 'name:fr': 'French', 'name:nl': 'Dutch' })];

        const result = await validateNames(Readable.from(elements), 'BE-VLG', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('French and German names separated by hyphen with both languages tagged is valid in Wallonia', async () => {
        const elements = [createGeoJson(1001, { name: 'French - German', 'name:fr': 'French', 'name:de': 'German' })];

        const result = await validateNames(Readable.from(elements), 'BE-WAL', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(0);
        expect(result.missingNamesCount).toBe(0);
    });

    test('French and German names separated by hyphen with both languages tagged is invalid in Flanders', async () => {
        const elements = [createGeoJson(1001, { name: 'French - German', 'name:fr': 'French', 'name:de': 'German' })];

        const result = await validateNames(Readable.from(elements), 'BE-VLG', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);
    });

    test('name:signed is not a name', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:signed': 'no' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(0);
    });

    test('name:signed without a name is not a name', async () => {
        const elements = [createGeoJson(1001, { 'name:signed': 'no' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(0);
    });

    test('name:etymology is not a name', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:etymology': 'Testing' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(0);
    });

    test('name:zh-Hant is a name', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:zh-Hant': '測試' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);
    });

    test('name:zh-Latn-pinyin is a name', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:zh-Latn-pinyin': 'cè shì' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);
    });

    test('name:be-tarask is a name', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:be-tarask': 'Тэст' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);
    });

    test('name:ja-Latn is a name', async () => {
        const elements = [createGeoJson(1001, { name: 'Test', 'name:ja-Latn': 'Tesuto' })];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(1);
        expect(result.invalidCount).toBe(1);
        expect(result.missingNamesCount).toBe(0);
    });

    test('Skip boundary=administrative', async () => {
        const elements = [
            createGeoJson(1001, {
                name: 'Österreich - Slovensko',
                'name:cd': 'Rakousko - Slovensko',
                'name:de': 'Österreich - Slowakei',
                boundary: 'administrative',
            }),
        ];

        const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

        expect(result.totalCount).toBe(0);
    });

    describe('valid multilingual names', () => {
        test.each([
            { name: 'A / B', 'name:en': 'A', 'name:mi': 'B' },
            { name: 'A / B', 'name:en': 'B', 'name:mi': 'A' },
            { name: 'A;B', 'name:en': 'A', 'name:mi': 'B' },
            { name: 'A (B)', 'name:en': 'A', 'name:mi': 'B' },
        ])('%s', async tags => {
            const elements = [createGeoJson(1001, tags)];
            const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

            expect(result.totalCount).toBe(1);
            expect(result.invalidCount).toBe(0);
            expect(result.missingNamesCount).toBe(0);
        });
    });

    describe('invalid multilingual names', () => {
        test.each([
            { name: 'A / B', 'name:en': 'A' },
            { name: 'A / B', 'name:en': 'B', 'name:mi': 'B' },
            { name: 'A;B', 'name:en': 'B;A' },
        ])('%s', async tags => {
            const elements = [createGeoJson(1001, tags)];
            const result = await validateNames(Readable.from(elements), 'GB', tmpFilePath);

            expect(result.totalCount).toBe(1);
            expect(result.invalidCount).toBe(1);
            expect(result.missingNamesCount).toBe(0);
        });
    });

    describe('undelimited multilingual names', () => {
        test.each([
            // DZ
            {
                country: 'DZ',
                isValid: true,
                name: "Wilaya d'Alger ⵜⴰⵡⵉⵍⴰⵢⵜ ⵏ ⴷⵣⴰⵢⵔ ولاية الجزائر",
                'name:fr': "Wilaya d'Alger",
                'name:ber': 'ⵜⴰⵡⵉⵍⴰⵢⵜ ⵏ ⴷⵣⴰⵢⵔ',
                'name:ar': 'ولاية الجزائر',
            },
            {
                country: 'DZ',
                isValid: false,
                name: "Wilaya d'Alger ⵜⴰⵡⵉⵍⴰⵢⵜ ⵏ ⴷⵣⴰⵢⵔ ولاية الجزائر",
                'name:fr': "Wilaya d'Alger",
                // name:ber is missing
                'name:ar': 'ولاية الجزائر',
            },
            {
                country: 'DZ',
                isValid: true,
                name: 'ⵜⴰⵡⵉⵍⴰⵢⵜ ⵏ ⴷⵣⴰⵢⵔ ولاية الجزائر',
                'name:ber': 'ⵜⴰⵡⵉⵍⴰⵢⵜ ⵏ ⴷⵣⴰⵢⵔ',
                'name:ar': 'ولاية الجزائر',
            },

            // HK
            {
                country: 'HK',
                isValid: true,
                name: '干諾道中 Connaught Road Central',
                'name:zh': '干諾道中',
                'name:en': 'Connaught Road Central',
            },
            {
                country: 'HK',
                isValid: false,
                name: '干諾道中 Connaught Road Central',
                'name:zh-Hant': '干諾道中', // zh-Hant instead of zh
                'name:en': 'Connaught Road Central',
            },

            // MA
            {
                country: 'MA',
                isValid: true,
                name: 'Province de Tiznit ⵜⴰⵙⴳⴰ ⵏ ⵜⵉⵣⵏⵉⵜ إقليم تزنيت',
                'name:ar': 'إقليم تزنيت',
                'name:fr': 'Province de Tiznit',
                'name:zgh': 'ⵜⴰⵙⴳⴰ ⵏ ⵜⵉⵣⵏⵉⵜ',
            },
            {
                country: 'MA',
                isValid: false,
                name: 'Province de Tiznit ⵜⴰⵙⴳⴰ ⵏ ⵜⵉⵣⵏⵉⵜ إقليم تزنيت',
                'name:ar': 'إقليم تزنيت',
                'name:fr': 'Province', // mismatched
                'name:zgh': 'ⵜⴰⵙⴳⴰ ⵏ ⵜⵉⵣⵏⵉⵜ',
            },

            // NZ
            {
                country: 'NZ',
                isValid: true,
                name: 'Auckland Art Gallery Toi o Tāmaki',
                'name:en': 'Auckland Art Gallery',
                'name:mi': 'Toi o Tāmaki',
            },
            {
                country: 'NZ',
                isValid: true,
                name: 'Toi o Tāmaki Auckland Art Gallery',
                'name:en': 'Auckland Art Gallery',
                'name:mi': 'Toi o Tāmaki',
            },
            {
                country: 'NZ',
                isValid: false,
                name: 'Toi o Tāmaki,Auckland Art Gallery', // strange punctuation
                'name:en': 'Auckland Art Gallery',
                'name:mi': 'Toi o Tāmaki',
            },
        ])('%s', async ({ country, isValid, ...tags }) => {
            const elements = [createGeoJson(1001, tags)];
            const result = await validateNames(Readable.from(elements), country, tmpFilePath);
            expect(result.totalCount).toBe(1);
            expect(result.invalidCount).toBe(+!isValid);
            expect(result.missingNamesCount).toBe(0);

            // base case: confirm that this is invalid in any other country
            const baseResult = await validateNames(Readable.from(elements), 'US', tmpFilePath);
            expect(baseResult.totalCount).toBe(1);
            expect(baseResult.invalidCount).toBe(1);
            expect(baseResult.missingNamesCount).toBe(0);
        });
    });
});
