import { randomUUID } from 'crypto';
import { MEDIA_ISSUES_PATH } from '../config/data-paths.js';
import { listEmbed, truncate } from './discord-embeds.js';

const reporterId = (user) => String(user?.id || user?.plexId || user?.jellyfinId || user?.email || '').trim();

export const createDiscordIssueHandlers = ({
    member,
    loadFile,
    saveFile,
    appendAuditLog = async () => {},
    log,
}) => {
    const loadIssues = () => loadFile(MEDIA_ISSUES_PATH, []);

    const handleIssueCommand = async (interaction) => {
        const portalUser = await member.requirePortalMember(interaction);
        if (!portalUser) return;
        const sub = interaction.options.getSubcommand();

        if (sub === 'report') {
            const title = String(interaction.options.getString('title') || '').trim().slice(0, 300);
            const details = String(interaction.options.getString('details') || '').trim();
            const issueType = Math.max(1, Math.min(4, Number(interaction.options.getString('type') || '4') || 4));
            if (title.length < 1 || details.length < 3) {
                await interaction.reply({ content: 'Title and details are required.', ephemeral: true });
                return;
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const issues = await loadIssues();
                const now = new Date().toISOString();
                const issue = {
                    id: `portal:${randomUUID()}`,
                    source: 'portal',
                    status: 'open',
                    remediationStatus: 'pending-review',
                    issueType,
                    title,
                    mediaType: 'media',
                    message: details,
                    reporter: member.displayName(portalUser),
                    reporterId: reporterId(portalUser),
                    createdAt: now,
                    updatedAt: now,
                    comments: [],
                };
                await saveFile(MEDIA_ISSUES_PATH, [issue, ...issues].slice(0, 2000));
                await appendAuditLog('media_issue_reported', member.toSessionUser(portalUser), null, {
                    issueId: issue.id,
                    title: issue.title,
                    via: 'discord',
                });
                await interaction.editReply({
                    content: `Issue reported: **${truncate(title, 80)}**\nId: \`${issue.id}\``,
                });
            } catch (error) {
                log?.(`Discord issue report failed: ${error.message}`);
                await interaction.editReply({ content: `Could not report issue: ${error.message}` });
            }
            return;
        }

        if (sub === 'list') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const issues = (await loadIssues())
                    .filter((issue) => issue.source === 'portal' && issue.reporterId === reporterId(portalUser))
                    .filter((issue) => issue.status === 'open')
                    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
                    .slice(0, 10);
                if (!issues.length) {
                    await interaction.editReply({ content: 'You have no open portal issues.' });
                    return;
                }
                await interaction.editReply({
                    embeds: [listEmbed({
                        title: 'Your open issues',
                        lines: issues.map((issue) => `\`${issue.id}\` — ${truncate(issue.title, 60)}`),
                        footer: 'Use /issue view id:… or /issue comment',
                    })],
                });
            } catch (error) {
                log?.(`Discord issue list failed: ${error.message}`);
                await interaction.editReply({ content: `Could not list issues: ${error.message}` });
            }
            return;
        }

        if (sub === 'view') {
            const id = String(interaction.options.getString('id') || '').trim();
            await interaction.deferReply({ ephemeral: true });
            try {
                const issue = (await loadIssues()).find((item) => item.id === id);
                if (!issue || issue.source !== 'portal' || issue.reporterId !== reporterId(portalUser)) {
                    await interaction.editReply({ content: 'Issue not found (or not yours).' });
                    return;
                }
                const comments = Array.isArray(issue.comments) ? issue.comments.slice(-5) : [];
                const commentLines = comments.length
                    ? comments.map((c) => `• ${truncate(c.message || c, 120)}`).join('\n')
                    : '_No comments yet._';
                await interaction.editReply({
                    embeds: [listEmbed({
                        title: truncate(issue.title, 80),
                        description: `${truncate(issue.message || '', 300)}\n\n**Comments**\n${commentLines}`,
                        lines: [],
                        footer: `Status: ${issue.status} · ${issue.id}`,
                    })],
                });
            } catch (error) {
                log?.(`Discord issue view failed: ${error.message}`);
                await interaction.editReply({ content: `Could not view issue: ${error.message}` });
            }
            return;
        }

        if (sub === 'comment') {
            const id = String(interaction.options.getString('id') || '').trim();
            const message = String(interaction.options.getString('message') || '').trim();
            if (message.length < 2) {
                await interaction.reply({ content: 'Comment is required.', ephemeral: true });
                return;
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const issues = await loadIssues();
                const index = issues.findIndex((item) => item.id === id);
                if (index < 0) {
                    await interaction.editReply({ content: 'Issue not found.' });
                    return;
                }
                const issue = issues[index];
                if (issue.source !== 'portal' || issue.reporterId !== reporterId(portalUser)) {
                    await interaction.editReply({ content: 'You can only comment on your own portal issues.' });
                    return;
                }
                const comment = {
                    id: randomUUID(),
                    message,
                    author: member.displayName(portalUser),
                    createdAt: new Date().toISOString(),
                };
                const next = {
                    ...issue,
                    comments: [...(issue.comments || []), comment],
                    updatedAt: comment.createdAt,
                };
                issues[index] = next;
                await saveFile(MEDIA_ISSUES_PATH, issues);
                await interaction.editReply({ content: `Comment added on \`${id}\`.` });
            } catch (error) {
                log?.(`Discord issue comment failed: ${error.message}`);
                await interaction.editReply({ content: `Could not comment: ${error.message}` });
            }
        }
    };

    return { handleIssueCommand };
};
