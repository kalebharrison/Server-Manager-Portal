import { sanitizeDiscordUserId } from '../discord/discord-config.js';

export const hasLinkedDiscordId = (user = {}) => /^\d{5,32}$/.test(String(user.discordId || '').trim());

export const applyDiscordIdToUser = (users, user, rawId) => {
    const nextDiscordId = sanitizeDiscordUserId(rawId);
    if (nextDiscordId === null) {
        return { error: 'Discord user ID must be a numeric snowflake (Developer Mode → Copy User ID).' };
    }
    const previous = String(user?.discordId || '');
    if (nextDiscordId === previous) return { changed: false };
    if (nextDiscordId) {
        const taken = (Array.isArray(users) ? users : []).find((other) => (
            other
            && other !== user
            && String(other.id) !== String(user?.id)
            && String(other.discordId || '') === nextDiscordId
        ));
        if (taken) {
            const name = taken.displayName || taken.username || 'another member';
            return { error: `That Discord ID is already linked to ${name}.` };
        }
        user.discordId = nextDiscordId;
    } else {
        delete user.discordId;
    }
    return { changed: true };
};
