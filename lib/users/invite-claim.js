import { randomUUID } from 'crypto';

export class InviteClaimError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

export const findClaimableInvite = (invites, code) => {
    const invite = invites.find(item => item.code === code);
    if (!invite) throw new InviteClaimError(404, 'Invite code not found or revoked.');
    if (invite.maxUses !== 'unlimited' && invite.currentUses >= invite.maxUses) {
        throw new InviteClaimError(400, 'Invite code has reached its maximum usage limit.');
    }
    return invite;
};

export const recordInviteClaim = (invites, code, plexUser, claimedAt = new Date().toISOString()) => {
    const invite = findClaimableInvite(invites, code);
    invite.currentUses = (invite.currentUses || 0) + 1;
    if (!invite.usedBy) invite.usedBy = [];
    invite.usedBy.push({
        username: plexUser.username,
        email: plexUser.email,
        date: claimedAt
    });
    return invite;
};

export const executeInviteClaimTransaction = async ({
    code,
    plexUser,
    config,
    invitesPath,
    usersPath,
    updateFile,
    inviteUserToPlex,
    membershipSync,
    log,
}) => {
    let invite;
    let newUser;

    await updateFile(invitesPath, [], async (freshInvites) => {
        invite = findClaimableInvite(freshInvites, code);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        today.setDate(today.getDate() + invite.durationDays);

        newUser = {
            id: randomUUID(),
            plexId: plexUser.id,
            username: plexUser.username,
            email: plexUser.email,
            thumb: plexUser.thumb,
            expiryDate: today.toISOString(),
            joiningDate: new Date().toISOString(),
            plexAccessStatus: 'pending',
            isTrial: false
        };

        await updateFile(usersPath, [], (freshUsers) => {
            if (freshUsers.some((user) => String(user.plexId) === String(plexUser.id) || user.email === plexUser.email)) {
                throw new InviteClaimError(400, 'You are already a member of this server.');
            }
            freshUsers.push(newUser);
            return freshUsers;
        });
        await inviteUserToPlex(newUser, config, invite.libraryIds).catch(e => log('Failed to invite claimed user: ' + e.message));
        if (membershipSync?.ensure) {
            // Best-effort: Seerr import usually needs accepted Plex access; sync/login will retry.
            membershipSync.ensure(newUser, config).catch((e) => log(`Request app ensure after invite claim skipped: ${e.message}`));
        }
        recordInviteClaim(freshInvites, code, plexUser);
        return freshInvites;
    });

    return { invite, newUser };
};
