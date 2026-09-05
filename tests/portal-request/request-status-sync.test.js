import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { syncPortalRequestStatuses } from '../../lib/portal-request/requestStatusSync.js';

describe('requestStatusSync', () => {
    it('skips requests that are already available and idle', async () => {
        const store = {
            list: async () => ([{
                id: '1',
                status: 2,
                mediaType: 'movie',
                tmdbId: 1,
                meta: { mediaStatus: 5, isDownloading: false },
            }]),
            update: async () => {
                throw new Error('should not update');
            },
        };
        const summary = await syncPortalRequestStatuses({ config: {}, store });
        assert.equal(summary.scanned, 1);
        assert.equal(summary.checked, 0);
    });

    it('counts downloading approved requests as sync targets', async () => {
        const store = {
            list: async () => ([{
                id: '3639',
                status: 2,
                mediaType: 'movie',
                tmdbId: 1205515,
                meta: { mediaStatus: 3, isDownloading: true },
            }]),
            update: async () => ({ id: '3639' }),
        };
        // No Arr credentials → getMediaStatus fails or returns unknown; either way we exercise the path.
        const summary = await syncPortalRequestStatuses({
            config: {},
            store,
            forceRefresh: true,
            fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
        });
        assert.equal(summary.checked, 1);
    });
});
