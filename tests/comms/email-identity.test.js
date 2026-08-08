import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPortalMediaUrl,
    emailNoticeSubject,
    emailSubject,
    inferServerNameFromFromHeader,
    looksLikeMachineId,
    resolveEmailPosterUrl,
    resolveEmailServerName,
    toEmailTitleCase,
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
    assert.equal(
        emailNoticeSubject({ smtpFrom: 'LostWaldo <a@b.c>' }, 'Now available', 'Severance'),
        '[LostWaldo] Now Available: Severance',
    );
});

test('canned email labels use title case without rewriting media titles', () => {
    assert.equal(toEmailTitleCase('Request approved'), 'Request Approved');
    assert.equal(toEmailTitleCase("What's new"), "What's New");
    assert.equal(toEmailTitleCase('SMTP test successful'), 'SMTP Test Successful');
    assert.equal(toEmailTitleCase('Your shared access expires in 7 days'), 'Your Shared Access Expires in 7 Days');
    assert.equal(
        resolveEmailPosterUrl({}, '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg'),
        'https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    );
    assert.equal(resolveEmailPosterUrl({}, '/library/metadata/1/thumb'), '');
});
