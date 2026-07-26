/**
 * Text answers for portal Ask chat ops intents (stats, queue, help, …).
 * Mirrors Discord /ask fixed handlers without Discord interaction objects.
 */

const displayName = (sessionUser = {}) => (
    sessionUser.username
    || sessionUser.plexUsername
    || sessionUser.email
    || 'Member'
);

const helpAnswer = () => ([
    'I can help with discovery and portal basics:',
    '• Find movies/TV from a title or plot description',
    '• Your stats / membership summary',
    '• Download queue (pending + processing)',
    '• Your recent requests',
    '• What’s streaming live',
    '• Trending / popular to browse',
    'Open Analytics in the portal for full personal watch history.',
].join('\n'));

export const createRequestAppChatOps = ({
    requestAppService,
    log,
} = {}) => {
    const answerStats = async (config, sessionUser) => {
        const lines = [
            `Portal user: **${displayName(sessionUser)}**`,
            sessionUser?.expiryDate
                ? `Membership expiry: ${sessionUser.expiryDate}`
                : 'Membership: active',
        ];
        try {
            const counts = await requestAppService?.getRequestCounts?.(config);
            if (counts) {
                lines.push(
                    `Server requests — pending: ${counts.pending || 0}, processing: ${counts.processing || 0}, available: ${counts.available || 0}`,
                );
            }
        } catch (error) {
            log?.(`Portal chat stats counts failed: ${error.message}`);
        }
        lines.push('Open **Analytics** in the portal for full personal watch history.');
        return { ok: true, answer: lines.join('\n'), results: [] };
    };

    const answerQueue = async (config) => {
        if (!requestAppService?.listRequests) {
            return { ok: true, answer: 'Request app is not available for queue status.', results: [] };
        }
        try {
            const [processing, pending] = await Promise.all([
                requestAppService.listRequests(config, { filter: 'processing', take: 15, skip: 0 }).catch(() => ({ results: [] })),
                requestAppService.listRequests(config, { filter: 'pending', take: 10, skip: 0 }).catch(() => ({ results: [] })),
            ]);
            const items = [
                ...(processing.results || []).map((item) => ({ ...item, _bucket: 'processing' })),
                ...(pending.results || []).map((item) => ({ ...item, _bucket: 'pending' })),
            ].slice(0, 12);
            if (!items.length) {
                return { ok: true, answer: 'Queue is clear — nothing pending or processing.', results: [] };
            }
            const lines = items.slice(0, 8).map((item) => {
                const title = item.title || item.name || 'Untitled';
                const year = item.year ? ` (${item.year})` : '';
                return `• ${title}${year} — ${item._bucket}`;
            });
            return {
                ok: true,
                answer: `On the way (${items.length} item(s)):\n${lines.join('\n')}`,
                results: items.filter((item) => item.tmdbId && item.mediaType).slice(0, 5),
            };
        } catch (error) {
            log?.(`Portal chat queue failed: ${error.message}`);
            return { ok: false, answer: `Could not load queue: ${error.message}`, results: [] };
        }
    };

    const answerMyRequests = async (config, sessionUser) => {
        if (!requestAppService?.listRequests) {
            return { ok: true, answer: 'Request app is not available.', results: [] };
        }
        try {
            const data = await requestAppService.listRequests(config, { filter: 'all', take: 30, skip: 0 });
            const mineName = displayName(sessionUser).toLowerCase();
            const mine = (data.results || []).filter((item) => {
                const by = item.requestedBy?.displayName || item.requestedBy?.username || item.requestedBy || '';
                return String(by).toLowerCase().includes(mineName)
                    || String(by).toLowerCase() === String(sessionUser.email || '').toLowerCase();
            }).slice(0, 10);
            if (!mine.length) {
                return { ok: true, answer: 'No recent requests found under your name. Try Request Content → Queue (admins) or Seerr directly.', results: [] };
            }
            const lines = mine.map((item) => {
                const title = item.title || 'Untitled';
                const status = item.statusLabel || item.status || item._bucket || 'unknown';
                return `• ${title} — ${status}`;
            });
            return {
                ok: true,
                answer: `Your recent requests:\n${lines.join('\n')}`,
                results: mine.filter((item) => item.tmdbId && item.mediaType).slice(0, 5),
            };
        } catch (error) {
            log?.(`Portal chat my requests failed: ${error.message}`);
            return { ok: false, answer: `Could not load requests: ${error.message}`, results: [] };
        }
    };

    const answerStatus = async () => ({
        ok: true,
        answer: 'For live service health, open **Status** in the portal nav. I can also check the download queue or help you find something to watch.',
        results: [],
    });

    const answerLive = async () => ({
        ok: true,
        answer: 'Live who’s-watching is on the **Home** / sessions widgets (and Discord `/live`). Ask me for the download queue or a title to find instead.',
        results: [],
    });

    const answerTrending = async (config, params = {}) => {
        if (!requestAppService?.discover) {
            return { ok: true, answer: 'Browse trending on Request Content → Discover.', results: [] };
        }
        try {
            const category = String(params.category || 'trending');
            const data = await requestAppService.discover(config, {
                category,
                mediaType: 'all',
                page: 1,
            });
            const results = (data?.results || []).slice(0, 5);
            if (!results.length) {
                return { ok: true, answer: `No ${category} titles came back. Try Request Content → Discover.`, results: [] };
            }
            return {
                ok: true,
                answer: `Here are some **${category}** titles:`,
                results,
            };
        } catch (error) {
            log?.(`Portal chat trending failed: ${error.message}`);
            return { ok: false, answer: `Could not load ${params.category || 'trending'}: ${error.message}`, results: [] };
        }
    };

    const runOpsIntent = async (config, { intent, params = {} } = {}, { sessionUser = null } = {}) => {
        switch (intent) {
        case 'help':
            return { ok: true, answer: helpAnswer(), results: [] };
        case 'stats.me':
            return answerStats(config, sessionUser || {});
        case 'queue.list':
            return answerQueue(config);
        case 'requests.list':
            return answerMyRequests(config, sessionUser || {});
        case 'status.summary':
            return answerStatus();
        case 'live.sessions':
            return answerLive();
        case 'discover.trending':
            return answerTrending(config, params);
        case 'issue.list':
            return {
                ok: true,
                answer: 'Open **Issues** in the portal nav to list or report problems with titles.',
                results: [],
            };
        case 'issue.create':
            return {
                ok: true,
                answer: 'To report a problem, open a title in Request Content and use **Report issue**, or go to **Issues**.',
                results: [],
            };
        default:
            return null;
        }
    };

    return { runOpsIntent, helpAnswer };
};
