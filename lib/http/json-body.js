import express from 'express';

export const INBOUND_EMAIL_WEBHOOK_SUFFIX = '/api/webhooks/mailjet-inbound';

export const createSelectiveJsonParser = ({
    defaultLimit = '50kb',
    inboundLimit = '2mb',
    inboundSuffix = INBOUND_EMAIL_WEBHOOK_SUFFIX,
} = {}) => {
    const defaultJson = express.json({ limit: defaultLimit });
    const inboundJson = express.json({ limit: inboundLimit });
    return (req, res, next) => {
        const path = String(req.originalUrl || req.url || '').split('?')[0];
        if (path.endsWith(inboundSuffix)) return inboundJson(req, res, next);
        return defaultJson(req, res, next);
    };
};
