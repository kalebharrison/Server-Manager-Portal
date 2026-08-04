import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const SAMPLE_BYTES = 16 * 1024;
let xxhashApiPromise = null;

const loadXxhash = async () => {
    if (!xxhashApiPromise) {
        xxhashApiPromise = import('xxhash-wasm').then((mod) => mod.default()).catch((error) => {
            xxhashApiPromise = null;
            throw error;
        });
    }
    return xxhashApiPromise;
};

const readSlice = async (fd, position, length) => {
    const buf = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
        // eslint-disable-next-line no-await-in-loop
        const { bytesRead } = await fd.read(buf, offset, length - offset, position + offset);
        if (bytesRead <= 0) break;
        offset += bytesRead;
    }
    return offset === length ? buf : buf.subarray(0, offset);
};

/**
 * Checkrr-style sample fingerprint: size + 16KB from start/mid/end, hashed with sha256.
 * Prefix `imo:` so callers can tell sample hashes from full-file digests.
 */
export const computeImohash = async (filePath, { size = null, openImpl = null } = {}) => {
    const open = openImpl || ((path, flags) => fsp.open(path, flags));
    const fd = await open(filePath, 'r');
    try {
        const stSize = Number.isFinite(Number(size)) && Number(size) >= 0
            ? Number(size)
            : Number((await fd.stat()).size) || 0;
        const hash = crypto.createHash('sha256');
        hash.update(`size:${stSize}\n`);

        if (stSize <= 0) {
            return { ok: true, imohash: `imo:${hash.digest('hex')}`, size: stSize };
        }

        const sample = Math.min(SAMPLE_BYTES, stSize);
        const positions = stSize <= sample
            ? [0]
            : [
                0,
                Math.max(0, Math.floor(stSize / 2) - Math.floor(sample / 2)),
                Math.max(0, stSize - sample),
            ];

        for (const position of positions) {
            // eslint-disable-next-line no-await-in-loop
            const chunk = await readSlice(fd, position, sample);
            hash.update(`@${position}:`);
            hash.update(chunk);
        }

        return { ok: true, imohash: `imo:${hash.digest('hex')}`, size: stSize };
    } catch (error) {
        return { ok: false, reason: 'imohash_failed', detail: error.message };
    } finally {
        await fd.close().catch(() => {});
    }
};

/**
 * Full-file xxhash64 streaming hash. Returns hex string prefixed with `xx:`.
 */
export const computeXxhash64 = async (filePath, {
    createReadStreamImpl = null,
    xxhashFactory = null,
} = {}) => {
    try {
        const api = xxhashFactory
            ? await xxhashFactory()
            : await loadXxhash();
        const hasher = api.create64();
        const stream = createReadStreamImpl
            ? createReadStreamImpl(filePath)
            : fs.createReadStream(filePath);

        await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
                hasher.update(chunk);
            });
            stream.on('error', reject);
            stream.on('end', resolve);
        });

        const digest = hasher.digest();
        const hex = typeof digest === 'bigint'
            ? digest.toString(16).padStart(16, '0')
            : Buffer.from(digest).toString('hex');
        return { ok: true, xxhash: `xx:${hex}` };
    } catch (error) {
        return { ok: false, reason: 'xxhash_failed', detail: error.message };
    }
};

export const INTEGRITY_SAMPLE_BYTES = SAMPLE_BYTES;
