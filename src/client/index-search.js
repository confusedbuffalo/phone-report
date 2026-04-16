function getAutocompleteResults(query) {
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    return searchIndex
        .filter(item => item.name.toLowerCase().includes(lowerQuery))
        .sort((a, b) => {
            // Priority: items starting with the query appear first
            const aStart = a.name.toLowerCase().startsWith(lowerQuery);
            const bStart = b.name.toLowerCase().startsWith(lowerQuery);
            if (aStart && !bStart) return -1;
            if (!aStart && bStart) return 1;
            return a.name.localeCompare(b.name);
        })
        .slice(0, 10); // Return top 10 matches
}

const searchInput = document.getElementById('region-search');
const resultsContainer = document.getElementById('autocomplete-results');

searchInput.addEventListener('input', function () {
    const query = this.value.toLowerCase();
    resultsContainer.innerHTML = ''; // Clear previous results

    if (!query) return;

    // Filter index for matches
    const matches = getAutocompleteResults(query);

    matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.innerHTML = `
            <span class="match-name">${match.name}</span>
            <span class="match-type">${match.type} ${match.parent ? `(${match.parent})` : ''}</span>
        `;
        div.addEventListener('click', () => {
            window.location.href = match.url;
        });
        resultsContainer.appendChild(div);
    });
});

// Close list if clicking outside
document.addEventListener('click', (e) => {
    if (e.target !== searchInput) resultsContainer.innerHTML = '';
});
