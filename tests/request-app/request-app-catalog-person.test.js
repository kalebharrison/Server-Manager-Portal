import assert from 'node:assert/strict';
import test from 'node:test';

import {
    dedupeFilmographyCredits,
    sortFilmographyByDate,
} from '../../lib/request-app/request-app-catalog-person.js';

test('dedupeFilmographyCredits keeps one entry per media type and id', () => {
    const credits = [
        { id: 1, media_type: 'movie', title: 'Alpha' },
        { id: 1, media_type: 'movie', title: 'Alpha duplicate' },
        { id: 2, media_type: 'tv', name: 'Beta' },
        { id: 3, media_type: 'person', name: 'Skip me' },
    ];
    const deduped = dedupeFilmographyCredits(credits);
    assert.equal(deduped.length, 2);
    assert.equal(deduped[0].id, 1);
    assert.equal(deduped[1].id, 2);
});

test('sortFilmographyByDate orders newest release first', () => {
    const items = [
        { title: 'Old', releaseDate: '2001-01-01' },
        { title: 'New', releaseDate: '2024-06-01' },
        { title: 'Mid', firstAirDate: '2015-03-01' },
    ];
    const sorted = sortFilmographyByDate(items);
    assert.deepEqual(sorted.map((item) => item.title), ['New', 'Mid', 'Old']);
});
