const { diffChars } = require('diff');
const { UNIVERSAL_SPLIT_CAPTURE_REGEX } = require('./constants.js');
const { escapeHTML } = require('./html-utils.js');

// We need custom diff logic, because if diffChars is used alone then it marks characters as
// being added or removed when, semantically, they are just being moved.
// e.g. 0123 456 being changed to 012 34 56 would show the 3 as being deleted from the first
// string and added to the second string. Instead, we want to show the digits as unchanging
// and the formatting as the change.


// Used for splitting the suggested fix (assuming standard semicolon separation)
const NEW_SPLIT_CAPTURE_REGEX = /(; ?)/g;


// --- Helper Functions ---

/**
 * Normalizes a phone number string to contain only digits.
 * Used for finding true (semantic) changes in the numbers.
 * @param {string} str - The phone number string.
 * @returns {string} The normalized string (digits only).
 */
const normalize = (str) => str.replace(/[^\d]/g, '');

/**
 * Helper function to consolidate lone '+' signs with the following segment, 
 * ensuring the full international number is treated as one segment.
 * @param {Array<string>} parts - Array of segments from a split operation.
 * @returns {Array<string>} Consolidated array.
 */
function consolidatePlusSigns(parts) {
    let consolidated = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        // Check if the part is a lone '+' (must trim for this check)
        if (part.trim() === '+' && i + 1 < parts.length) {
            // If it is, merge '+' with the next segment (we trim the next segment as it should be a number)
            consolidated.push('+' + parts[i + 1].trim());
            i++; // Skip the next segment, as it was consumed
        } else {
            // Otherwise, keep the segment as is, preserving separator spaces.
            consolidated.push(part);
        }
    }
    // Filter out any remaining pure whitespace or empty strings.
    return consolidated.filter(s => s && s.trim().length > 0);
}


/**
 * Replaces invisible Unicode control characters (zero-width characters, 
 * joiners, and directional marks) in a string with the visible space symbol (U+2423 '␣').
 * This is primarily used for displaying user input in a diff or log, ensuring
 * that characters which consume zero width (and would otherwise be invisible) 
 * are clearly marked as present in the original string before being removed by 
 * parsing/cleaning logic.
 * @param {string} text The input string potentially containing invisible Unicode characters.
 * @returns {string} The string with all specified invisible characters replaced by '␣'.
 */
function replaceInvisibleChars(text) {
    if (!text) {
        "";
    }
    // The pattern targets the common zero-width, joiner, and directional marks.
    const invisibleCharPattern = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
    return text.replace(invisibleCharPattern, '␣');
}


// --- Core Diff Logic ---

/**
 * Performs a two-way diff on phone numbers
 * @param {string} original - The phone number to be fixed.
 * @param {string} suggested - The fixed phone number.
 * @returns {{
 * originalDiff: Array<{value: string, added: boolean, removed: boolean}>, 
 * suggestedDiff: Array<{value: string, added: boolean, removed: boolean}>
 * }} The diff objects for rendering two separate lines.
 */
function diffPhoneNumbers(original, suggested) {
    // --- 1. Semantic Diff (Digits only) ---
    const normalizedOriginal = normalize(original);
    const normalizedSuggested = normalize(suggested);
    const semanticParts = diffChars(normalizedOriginal, normalizedSuggested);

    // Create a sequential map of digits for the common sequence
    let commonDigits = [];
    semanticParts.forEach(part => {
        if (!part.added && !part.removed) {
            commonDigits.push(...part.value.split(''));
        }
    });

    // --- 2. Visual Diff for Original String (Removals) ---
    let originalDiff = [];
    let commonPointer = 0; // Tracks position in the commonDigits array

    let originalRemainder = original; // We will cut these down to keep track of added/removed separators
    let suggestedRemainder = suggested;

    const actualNumberStartsWithZero = suggested.split(' ')[1]
        ?.startsWith('0')
        ?? false;
    
    const onlyAddingPlus = normalizedOriginal === normalizedSuggested;
    const numericalPrefix = suggested.split(' ')[0].slice(1);

    for (let i = 0; i < original.length; i++) {
        const char = original[i];

        if ( // Special handling of adding a prefix to ensure that leading zero that was removed to add the prefix is marked removed,
            suggestedRemainder[i] === '+'
            && char === '0'
            && !actualNumberStartsWithZero
        ) {
            originalDiff.push({ value: char, removed: true });
            if (commonDigits[commonPointer] === '0') {
                // 0 in original matched with 0 in added prefix
                commonPointer++;
            }

            const spacePosition = suggested.indexOf(' ')
            suggestedRemainder = suggestedRemainder.slice(spacePosition + 1) // Remove the prefix
        } else if (/\d/.test(char)) {
            // It's a digit. Determine if it was removed in the semantic diff.
            if (commonPointer < commonDigits.length && char === commonDigits[commonPointer]) {
                // Digit is part of the common sequence. UNCHANGED.
                originalDiff.push({ value: char, added: false, removed: false });

                // Cut down until we get to a matching character
                while (originalRemainder[0] != suggestedRemainder[0] && suggestedRemainder[0] != commonDigits[commonPointer] && suggestedRemainder != '') {
                    suggestedRemainder = suggestedRemainder.slice(1);
                }
                // Remove the current digit
                suggestedRemainder = suggestedRemainder.slice(1);

                commonPointer++;

            } else {
                // Digit was part of the normalized original string, but NOT in the common sequence. REMOVED.
                originalDiff.push({ value: char, removed: true });
            }
        } else if (char === suggestedRemainder[0]) {
            // Both have another character the same (plus, space or dash), UNCHANGED
            originalDiff.push({ value: char, removed: false, added: false });
            suggestedRemainder = suggestedRemainder.slice(1)
        } else {
            // Non-digit, non-common character, (formatting like ( ), etc.). Mark as removed.
            originalDiff.push({ value: char, removed: true });
        }
        // Remove the current checked char
        originalRemainder = originalRemainder.slice(1);
    }

    // --- 3. Visual Diff for Suggested String (Additions) ---
    let suggestedDiff = [];
    let commonPointerNew = 0; // Separate pointer for suggested string traversal

    let originalRemainderNew = original; // We will cut these down to keep track of added/removed separators
    let suggestedRemainderNew = suggested;

    for (let i = 0; i < suggested.length; i++) {
        const char = suggested[i];

        // Special handling of adding a prefix to ensure that the whole prefix is marked as added,
        // even if it contains the same digit as the first digit of the actual phone number
        if (
            char === '+'
            && !originalRemainderNew.includes('+') // + might exist but not be first character, e.g. 'tel:+...'
            && normalizedOriginal.slice(0,2) != '00' // This gets handled properly by the rest of the logic anyway
            && !onlyAddingPlus // doesn't need special handling
            && normalizedOriginal.slice(0, numericalPrefix.length) !== numericalPrefix // edge case, see "should cope with brackets and zero removed and plus added" test
        ) {
            const prefix = suggested.split(' ')[0]

            for (let j = 0; j < prefix.length; j++) {
                suggestedDiff.push({ value: prefix[j], added: true });
            }
            suggestedDiff.push({ value: ' ', added: true });

            i = suggested.indexOf(' ')

            if (originalRemainderNew[0] === '0' && !actualNumberStartsWithZero) {
                originalRemainderNew = originalRemainderNew.slice(1) // Remove the 0
                if (commonDigits[commonPointerNew] === '0') {
                    // 0 in original matched with 0 in added prefix
                    commonPointerNew++;
                }
            }
            suggestedRemainderNew = suggestedRemainderNew.slice(i + 1) // Remove the prefix
        } else if (/\d/.test(char)) {
            // It's a digit. Check if it's the next digit in the common sequence.
            if (commonPointerNew < commonDigits.length && commonDigits[commonPointerNew] === char) {
                // Digit is part of the common sequence. UNCHANGED.
                suggestedDiff.push({ value: char, removed: false, added: false });

                // Cut down until we get to a matching character
                while (originalRemainderNew[0] != char && originalRemainderNew[0] != commonDigits[commonPointerNew] && originalRemainderNew != '') {
                    originalRemainderNew = originalRemainderNew.slice(1);
                }
                // Remove the current digit
                originalRemainderNew = originalRemainderNew.slice(1);

                commonPointerNew++;

            } else {
                // Digit is NEW (e.g., prefix '32' or a replaced digit). ADDED.
                suggestedDiff.push({ value: char, added: true });
            }
        } else if (char === originalRemainderNew[0]) {
            // Both have another character the same (plus, space or dash), UNCHANGED
            suggestedDiff.push({ value: char, removed: false, added: false });
            originalRemainderNew = originalRemainderNew.slice(1);
        } else {
            // Non-digit, non-common character, happens when characters were removed from the old string
            if (
                originalRemainderNew.includes(char)
                && !(/[-+ \d]/.test(originalRemainderNew[0])) // Check that character is acceptable
            ) {
                while (originalRemainderNew[0] != char && originalRemainderNew[0] != commonDigits[commonPointerNew]) {
                    originalRemainderNew = originalRemainderNew.slice(1);
                }
                if (char === originalRemainderNew[0]) {
                    suggestedDiff.push({ value: char, removed: false, added: false });
                    originalRemainderNew = originalRemainderNew.slice(1);
                } else {
                    suggestedDiff.push({ value: char, added: true });
                }
            } else {
                suggestedDiff.push({ value: char, added: true });
            }
        }
        // Remove the current checked char
        suggestedRemainderNew = suggestedRemainderNew.slice(1)
    }

    return { originalDiff, suggestedDiff };
}

/**
 * Merges consecutive diff parts that have the same status (added/removed).
 * For example, `[{value: '1', removed: true}, {value: '2', removed: true}]`
 * becomes `[{value: '12', removed: true}]`.
 * @param {Array<Object>} diffResult - An array of diff objects from `diffPhoneNumbers`.
 * @returns {Array<Object>} The merged array of diff objects.
 */
function mergeDiffs(diffResult) {
    let mergedDiff = [];
    if (!diffResult[0]) {
        return mergedDiff;
    }
    mergedDiff.push(diffResult[0])
    for (let i = 1; i < diffResult.length; i++) {
        const thisDiff = diffResult[i];
        const lastDiff = mergedDiff.at(-1);
        if (diffResult[i] && thisDiff.added === lastDiff.added && thisDiff.removed === lastDiff.removed) {
            lastDiff.value += thisDiff.value;
        } else {
            mergedDiff.push(thisDiff);
        }
    }
    return mergedDiff;
}

// --- HTML Generation Logic ---

/**
 * Creates an HTML string with diff highlighting for two phone tags.
 * Does not do a full diff, but just considers whether 'contact:' is changing or not 
 * @param {string} oldTag - The old phone tag.
 * @param {string} newTag - The new phone tag.
 * @returns {{oldTagDiff: string, newTagDiff: string}} - An object containing the HTML for both diffs.
 */
function getDiffTagsHtml(oldTag, newTag) {
    // Yes, phone and mobile share an e at the end, but rather show the whole old tag as removed and the new one as added
    if (oldTag.startsWith('contact:') && newTag.startsWith('contact:')) {
        const actualOldTag = oldTag.slice(8);
        const actualNewTag = newTag.slice(8);

        return {
            oldTagDiff: `<span class="diff-unchanged">contact:</span><span class="diff-removed">${actualOldTag}</span>`,
            newTagDiff: `<span class="diff-unchanged">contact:</span><span class="diff-added">${actualNewTag}</span>`
        }
    } else{
        return {
            oldTagDiff: `<span class="diff-removed">${oldTag}</span>`,
            newTagDiff: `<span class="diff-added">${newTag}</span>`
        }
    }
}

/**
 * Creates an HTML string with diff highlighting for two phone number strings, 
 * handling multiple numbers separated by various delimiters.
 * @param {string} oldString - The original phone number string(s).
 * @param {string} newString - The suggested phone number string(s).
 * @returns {{oldDiff: string, newDiff: string}} - An object containing the HTML for both diffs.
 */
function getDiffHtml(oldString, newString) {
    if (!oldString) {
        return { oldDiff: null, newDiff: `<span class="diff-added">${escapeHTML(newString)}</span>` };
    }
    if (!newString) {
        return { oldDiff: `<span class="diff-removed">${escapeHTML(oldString)}</span>`, newDiff: null };
    }
    const oldStringCleaned = replaceInvisibleChars(oldString)
    const newStringCleaned = replaceInvisibleChars(newString)
    // Split and initial filter for both strings
    const oldPartsUnfiltered = oldStringCleaned.split(UNIVERSAL_SPLIT_CAPTURE_REGEX);
    // Filter out falsey values (undefined from capturing groups) and empty strings
    const oldParts = oldPartsUnfiltered.filter(s => s && s.trim().length > 0);

    const newPartsUnfiltered = newStringCleaned.split(NEW_SPLIT_CAPTURE_REGEX);
    const newParts = newPartsUnfiltered.filter(s => s && s.trim().length > 0);

    // Apply consolidation to both old and new parts
    const consolidatedOldParts = consolidatePlusSigns(oldParts);
    const consolidatedNewParts = consolidatePlusSigns(newParts);

    let allOriginalDiff = [];
    let allSuggestedDiff = [];

    // Iterate over the minimum length of the new, consolidated arrays
    const numSegments = Math.min(consolidatedOldParts.length, consolidatedNewParts.length);

    for (let i = 0; i < numSegments; i++) {
        const oldSegment = consolidatedOldParts[i];
        const newSegment = consolidatedNewParts[i];

        // Identify a phone number: MUST contain at least one digit.
        const isPhoneNumber = /\d/.test(oldSegment);

        if (isPhoneNumber) {
            // --- This is a phone number segment ---
            const { originalDiff, suggestedDiff } = diffPhoneNumbers(oldSegment, newSegment);
            allOriginalDiff = [...allOriginalDiff, ...originalDiff];
            allSuggestedDiff = [...allSuggestedDiff, ...suggestedDiff]
        } else {
            // --- This is a separator (e.g., ';', 'or', ',') ---

            // Just do a regular diffChars on the separators
            separatorDiff = diffChars(oldSegment, newSegment);

            for (const part of separatorDiff) {
                if (part.removed) {
                    allOriginalDiff.push({ value: part.value, removed: true });
                } else if (part.added) {
                    allSuggestedDiff.push({ value: part.value, added: true });
                } else {
                    allOriginalDiff.push({ value: part.value, removed: false, added: false });
                    allSuggestedDiff.push({ value: part.value, removed: false, added: false });
                }
            }
        }
    }

    // Append any trailing parts
    const trailingOriginal = consolidatedOldParts.slice(numSegments).join('')
    const trailingSuggested = consolidatedNewParts.slice(numSegments).join('')
    if (trailingOriginal){
        allOriginalDiff.push({ value: trailingOriginal, removed: true, added: false });
    }
    if (trailingSuggested) {
        allSuggestedDiff.push({ value: trailingSuggested, removed: false, added: true });
    }

    const mergedOriginalDiff = mergeDiffs(allOriginalDiff);
    const mergedSuggestedDiff = mergeDiffs(allSuggestedDiff);

    let oldDiffHtml = '';
    let newDiffHtml = '';

    mergedOriginalDiff.forEach((part) => {
        const colorClass = part.removed ? 'diff-removed' : 'diff-unchanged';
        oldDiffHtml += `<span class="${colorClass}">${escapeHTML(part.value)}</span>`;
    });

    mergedSuggestedDiff.forEach((part) => {
        const colorClass = part.added ? 'diff-added' : 'diff-unchanged';
        newDiffHtml += `<span class="${colorClass}">${escapeHTML(part.value)}</span>`;
    });

    return { oldDiff: oldDiffHtml, newDiff: newDiffHtml };
}

module.exports = { normalize, consolidatePlusSigns, replaceInvisibleChars, diffPhoneNumbers, getDiffHtml, mergeDiffs, getDiffTagsHtml };