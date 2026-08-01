import { findAndSearchReplacement } from './media-issue-arr-search.js';
import {
    createPlexIssueSync,
    reconcileReplacement,
    mergeSyncedIssues,
} from './media-issue-plex-sync.js';

export const createMediaIssueSync = ({
    issuePath,
    loadFile,
    saveFile,
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
        plexGraphql,
        PLEX_CREATE_COMMENT_MUTATION,
    });

    const syncExternalIssues = async (config) => {
        let localIssues = await loadIssues();
        let plexConnected = false;
        const [plexResult] = await Promise.allSettled([fetchPlexIssues(config)]);
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
                    }),
                });
            }
        } else log(`Plex issue sync failed: ${plexResult.reason?.message}`);

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
        return { localIssues, plexConnected };
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
