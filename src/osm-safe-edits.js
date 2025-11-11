const fs = require('fs');
const path = require('path');
const { chain } = require('stream-chain');
const { parser } = require('stream-json/Parser');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { disassembler } = require('stream-json/Disassembler');
const { stringer } = require('stream-json/Stringer');
const { safeName } = require('./data-processor');
const { SAFE_EDITS_DIR } = require('./constants');

async function generateSafeEditFile(countryName, subdivisionStats, tmpFilePath) {
    const safeCountryName = safeName(countryName);
    const singleLevelDivision = safeCountryName === subdivisionStats.divisionSlug || subdivisionStats.divisionSlug === subdivisionStats.slug;
    const subdivisionSlug = singleLevelDivision ? subdivisionStats.slug : path.join(subdivisionStats.divisionSlug, subdivisionStats.slug);
    const safeCountryDir = path.join(SAFE_EDITS_DIR, safeCountryName);

    if (!fs.existsSync(safeCountryDir)) {
        fs.mkdirSync(safeCountryDir, { recursive: true });
    }

    const dataFilePath = path.join(safeCountryDir, `${subdivisionSlug}.json`);

    const stringerOptions = { makeArray: true };

    const FilterStream = require('stream').Transform;
    class SafeEditFilter extends FilterStream {
        constructor(options) {
            super({ objectMode: true, ...options });
        }

        _transform(chunk, encoding, callback) {
            const item = chunk.value;
            if (item && item.safeEdit === true) {
                const disassembledItem = {
                    type: item.type,
                    id: item.id,
                    invalidNumbers: item.invalidNumbers,
                    suggestedFixes: item.suggestedFixes,
                };
                this.push(disassembledItem);
            }
            // If false or undefined, do nothing (i.e., filter it out)
            callback();
        }
    }

    const pipelinePromise = new Promise((resolve, reject) => {
        const pipeline = chain([
            fs.createReadStream(tmpFilePath),
            parser(),
            streamArray(),
            new SafeEditFilter(),
            disassembler(),
            stringer(stringerOptions),
            fs.createWriteStream(dataFilePath)
        ]);

        pipeline.on('error', (err) => {
            console.error('An error occurred during streaming:', err);
            reject(err);
        });
        pipeline.on('finish', () => {
            console.log(`Safe edits output data written to ${dataFilePath}`);
            resolve();
        });
    });

    await pipelinePromise;
}

module.exports = {
    generateSafeEditFile,
};
