import assert from 'node:assert/strict';
import { isAdultMediaItem } from '../../lib/media/mediaFilters.js';

assert.equal(isAdultMediaItem({ adult: true, title: 'Anything' }), true);
assert.equal(isAdultMediaItem({ title: 'Some Softcore Feature' }), true);
assert.equal(isAdultMediaItem({ title: 'An Erotic Thriller' }), true);
assert.equal(isAdultMediaItem({ originalTitle: 'Hentai Collection Vol 1' }), true);
assert.equal(isAdultMediaItem({ title: 'The Matrix', adult: false }), false);
assert.equal(isAdultMediaItem({
    title: 'Unmarked Softcore',
    keywords: [{ id: 155477, name: 'softcore' }],
}), true);

console.log('mediaFilters adult heuristics ok');
