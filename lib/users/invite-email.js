import fs from 'fs/promises';
import path from 'path';

import { escapeHtmlAttr } from '../http/html-shell.js';

const INVITE_LOGO_PATH = path.join(process.cwd(), 'static', 'logo.png');

export const hasInviteLogo = async () => {
    try {
        await fs.access(INVITE_LOGO_PATH);
        return true;
    } catch {
        return false;
    }
};

export const buildInviteEmailSubject = (serverName) => `You've been invited to ${String(serverName || 'the server')}!`;

export const buildInviteEmailHtml = ({ serverName, inviteUrl, durationDays, hasLogo }) => {
    const safeServerName = escapeHtmlAttr(serverName || 'Server');
    const safeInviteUrl = escapeHtmlAttr(inviteUrl || '#');
    const safeDurationDays = escapeHtmlAttr(String(durationDays ?? ''));

    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; padding: 30px; color: #333333; line-height: 1.6;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #e5a00d;">
            <div style="background-color: #282A2D; padding: 25px; text-align: center;">
                ${hasLogo ? '<img src="cid:logo" alt="Logo" style="max-height: 100px; display: block; margin: 0 auto 10px auto;" />' : ''}
                <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">${safeServerName}</h1>
            </div>
            <div style="padding: 30px 40px;">
                <h2 style="color: #e5a00d; font-size: 20px; margin-top: 0; font-weight: 600; text-align: center;">Welcome to the Server!</h2>
                <p style="text-align: center; font-size: 16px;">You have been invited to join our private media server.</p>

                <div style="text-align: center; margin: 35px 0;">
                    <a href="${safeInviteUrl}" style="background-color: #e5a00d; color: #ffffff; text-decoration: none; padding: 14px 35px; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(229, 160, 13, 0.2);">Claim Your Access</a>
                </div>

                <div style="background-color: #fcf8f2; border-left: 4px solid #e5a00d; padding: 20px; margin: 25px 0 0 0; border-radius: 6px;">
                    <p style="margin: 0; font-size: 14px; color: #718096; text-align: center;">This invite link is for single use only. It will grant you access for <strong>${safeDurationDays} days</strong>.</p>
                </div>
            </div>
            <div style="background-color: #f7fafc; padding: 20px 30px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #a0aec0;">
                <p style="margin: 0 0 5px 0;">Automated notification from the Server Manager Portal.</p>
                <p style="margin: 0;">We hope you enjoy the server!</p>
            </div>
        </div>
    </div>
`;
};
