import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { InviteClaimError, recordInviteClaim } from '../../lib/users/invite-routes.js';
import { loadFile, saveFile, updateFile } from '../../lib/core/json-file-store.js';

const delay = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

const createTempFile = async (t, name) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-json-store-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return path.join(directory, name);
};

test('updateFile holds one path lock across asynchronous mutation and write', async (t) => {
    const file = await createTempFile(t, 'counter.json');
    await saveFile(file, { count: 0 });
    let activeMutations = 0;
    let maxActiveMutations = 0;

    const increment = () => updateFile(file, { count: 0 }, async (value) => {
        activeMutations += 1;
        maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
        const count = value.count;
        await delay(20);
        value.count = count + 1;
        activeMutations -= 1;
        return value;
    });

    await Promise.all([increment(), increment()]);

    assert.equal(maxActiveMutations, 1);
    assert.deepEqual(await loadFile(file, {}), { count: 2 });
});

test('concurrent transactions record only one claim for a one-use invite', async (t) => {
    const file = await createTempFile(t, 'invites.json');
    await saveFile(file, [{
        code: 'single-use',
        durationDays: 30,
        maxUses: 1,
        currentUses: 0,
        libraryIds: null,
        createdBy: 'admin',
        createdAt: '2026-07-12T00:00:00.000Z'
    }]);

    const claim = (username) => updateFile(file, [], async (invites) => {
        await delay(10);
        recordInviteClaim(invites, 'single-use', {
            username,
            email: `${username}@example.com`
        }, `2026-07-12T00:00:0${username === 'first' ? '1' : '2'}.000Z`);
        return invites;
    });

    const results = await Promise.allSettled([claim('first'), claim('second')]);
    const invites = await loadFile(file, []);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.ok(rejected.reason instanceof InviteClaimError);
    assert.equal(rejected.reason.statusCode, 400);
    assert.equal(invites[0].currentUses, 1);
    assert.equal(invites[0].usedBy.length, 1);
    assert.equal(invites[0].usedBy[0].username, 'first');
});
