export const INBOUND_EMAIL_WEBHOOK_PATH = '/api/webhooks/inbound-email';
export const INBOUND_EMAIL_WEBHOOK_LEGACY_PATH = '/api/webhooks/mailjet-inbound';
export const INBOUND_EMAIL_WEBHOOK_PATHS = [
    INBOUND_EMAIL_WEBHOOK_PATH,
    INBOUND_EMAIL_WEBHOOK_LEGACY_PATH,
];

export const isInboundEmailWebhookPath = (url = '') => {
    const path = String(url || '').split('?')[0];
    return INBOUND_EMAIL_WEBHOOK_PATHS.some((suffix) => path.endsWith(suffix));
};

export const buildInboundEmailWebhookUrl = (publicDomain = '') => {
    const base = String(publicDomain || '').trim().replace(/\/+$/, '');
    return base ? `${base}${INBOUND_EMAIL_WEBHOOK_PATH}` : INBOUND_EMAIL_WEBHOOK_PATH;
};
