const cloneJson = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

/**
 * One-shot migration of the retired Scanner basic-auth fields into the dedicated
 * Integrity webhook auth fields, dropping the legacy `scanner` block once handled.
 */
const migrateRetiredScannerAuth = (config) => {
    const scanner = config?.scanner;
    if (!scanner || typeof scanner !== 'object') return { config, migrated: false };
    const next = { ...config };
    if (!next.qcIntegrityWebhookUsername && scanner.authUsername) {
        next.qcIntegrityWebhookUsername = String(scanner.authUsername || '').trim();
    }
    if (!next.qcIntegrityWebhookPassword && scanner.authPassword) {
        next.qcIntegrityWebhookPassword = String(scanner.authPassword || '');
    }
    delete next.scanner;
    return { config: next, migrated: true };
};

/**
 * File access with encrypted-at-rest config and a decrypted in-memory cache.
 * Hot paths that call loadFile(CONFIG_PATH) repeatedly avoid re-unprotecting secrets.
 */
export const createConfigFileAccess = ({
    configPath,
    loadJsonFile,
    saveJsonFile,
    configSecretProtector,
    normalizeArrConfig,
}) => {
    let decryptedConfig = null;

    const invalidateDecryptedConfig = () => {
        decryptedConfig = null;
    };

    const loadFile = async (filePath, defaultContent) => {
        if (filePath === configPath && decryptedConfig) {
            return cloneJson(decryptedConfig);
        }
        const value = await loadJsonFile(filePath, defaultContent);
        if (filePath === configPath) {
            const { config: migrated, migrated: didMigrate } = migrateRetiredScannerAuth(
                configSecretProtector.unprotectConfig(value),
            );
            const runtime = normalizeArrConfig(migrated);
            decryptedConfig = runtime;
            if (didMigrate) {
                // Fire-and-forget persist so the one-shot migration sticks without blocking the read.
                saveJsonFile(filePath, configSecretProtector.protectConfig(runtime)).catch(() => {});
            }
            return cloneJson(runtime);
        }
        return value;
    };

    const saveFile = async (filePath, value) => {
        if (filePath === configPath) {
            const { config: migrated } = migrateRetiredScannerAuth(value);
            const runtime = normalizeArrConfig(migrated);
            decryptedConfig = cloneJson(runtime);
            return saveJsonFile(filePath, configSecretProtector.protectConfig(runtime));
        }
        return saveJsonFile(filePath, value);
    };

    const secureConfigAtRest = async () => {
        const stored = await loadJsonFile(configPath, {});
        const hadPlaintextSecrets = configSecretProtector.hasPlaintextSecrets(stored);
        const { config: migrated } = migrateRetiredScannerAuth(configSecretProtector.unprotectConfig(stored));
        const runtimeConfig = normalizeArrConfig(migrated);
        await saveJsonFile(configPath, configSecretProtector.protectConfig(runtimeConfig));
        decryptedConfig = cloneJson(runtimeConfig);
        return hadPlaintextSecrets;
    };

    return {
        loadFile,
        saveFile,
        secureConfigAtRest,
        invalidateDecryptedConfig,
    };
};
