import nodemailer from 'nodemailer';

export const sanitizeBroadcastHtml = (html) => {
    if (!html || typeof html !== 'string') return '';
    return html
        .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe\s*>/gi, '')
        .replace(/<object[\s\S]*?<\/object\s*>/gi, '')
        .replace(/<embed[^>]*>/gi, '')
        .replace(/<form[\s\S]*?<\/form\s*>/gi, '')
        .replace(/<input[^>]*>/gi, '')
        .replace(/<link[^>]*>/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        .replace(/<base[^>]*>/gi, '')
        .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
        .replace(/\shref\s*=\s*["']?\s*javascript\s*:[^"'\s>]*/gi, ' href="#"')
        .replace(/\ssrc\s*=\s*["']?\s*javascript\s*:[^"'\s>]*/gi, '');
};

const selectBroadcastRecipients = (users, recipientFilter, selectedUserIds) => {
    const now = new Date();
    return users.filter((user) => {
        if (!user.email) return false;
        if (recipientFilter === 'all') return true;
        if (recipientFilter === 'selected') return selectedUserIds && selectedUserIds.includes(user.id);
        if (recipientFilter === 'active') return user.plexAccessStatus === 'active';
        if (recipientFilter === 'trial') return user.isTrial;
        if (recipientFilter === 'expired') return user.expiryDate && new Date(user.expiryDate) < now;
        if (recipientFilter === 'expiring') {
            if (!user.expiryDate || new Date(user.expiryDate) <= now) return false;
            const diffTime = Math.abs(new Date(user.expiryDate) - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        }
        return false;
    });
};

export const createBroadcastService = ({ configPath, usersPath, loadFile, sendEmail, log }) => {
    const startBroadcast = async ({ subject, body, recipientFilter, selectedUserIds }) => {
        const users = await loadFile(usersPath, []);
        const targetUsers = selectBroadcastRecipients(users, recipientFilter, selectedUserIds);
        if (targetUsers.length === 0) {
            const error = new Error('No users found matching the selected criteria (with valid emails).');
            error.statusCode = 400;
            throw error;
        }

        (async () => {
            const config = await loadFile(configPath, null);
            const bulkTransporter = nodemailer.createTransport({
                pool: true,
                host: config.smtpHost,
                port: parseInt(config.smtpPort, 10) || 587,
                secure: !!config.smtpSecure,
                auth: {
                    user: config.smtpUser,
                    pass: config.smtpPass,
                },
                maxConnections: 1,
                maxMessages: 100
            });

            for (const user of targetUsers) {
                try {
                    await sendEmail(config, user.email, subject, sanitizeBroadcastHtml(body), bulkTransporter);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (e) {
                    log(`Broadcast failed to ${user.email}: ${e.message}`);
                }
            }
            log(`Broadcast completed for ${targetUsers.length} users.`);
            bulkTransporter.close();
        })();

        return { count: targetUsers.length };
    };

    const sendTestBroadcast = async ({ subject, body, adminEmail }) => {
        const config = await loadFile(configPath, null);
        if (!config || !config.smtpHost || !config.smtpUser) {
            const error = new Error('SMTP settings are not configured.');
            error.statusCode = 400;
            throw error;
        }
        if (!adminEmail) {
            const error = new Error('Admin email not found in session.');
            error.statusCode = 400;
            throw error;
        }

        log(`Sending test broadcast email to ${adminEmail}...`);
        await sendEmail(config, adminEmail, subject, body);
    };

    return {
        startBroadcast,
        sendTestBroadcast,
    };
};
