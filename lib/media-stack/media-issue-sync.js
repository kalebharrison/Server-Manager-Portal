import { findAndSearchReplacement } from './media-issue-arr-search.js';
import {
    createPlexIssueSync,
    reconcileReplacement,
    mergeSyncedIssues,
    normalizeSeerrIssue,
} from './media-issue-plex-sync.js';

export const createMediaIssueSync = ({
    issuePath,
    loadFile,
    saveFile,
    requestAppService,
    fetch,
    resolveIntegrationUrlForFetch,
    getPlexConnectionUri,
    log = () => {},
}) => {
    const loadIssues = () => loadFile(issuePath, []);

    const fetchDeps = { fetch, resolveIntegrationUrlForFetch };
    const { plexGraphql, resolvePlexTmdbId, fetchPlexIssues, PLEX_CREATE_COMMENT_MUTATION } = createPlexIssueSync({ fetch, getPlexConnectionUri });

    const findAndSearch = (config, issue) => findAndSearchReplacement(config, issue, fetchDeps);

    const reconcileReplacementForIssue = (config, issue) => reconcileReplacement(config, issue, {
        ...fetchDeps,
        requestAppService,
        plexGraphql,
        PLEX_CREATE_COMMENT_MUTATION,
    });

    const syncExternalIssues = async (config, filter) => {
        let localIssues = await loadIssues();
        let seerrIssues = [];
        let seerrConnected = false;
        let plexConnected = false;
        const [seerrResult, plexResult] = await Promise.allSettled([
            requestAppService.getRequestAppGate(config).ready
                ? requestAppService.listIssues(config, { filter })
                : Promise.resolve(null),
            fetchPlexIssues(config),
        ]);
        if (seerrResult.status === 'fulfilled' && seerrResult.value) {
            seerrIssues = (seerrResult.value?.results || []).map(normalizeSeerrIssue);
            seerrConnected = true;
        } else if (seerrResult.status === 'rejected') log(`Seerr issue sync failed: ${seerrResult.reason?.message}`);
        if (plexResult.status === 'fulfilled') {
            plexConnected = plexResult.value.connected;
            if (plexResult.value.issues.length) {
                localIssues = await mergeSyncedIssues({
                    localIssues,
                    importedIssues: plexResult.value.issues,
                    issuePath,
                    saveFile,
                    mergeExisting: (issue, existing) => ({
                        ...issue,
                        status: existing.status,
                        remediationStatus: existing.remediationStatus,
                        remediation: existing.remediation,
                        tmdbId: existing.tmdbId,
                        seerrIssueId: existing.seerrIssueId,
                        syncedToSeerrAt: existing.syncedToSeerrAt,
                    }),
                });
            }
        } else log(`Plex issue sync failed: ${plexResult.reason?.message}`);

        if (seerrIssues.length) {
            localIssues = await mergeSyncedIssues({
                localIssues,
                importedIssues: seerrIssues,
                issuePath,
                saveFile,
                mergeExisting: (issue, existing) => ({
                    ...issue,
                    remediationStatus: existing.remediationStatus || 'pending-review',
                    remediation: existing.remediation,
                    approvedAt: existing.approvedAt,
                }),
            });
        }

        let reconciliationChanged = false;
        for (let index = 0; index < localIssues.length; index++) {
            try {
                const reconciled = await reconcileReplacementForIssue(config, localIssues[index]);
                if (reconciled !== localIssues[index]) {
                    localIssues[index] = reconciled;
                    reconciliationChanged = true;
                }
            } catch (error) {
                log(`Issue replacement reconciliation failed for ${localIssues[index].id}: ${error.message}`);
            }
        }
        if (reconciliationChanged) await saveFile(issuePath, localIssues);
        return { localIssues, seerrConnected, plexConnected };
    };

    return {
        loadIssues,
        findAndSearch,
        plexGraphql,
        reconcileReplacement: reconcileReplacementForIssue,
        resolvePlexTmdbId,
        fetchPlexIssues,
        syncExternalIssues,
    };
};
