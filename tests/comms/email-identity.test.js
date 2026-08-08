import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPortalMediaUrl,
    emailSubject,
    inferServerNameFromFromHeader,
    looksLikeMachineId,
    resolveEmailServerName,
} from '../../lib/comms/email-identity.js';

test('machine ids are not used as server names', () => {
    assert.equal(looksLikeMachineId('ABFAADCCEEA3EA4383616E4A3DCDEE88A1086E2F'), true);
    assert.equal(looksLikeMachineId('LostWaldo'), false);
    assert.equal(
        resolveEmailServerName({
            serverIdentifier: 'ABFAADCCEEA3EA4383616E4A3DCDEE88A1086E2F',
            smtpFrom: 'Requests - LostWaldo <requests@lostwaldo.net>',
        }),
        'LostWaldo',
    );
    assert.equal(inferServerNameFromFromHeader('Requests - LostWaldo <requests@lostwaldo.net>'), 'LostWaldo');
});

test('portal media urls stay on publicDomain discovery paths', () => {
    const url = buildPortalMediaUrl({ publicDomain: 'https://plex-beta.lostwaldo.net' }, {
        mediaType: 'tv',
        tmdbId: 95396,
    });
    assert.equal(url, 'https://plex-beta.lostwaldo.net/discovery/tv/95396');
    assert.equal(emailSubject({ smtpFrom: 'LostWaldo <a@b.c>' }, 'Now available: Severance'), '[LostWaldo] Now available: Severance');
});
