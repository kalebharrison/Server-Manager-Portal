import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const ENVELOPE_PREFIX = 'smp:enc:v1';
const KEY_SALT = Buffer.from('server-manager-portal/config-secrets', 'utf8');
const SECRET_FIELDS = Object.freeze([
    'plexToken',
    'jellyfinApiKey',
    'smtpUser',
    'smtpPass',
    'sonarrApiKey',
    'radarrApiKey',
    'lidarrApiKey',
    'tautulliApiKey',
    'jellystatApiKey',
    'tmdbApiKey',
    'tvdbApiKey',
    'tvdbPin',
    'discordLlmApiKey',
    'discordBraveSearchApiKey',
    'discordTavilyApiKey',
    'discordBotToken',
    'discordWebhookUrl',
    'discordAdminWebhookUrl',
    'portalAgentApiKey',
    'qcQbitPassword',
    'qcSabApiKey',
    'qcIntegrityWebhookPassword',
]);

const isEncryptedValue = (value) => typeof value === 'string' && value.startsWith(`${ENVELOPE_PREFIX}:`);

const deriveKey = (keyMaterial) => Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(keyMaterial, 'utf8'),
    KEY_SALT,
    Buffer.from('aes-256-gcm/v1', 'utf8'),
    32,
));

export const createConfigSecretProtector = (keyMaterial) => {
    if (!keyMaterial || String(keyMaterial).length < 32) {
        throw new Error('Configuration encryption key must be at least 32 characters long.');
    }
    const key = deriveKey(String(keyMaterial));

    const encryptString = (plaintext, context) => {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(Buffer.from(context, 'utf8'));
        const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return [ENVELOPE_PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
    };

    const decryptString = (envelope, context) => {
        if (!isEncryptedValue(envelope)) return envelope;
        const parts = String(envelope).split(':');
        if (parts.length !== 6) throw new Error('Encrypted value has an invalid envelope.');
        try {
            const iv = Buffer.from(parts[3], 'base64url');
            const tag = Buffer.from(parts[4], 'base64url');
            const ciphertext = Buffer.from(parts[5], 'base64url');
            const decipher = createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAAD(Buffer.from(context, 'utf8'));
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        } catch {
            throw new Error('Encrypted configuration could not be authenticated. Check CONFIG_ENCRYPTION_KEY and JWT_SECRET.');
        }
    };

    const protectConfig = (config) => {
        if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
        const protectedConfig = { ...config };
        for (const field of SECRET_FIELDS) {
            const value = protectedConfig[field];
            if (value === undefined || value === null || value === '' || isEncryptedValue(value)) continue;
            protectedConfig[field] = encryptString(value, `config:${field}`);
        }
        if (Array.isArray(protectedConfig.arrInstances)) {
            protectedConfig.arrInstances = protectedConfig.arrInstances.map((instance, index) => {
                const apiKey = instance?.apiKey;
                if (!apiKey || isEncryptedValue(apiKey)) return { ...instance };
                const id = String(instance.id || index);
                return { ...instance, apiKey: encryptString(apiKey, `config:arrInstances:${id}:apiKey`) };
            });
        }
        return protectedConfig;
    };

    const unprotectConfig = (config) => {
        if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
        const unprotectedConfig = { ...config };
        for (const field of SECRET_FIELDS) {
            if (isEncryptedValue(unprotectedConfig[field])) {
                unprotectedConfig[field] = decryptString(unprotectedConfig[field], `config:${field}`);
            }
        }
        if (Array.isArray(unprotectedConfig.arrInstances)) {
            unprotectedConfig.arrInstances = unprotectedConfig.arrInstances.map((instance, index) => {
                if (!isEncryptedValue(instance?.apiKey)) return { ...instance };
                const id = String(instance.id || index);
                return { ...instance, apiKey: decryptString(instance.apiKey, `config:arrInstances:${id}:apiKey`) };
            });
        }
        return unprotectedConfig;
    };

    const sealBackup = (backup) => ({
        schemaVersion: backup.schemaVersion,
        encrypted: true,
        createdAt: backup.createdAt,
        payload: encryptString(JSON.stringify(backup), 'backup:payload'),
    });

    const openBackup = (backup) => {
        if (!backup?.encrypted) return backup;
        if (!isEncryptedValue(backup.payload)) throw new Error('Encrypted backup payload is invalid.');
        try {
            return JSON.parse(decryptString(backup.payload, 'backup:payload'));
        } catch (error) {
            if (error instanceof SyntaxError) throw new Error('Decrypted backup payload is not valid JSON.');
            throw error;
        }
    };

    const hasPlaintextSecrets = (config) => SECRET_FIELDS.some((field) => {
        const value = config?.[field];
        return value !== undefined && value !== null && value !== '' && !isEncryptedValue(value);
    }) || (config?.arrInstances || []).some((instance) => instance?.apiKey && !isEncryptedValue(instance.apiKey));

    return { hasPlaintextSecrets, isEncryptedValue, openBackup, protectConfig, sealBackup, unprotectConfig };
};

export { SECRET_FIELDS };
