let activeIndex = -1;
let currentMatches = [];

function getAutocompleteResults(query) {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return searchIndex
        .filter(item => item.name.toLowerCase().includes(lowerQuery))
        .sort((a, b) => {
            const aStart = a.name.toLowerCase().startsWith(lowerQuery);
            const bStart = b.name.toLowerCase().startsWith(lowerQuery);
            if (aStart && !bStart) return -1;
            if (!aStart && bStart) return 1;
            return a.name.localeCompare(b.name);
        })
        .slice(0, 10);
}

const searchInput = document.getElementById('region-search');
const resultsContainer = document.getElementById('autocomplete-results');

function updateSelection() {
    const items = resultsContainer.querySelectorAll('.autocomplete-row');
    items.forEach((item, index) => {
        if (index === activeIndex) {
            item.classList.add('autocomplete-row-selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('autocomplete-row-selected');
        }
    });
}

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    activeIndex = -1; // Reset selection on new input
    
    if (!query) {
        resultsContainer.classList.add('hidden');
        currentMatches = [];
        return;
    }

    currentMatches = getAutocompleteResults(query);

    if (currentMatches.length > 0) {
        resultsContainer.innerHTML = currentMatches.map((match, index) => `
            <div class="autocomplete-row" data-index="${index}" onclick="window.location.href='${match.url}'">
                <span class="autocomplete-name">${match.name}</span>
                ${match.parent ? `<span class="autocomplete-meta">${match.parent}</span>` : ''}
            </div>
        `).join('');
        resultsContainer.classList.remove('hidden');
    } else {
        resultsContainer.classList.add('hidden');
    }
});

searchInput.addEventListener('keydown', (e) => {
    const items = resultsContainer.querySelectorAll('.autocomplete-row');
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        updateSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        updateSelection();
    } else if (e.key === 'Enter') {
        if (activeIndex > -1 && currentMatches[activeIndex]) {
            e.preventDefault();
            window.location.href = currentMatches[activeIndex].url;
        }
    } else if (e.key === 'Escape') {
        resultsContainer.classList.add('hidden');
        activeIndex = -1;
    }
});

document.addEventListener('click', (e) => {
    if (e.target !== searchInput) resultsContainer.classList.add('hidden');
});
