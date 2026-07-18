const cloneJson = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
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
            const runtime = normalizeArrConfig(configSecretProtector.unprotectConfig(value));
            decryptedConfig = runtime;
            return cloneJson(runtime);
        }
        return value;
    };

    const saveFile = async (filePath, value) => {
        if (filePath === configPath) {
            const runtime = normalizeArrConfig(value);
            decryptedConfig = cloneJson(runtime);
            return saveJsonFile(filePath, configSecretProtector.protectConfig(runtime));
        }
        return saveJsonFile(filePath, value);
    };

    const secureConfigAtRest = async () => {
        const stored = await loadJsonFile(configPath, {});
        const hadPlaintextSecrets = configSecretProtector.hasPlaintextSecrets(stored);
        const runtimeConfig = normalizeArrConfig(configSecretProtector.unprotectConfig(stored));
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
