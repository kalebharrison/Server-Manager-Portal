import assert from 'node:assert/strict';
import {
    preferRegionalResults,
    preferredLanguagesForRegion,
} from '../../lib/portal-request/tmdbDiscover.js';

assert.deepEqual(preferredLanguagesForRegion('US'), ['en']);
assert.deepEqual(preferredLanguagesForRegion('KR'), ['ko', 'en']);

const ranked = preferRegionalResults([
    { id: 1, originalLanguage: 'pt', title: 'Nando' },
    { id: 2, originalLanguage: 'en', title: 'Michael' },
    { id: 3, originalLanguage: 'ko', title: 'Korean Hit' },
    { id: 4, originalLanguage: 'en', title: 'Young Washington' },
], { region: 'US' });

assert.deepEqual(ranked.map((item) => item.id), [2, 4, 1, 3]);

const tvRanked = preferRegionalResults([
    { id: 10, originalLanguage: 'es', originCountry: ['MX'], title: 'Foreign' },
    { id: 11, originalLanguage: 'es', originCountry: ['US'], title: 'US Spanish' },
], { region: 'US' });
assert.equal(tvRanked[0].id, 11);

console.log('preferRegionalResults ok');
