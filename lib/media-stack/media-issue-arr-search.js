import { getReadyArrInstances } from './arr-instances.js';
import { titleKey } from './media-issue-helpers.js';

export const findAndSearchReplacement = async (config, issue, { fetch, resolveIntegrationUrlForFetch }) => {
    const types = issue.mediaType === 'movie' ? ['radarr'] : issue.mediaType === 'show' ? ['sonarr'] : ['radarr', 'sonarr'];
    for (const type of types) {
        for (const instance of getReadyArrInstances(config, type)) {
            const baseUrl = resolveIntegrationUrlForFetch(instance.url);
            const headers = { 'X-Api-Key': instance.apiKey, Accept: 'application/json', 'Content-Type': 'application/json' };
            const entityName = type === 'radarr' ? 'movie' : 'series';
            const catalogResponse = await fetch(`${baseUrl}/api/v3/${entityName}`, { headers });
            if (!catalogResponse.ok) continue;
            const catalog = await catalogResponse.json();
            const match = (Array.isArray(catalog) ? catalog : []).find((item) => (
                (issue.tmdbId && Number(item.tmdbId) === Number(issue.tmdbId))
                || titleKey(item.title) === titleKey(issue.title)
            ));
            if (!match?.id) continue;
            let releaseEndpoint = type === 'radarr' ? `/api/v3/release?movieId=${encodeURIComponent(match.id)}` : null;
            let episodeId = null;
            if (type === 'sonarr' && issue.seasonNumber !== null && issue.seasonNumber !== undefined && issue.episodeNumber) {
                const episodeResponse = await fetch(`${baseUrl}/api/v3/episode?seriesId=${encodeURIComponent(match.id)}`, { headers });
                if (episodeResponse.ok) {
                    const episodes = await episodeResponse.json();
                    const episode = (Array.isArray(episodes) ? episodes : []).find((item) => Number(item.seasonNumber) === Number(issue.seasonNumber) && Number(item.episodeNumber) === Number(issue.episodeNumber));
                    if (episode?.id) {
                        episodeId = episode.id;
                        releaseEndpoint = `/api/v3/release?episodeId=${encodeURIComponent(episode.id)}`;
                    }
                }
            }
            if (releaseEndpoint) {
                const releasesResponse = await fetch(`${baseUrl}${releaseEndpoint}`, { headers });
                if (!releasesResponse.ok) throw new Error(`${type} release search failed (${releasesResponse.status})`);
                const releases = await releasesResponse.json();
                const candidate = (Array.isArray(releases) ? releases : []).find((release) => release.rejected !== true && release.downloadAllowed !== false);
                if (!candidate) return { queued: false, reason: 'No acceptable replacement release was found.', type, instanceId: instance.id, entityId: match.id };
                const grabResponse = await fetch(`${baseUrl}/api/v3/release`, { method: 'POST', headers, body: JSON.stringify(candidate) });
                if (!grabResponse.ok) throw new Error(`${type} replacement grab failed (${grabResponse.status})`);
                const result = await grabResponse.json().catch(() => ({}));
                return {
                    queued: true,
                    replacementGrabbed: true,
                    type,
                    instanceId: instance.id,
                    entityId: match.id,
                    episodeId,
                    commandId: result.id || null,
                    quality: candidate.quality?.quality?.name || candidate.quality?.name || null,
                };
            }
            const commandResponse = await fetch(`${baseUrl}/api/v3/command`, { method: 'POST', headers, body: JSON.stringify({ name: 'SeriesSearch', seriesId: match.id }) });
            if (!commandResponse.ok) throw new Error(`sonarr search failed (${commandResponse.status})`);
            const result = await commandResponse.json().catch(() => ({}));
            return { queued: true, replacementGrabbed: false, type, instanceId: instance.id, entityId: match.id, commandId: result.id || null };
        }
    }
    return { queued: false, reason: 'No matching TV or movie automation record was found.' };
};
