const fs = require('fs');
const path = require('path');
const { COUNTRIES } = require('../src/constants.js');


const localesDir = path.join(__dirname, '../locales');
const translationFiles = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json'))
    .map(file => ({
        locale: file.replace('.json', ''),
        content: require(path.join(localesDir, file))
    }));

describe('Countries file tests', () => {

    test('Countries should be arranged in alphabetical order', () => {
        const keys = Object.keys(COUNTRIES);
        const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
        expect(keys).toEqual(sortedKeys);
    });

    for (const countryKey in COUNTRIES) {
        const countryData = COUNTRIES[countryKey];

        test(`[${countryKey}] must include required data`, () => {
            expect(countryData).toMatchObject({
                countryCode: expect.any(String),
                locale: expect.any(String),
                safeAutoFixBotEnabled: expect.any(Boolean),
            });
        });

        test(`[${countryKey}] must have a locale file`, () => {
            expect(translationFiles.some(file => file.locale === countryData.locale)).toBe(true);
        });

        test(`[${countryKey}] must have divisions or divisionMap (but not both)`, () => {
            const hasDivisions = countryData.hasOwnProperty('divisions');
            const hasDivisionMap = countryData.hasOwnProperty('divisionMap');

            expect(hasDivisions !== hasDivisionMap).toBe(true);
        });

        function isNumberOrIdPbfObject(value) {
            if (typeof value === 'number') {
                expect(typeof value).toBe('number');
            } else {
                expect(value).toEqual({
                    relationId: expect.any(Number),
                    ...(value.pbfUrl !== undefined && { pbfUrl: expect.any(String) }),
                    ...(value.countryCode !== undefined && { countryCode: expect.any(String) })
                });
            }
        }

        if (countryData.hasOwnProperty('divisions')) {
            test(`[${countryKey}] divisions is set up correctly`, () => {
                Object.values(countryData.divisions).forEach((value) => {
                    isNumberOrIdPbfObject(value);
                });
            });
        } else if (countryData.hasOwnProperty('divisionMap')) {
            test(`[${countryKey}] divisionMap is set up correctly`, () => {
                Object.values(countryData.divisionMap).forEach((division) => {
                    Object.values(division).forEach((value) => {
                        isNumberOrIdPbfObject(value);
                    });
                });
            });
        }

        test(`[${countryKey}] all regions must have an extract URL`, () => {
            if (countryData.hasOwnProperty('pbfUrl')) {
                expect(typeof countryData.pbfUrl).toBe('string')
            } else if (countryData.hasOwnProperty('divisions')) {
                Object.values(countryData.divisions).forEach((value) => {
                    expect(value.hasOwnProperty('pbfUrl')).toBe(true)
                });
            } else {
                Object.values(countryData.divisionMap).forEach((division) => {
                    Object.values(division).forEach((value) => {
                        expect(value.hasOwnProperty('pbfUrl')).toBe(true)
                    });
                });
            }
        });
    }
});
