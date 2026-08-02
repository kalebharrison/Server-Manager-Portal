import test from 'node:test';
import assert from 'node:assert/strict';
import { createQbitClient } from '../../lib/upgrader/download-clients/qbittorrent.js';
import { createSabClient } from '../../lib/upgrader/download-clients/sabnzbd.js';

test('qBit network health treats disconnected and dead DHT as down', async () => {
    const disconnected = createQbitClient({
        fetchWithTimeout: async (url) => {
            if (String(url).includes('/auth/login')) {
                return {
                    ok: true,
                    headers: { get: () => 'SID=abc' },
                    text: async () => 'Ok.',
                };
            }
            return {
                ok: true,
                headers: { get: () => null },
                json: async () => ({ connection_status: 'disconnected', dht_nodes: 12 }),
            };
        },
    });
    const down = await disconnected.getNetworkHealth(
        { qcQbitUrl: 'http://qbit:8080', qcQbitUsername: 'u', qcQbitPassword: 'p' },
        { incompleteCount: 1 },
    );
    assert.equal(down.ok, false);
    assert.equal(down.reason, 'disconnected');

    const dhtDead = createQbitClient({
        fetchWithTimeout: async (url) => {
            if (String(url).includes('/auth/login')) {
                return {
                    ok: true,
                    headers: { get: () => 'SID=abc' },
                    text: async () => 'Ok.',
                };
            }
            return {
                ok: true,
                headers: { get: () => null },
                json: async () => ({ connection_status: 'firewalled', dht_nodes: 0 }),
            };
        },
    });
    const dead = await dhtDead.getNetworkHealth(
        { qcQbitUrl: 'http://qbit:8080', qcQbitUsername: 'u', qcQbitPassword: 'p' },
        { incompleteCount: 2 },
    );
    assert.equal(dead.ok, false);
    assert.equal(dead.reason, 'dht_dead');

    const okClient = createQbitClient({
        fetchWithTimeout: async (url) => {
            if (String(url).includes('/auth/login')) {
                return {
                    ok: true,
                    headers: { get: () => 'SID=abc' },
                    text: async () => 'Ok.',
                };
            }
            return {
                ok: true,
                headers: { get: () => null },
                json: async () => ({ connection_status: 'firewalled', dht_nodes: 55 }),
            };
        },
    });
    const up = await okClient.getNetworkHealth(
        { qcQbitUrl: 'http://qbit:8080', qcQbitUsername: 'u', qcQbitPassword: 'p' },
        { incompleteCount: 2 },
    );
    assert.equal(up.ok, true);
});

test('SAB network health treats DNS and server errors as down', async () => {
    const sabDns = createSabClient({
        fetchWithTimeout: async () => ({
            ok: true,
            json: async () => ({ status: { dnslookup: 'Failed', publicipv4: '', servers: [] } }),
        }),
    });
    const dns = await sabDns.getNetworkHealth({ qcSabUrl: 'http://sab:8080', qcSabApiKey: 'k' });
    assert.equal(dns.ok, false);
    assert.equal(dns.reason, 'dns_failed');

    const sabServers = createSabClient({
        fetchWithTimeout: async () => ({
            ok: true,
            json: async () => ({
                status: {
                    dnslookup: 'OK',
                    publicipv4: '1.2.3.4',
                    servers: [
                        { serveractive: true, servererror: 'Connection failed' },
                        { serveractive: true, servererror: 'Timeout' },
                    ],
                },
            }),
        }),
    });
    const servers = await sabServers.getNetworkHealth({ qcSabUrl: 'http://sab:8080', qcSabApiKey: 'k' });
    assert.equal(servers.ok, false);
    assert.equal(servers.reason, 'servers_error');

    const sabOk = createSabClient({
        fetchWithTimeout: async () => ({
            ok: true,
            json: async () => ({
                status: {
                    dnslookup: 'OK',
                    publicipv4: '1.2.3.4',
                    servers: [{ serveractive: true, servererror: '' }],
                },
            }),
        }),
    });
    const up = await sabOk.getNetworkHealth({ qcSabUrl: 'http://sab:8080', qcSabApiKey: 'k' });
    assert.equal(up.ok, true);
});
