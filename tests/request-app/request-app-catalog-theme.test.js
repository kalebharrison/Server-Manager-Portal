import assert from 'node:assert/strict';
import test from 'node:test';

import {
    filterRecentItems,
    minRecentReleaseYear,
    normalizeThemeQuery,
    pickBestKeywordMatch,
    resolveThemeGenreId,
} from '../../lib/request-app/request-app-catalog-theme.js';
import { sortFilmographyByDate } from '../../lib/request-app/request-app-catalog-person.js';

test('normalizeThemeQuery strips media and filler words', () => {
    assert.equal(normalizeThemeQuery('the zombie movie'), 'zombie');
    assert.equal(normalizeThemeQuery('about space travel'), 'space travel');
});

test('resolveThemeGenreId maps common genre themes', () => {
    assert.equal(resolveThemeGenreId('comedy'), 35);
    assert.equal(resolveThemeGenreId('sci-fi'), 878);
    assert.equal(resolveThemeGenreId('zombie'), null);
});

test('pickBestKeywordMatch prefers exact keyword names', () => {
    const keywords = [
        { id: 1, name: 'zombie apocalypse' },
        { id: 2, name: 'zombie' },
    ];
    assert.equal(pickBestKeywordMatch(keywords, 'zombie').id, 2);
});

test('filterRecentItems keeps titles from recent years', () => {
    const items = [
        { title: 'Old', releaseDate: '2008-01-01' },
        { title: 'New', releaseDate: '2024-01-01' },
    ];
    const filtered = filterRecentItems(items, minRecentReleaseYear(true, new Date('2026-07-25T00:00:00.000Z')));
    assert.deepEqual(filtered.map((item) => item.title), ['New']);
});

test('sortFilmographyByDate orders themed discover fallback results', () => {
    const items = [
        { title: 'Night', releaseDate: '2008-06-01' },
        { title: 'Army', releaseDate: '2022-12-01' },
    ];
    assert.equal(sortFilmographyByDate(items)[0].title, 'Army');
});
