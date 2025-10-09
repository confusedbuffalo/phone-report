/**
 * Escapes special HTML characters in a string.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHTML(str) {
    if (!str) {
        return '';
    }
    return str.replace(/[&<>"']/g, (match) => {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return match;
        }
    });
}

const listContainer = document.getElementById('division-list');
const sortButtons = document.querySelectorAll('.sort-btn');
const hideEmptyCheckbox = document.getElementById('hide-empty');
let currentSort = 'percentage';

/**
 * Formats a number using the current locale for consistent display.
 * @param {number} num - The number to format.
 * @returns {string} The locale-formatted number string.
 */
function formatNumber(num) {
    return num.toLocaleString(locale, { 
        useGrouping: true, 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    });
}

const calculatedDivisionTotals = {};
for (const divisionName in groupedDivisionStats) {
    let groupInvalid = 0;
    let groupTotal = 0;
    let groupFixable = 0;
    groupedDivisionStats[divisionName].forEach(stat => {
        groupInvalid += stat.invalidCount;
        groupTotal += stat.totalNumbers;
        groupFixable += stat.autoFixableCount;
    });
    calculatedDivisionTotals[divisionName] = {
        invalid: groupInvalid,
        total: groupTotal,
        fixable: groupFixable
    };
}

/**
 * Updates the visual styles of the sort buttons to indicate which one is active.
 */
function updateButtonStyles() {
    const isDark = document.documentElement.classList.contains('dark');
    sortButtons.forEach(button => {
        const isActive = button.dataset.sort === currentSort;
        button.classList.toggle('sort-btn-style-active', isActive);
        button.classList.toggle('sort-btn-style-inactive', !isActive);
    });
}

/**
 * Creates and returns an SVG element for the collapsible section icon (a right-pointing arrow).
 * @returns {SVGElement} The SVG element for the icon.
 */
function createCollapseIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'collapse-icon');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('viewBox', '0 0 20 20');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('d', 'M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z');
    path.setAttribute('clip-rule', 'evenodd');
    svg.appendChild(path);
    return svg;
}

/**
 * Renders the list of divisions and subdivisions based on the current sort order
 * and filter settings. It handles both grouped and flat list layouts.
 */
function renderList() {
    const TARGET_LI_CLASS = 'list-item';

    let divisionNames = Object.keys(groupedDivisionStats);

    // Sort the division groups themselves based on the current sort order
    divisionNames.sort((a, b) => {
        if (currentSort === 'percentage') {
            const statsA = calculatedDivisionTotals[a];
            const statsB = calculatedDivisionTotals[b];
            const percentageA = statsA.total > 0 ? (statsA.invalid / statsA.total) : 0;
            const percentageB = statsB.total > 0 ? (statsB.invalid / statsB.total) : 0;
            return percentageB - percentageA;
        } else if (currentSort === 'invalidCount') {
            return calculatedDivisionTotals[b].invalid - calculatedDivisionTotals[a].invalid;
        } else if (currentSort === 'name') {
            return a.localeCompare(b);
        }
        return 0;
    });
    const isGrouped = divisionNames.length > 1;

    const percentageOptions = {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    };

    // Capture current open state
    const currentlyOpenDivisions = new Set();
    listContainer.querySelectorAll('details').forEach(details => {
        if (details.open) {
            const divisionHeader = details.querySelector('h3');
            if (divisionHeader) {
                currentlyOpenDivisions.add(divisionHeader.textContent.trim());
            }
        }
    });

    listContainer.innerHTML = '';

    for (const divisionName of divisionNames) {
        let sortedData = [...groupedDivisionStats[divisionName]];

        if (hideEmptyCheckbox.checked) {
            sortedData = sortedData.filter(subdivision => subdivision.invalidCount > 0);
        }

        if (sortedData.length > 0) {

            // --- Group Stats Calculation ---
            const groupStats = calculatedDivisionTotals[divisionName];
            const groupInvalidFormatted = formatNumber(groupStats.invalid);
            const groupTotalFormatted = formatNumber(groupStats.total);
            const groupFixableFormatted = formatNumber(groupStats.fixable); 

            const groupPercentageNumber = groupStats.total > 0 ? (groupStats.invalid / groupStats.total) * 100 : 0;
            const formattedGroupPercentage = groupPercentageNumber.toLocaleString(locale, percentageOptions);
            
            // Client-side substitution using the embedded template literal
            const groupStatsLine = T_CLIENT.invalidNumbersOutOf
                .replace('%i', groupInvalidFormatted)
                .replace('%f', groupFixableFormatted)
                .replace('%t', groupTotalFormatted);

            // --- End Group Stats Calculation ---

            sortedData.sort((a, b) => {
                if (currentSort === 'percentage') {
                    const percentageA = a.totalNumbers > 0 ? (a.invalidCount / a.totalNumbers) : 0;
                    const percentageB = b.totalNumbers > 0 ? (b.invalidCount / b.totalNumbers) : 0;
                    return percentageB - percentageA;
                } else if (currentSort === 'invalidCount') {
                    return b.invalidCount - a.invalidCount;
                } else if (currentSort === 'name') {
                    return a.name.localeCompare(b.name);
                }
            });

            let ul;

            if (isGrouped) {
                // --- RENDER GROUPED ---
                let detailsGroup = document.createElement('details'); 
                detailsGroup.className = 'details-group group';

                // Restore open state after sort
                if (currentlyOpenDivisions.has(divisionName)) {
                    detailsGroup.open = true;
                }

                const summaryHeader = document.createElement('summary');
                summaryHeader.className = 'summary-header group/summary';

                const summaryContent = document.createElement('div');
                summaryContent.className = 'summary-content';

                const leftSide = document.createElement('div');
                leftSide.className = 'summary-left-side';

                const iconCircle = document.createElement('div'); 
                iconCircle.className = 'summary-icon color-indicator';
                iconCircle.setAttribute('data-percentage', groupPercentageNumber);

                const collapseIcon = createCollapseIcon();
                iconCircle.appendChild(collapseIcon); 

                const divisionNameContainer = document.createElement('div');
                divisionNameContainer.className = 'list-item-content';

                const divisionHeader = document.createElement('h3');
                divisionHeader.className = 'summary-title';
                divisionHeader.innerHTML = escapeHTML(divisionName);

                const statsLine = document.createElement('p');
                statsLine.className = 'summary-stats';
                statsLine.textContent = groupStatsLine;

                divisionNameContainer.appendChild(divisionHeader);
                divisionNameContainer.appendChild(statsLine);

                leftSide.appendChild(iconCircle); 
                leftSide.appendChild(divisionNameContainer);

                const rightSide = document.createElement('div');
                rightSide.className = 'summary-right-side';

                const percentageText = document.createElement('p');
                percentageText.className = 'summary-percentage';
                percentageText.innerHTML = `${formattedGroupPercentage}<span class="country-percentage-symbol">%</span>`;

                const percentageLabel = document.createElement('p');
                percentageLabel.className = 'summary-percentage-label';
                percentageLabel.textContent = T_CLIENT.invalid; 

                rightSide.appendChild(percentageText);
                rightSide.appendChild(percentageLabel);

                summaryContent.appendChild(leftSide);
                summaryContent.appendChild(rightSide);

                summaryHeader.appendChild(summaryContent);

                detailsGroup.appendChild(summaryHeader);

                ul = document.createElement('ul'); 
                ul.className = 'details-content';

                detailsGroup.appendChild(ul);
                listContainer.appendChild(detailsGroup);

            } else {
                // --- RENDER FLAT LIST ---
                ul = listContainer; 
            }

            // --- LIST ITEM RENDERING (Common Logic) ---
            sortedData.forEach(subdivision => {
                const subdivisionSlug = subdivision.slug;
                const percentage = subdivision.totalNumbers > 0 ? (subdivision.invalidCount / subdivision.totalNumbers) * 100 : 0;
                const invalidPercentage = Math.max(0, Math.min(100, percentage));

                const formattedInvalidCount = formatNumber(subdivision.invalidCount);
                const formattedFixableCount = formatNumber(subdivision.autoFixableCount);
                const formattedTotalCount = formatNumber(subdivision.totalNumbers);

                const percentageNumber = subdivision.totalNumbers > 0 ? (subdivision.invalidCount / subdivision.totalNumbers) * 100 : 0;
                const formattedPercentage = percentageNumber.toLocaleString(locale, percentageOptions);
                
                // Client-side substitution using the embedded template literal
                const itemStatsLine = T_CLIENT.invalidNumbersOutOf
                    .replace('%i', formattedInvalidCount)
                    .replace('%f', formattedFixableCount)
                    .replace('%t', formattedTotalCount);


                const li = document.createElement('li');
                li.className = 'subdivision-list-item';

                li.innerHTML = `
                    <a href="${subdivision.divisionSlug}/${subdivisionSlug}.html">
                        <div class="subdivision-link-content">
                            <div class="list-item-main-container">
                                <div class="color-indicator" data-percentage="${invalidPercentage}"></div>
                                <div class="subdivision-item-container">
                                    <h3 class="list-item-sub-title">${escapeHTML(subdivision.name)}</h3>
                                    <p class="country-description">${itemStatsLine}</p>
                                </div>
                            </div>
                            <div class="summary-right-side">
                                <p class="summary-percentage">${formattedPercentage}<span class="country-percentage-symbol">%</span></p>
                                <p class="summary-percentage-label">${T_CLIENT.invalid}</p>
                            </div>
                        </div>
                    </a>
                `;
                ul.appendChild(li);
            });
            // --- END LIST ITEM RENDERING ---
        }
    }

    if (listContainer.querySelectorAll('li').length === 0) {
        listContainer.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'no-subdivisions-item';
        li.textContent = T_CLIENT.noSubdivisionsFound;
        listContainer.appendChild(li);
    }
    updateButtonStyles();
    applyColors();
}

sortButtons.forEach(button => {
    button.addEventListener('click', () => {
        currentSort = button.dataset.sort;
        renderList();
    });
});

hideEmptyCheckbox.addEventListener('change', renderList);

renderList();