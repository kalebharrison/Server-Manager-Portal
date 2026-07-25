import { getDaysUntilExpiry } from '../core/date-utils.js';

export const evaluateDiscordMembership = (user) => {
    if (!user) return { ok: false, reason: 'not_linked' };
    // Portal admin row must never lose Discord access via member expiry/revoke flags.
    if (user.isPortalAdmin === true || user.isAdmin === true) return { ok: true, reason: null };
    if (user.plexAccessStatus === 'revoked') return { ok: false, reason: 'revoked' };
    const days = getDaysUntilExpiry(user.expiryDate);
    if (days !== null && days < 0) return { ok: false, reason: 'expired' };
    return { ok: true, reason: null };
};

export const isMemberAllowed = (user) => evaluateDiscordMembership(user).ok;

export const createDiscordMemberResolver = ({
    loadFile,
    usersPath,
    configPath,
    resolveCurrentAdmin = async () => false,
}) => {
    const findUserByDiscordId = async (discordId) => {
        const users = await loadFile(usersPath, []);
        return users.find((user) => String(user.discordId || '') === String(discordId)) || null;
    };

    const findUserById = async (userId) => {
        const users = await loadFile(usersPath, []);
        return users.find((user) => String(user.id) === String(userId)) || null;
    };

    const resolveIsAdmin = async (portalUser) => {
        if (!portalUser) return false;
        if (portalUser.isAdmin === true || portalUser.isPortalAdmin === true) return true;
        if (typeof resolveCurrentAdmin !== 'function' || !configPath) return false;
        try {
            const config = await loadFile(configPath, {});
            return !!(await resolveCurrentAdmin({
                id: portalUser.id,
                plexId: portalUser.plexId,
                jellyfinId: portalUser.jellyfinId,
                username: portalUser.username,
            }, config));
        } catch {
            return false;
        }
    };

    const requirePortalMember = async (interaction) => {
        const portalUser = await findUserByDiscordId(interaction.user.id);
        const membership = evaluateDiscordMembership(portalUser);
        if (!membership.ok) {
            const message = membership.reason === 'not_linked'
                ? 'Link your Discord user ID under **Preferences** in the portal (Developer Mode → Copy User ID), and make sure your membership is active.'
                : membership.reason === 'revoked'
                    ? 'Your portal membership is revoked, so Discord bot actions are disabled.'
                    : 'Your portal membership has expired, so Discord bot actions are disabled.';
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
            } else {
                await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
            }
            return null;
        }
        const isAdmin = await resolveIsAdmin(portalUser);
        return { ...portalUser, isAdmin };
    };

    const toSessionUser = (portalUser, { isAdmin = false } = {}) => ({
        id: portalUser.id,
        username: portalUser.username,
        email: portalUser.email,
        plexId: portalUser.plexId,
        jellyfinId: portalUser.jellyfinId,
        isAdmin: isAdmin || portalUser.isAdmin === true || portalUser.isPortalAdmin === true,
    });

    const displayName = (portalUser) => portalUser?.username || portalUser?.displayName || 'member';

    return {
        findUserByDiscordId,
        findUserById,
        requirePortalMember,
        toSessionUser,
        displayName,
        isMemberAllowed,
        evaluateDiscordMembership,
    };
};
