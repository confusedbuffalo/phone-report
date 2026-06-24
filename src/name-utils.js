// @ts-check
/**
 * splits a name like `A;B` or `A / B` or `A (B)`
 * into the individual components (`['A', 'B']`)
 * @param {string} name
 * @returns {string[]}
 */
export function splitCompoundName(name) {
    /** @type {string[]} */
    const collected = [];

    // first split parentheses
    let pointer = 0;
    for (const part of name.matchAll(/\(([^)]+)\)/g)) {
        collected.push(name.slice(pointer, part.index), part[1]);
        pointer = part.index + part[0].length;
    }
    collected.push(name.slice(pointer));

    // then split other delimiters
    const parts = collected
        .flatMap(part => part.split(';'))
        .flatMap(part => part.split(' / '))
        .flatMap(part => part.split(' | '))
        .map(part => part.trim())
        .filter(Boolean);

    // deduplicate
    return [...new Set(parts)];
}
