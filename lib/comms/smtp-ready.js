export const isSmtpEnabled = (config = {}) => config?.smtpEnabled !== false;

export const isSmtpConfigured = (config = {}) => !!(
    config?.smtpHost && config?.smtpUser && config?.smtpPass
);

export const isSmtpReady = (config = {}) => isSmtpEnabled(config) && isSmtpConfigured(config);
