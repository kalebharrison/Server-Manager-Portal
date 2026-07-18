import { recordsOf } from './media-stack-arr-helpers.js';

const pickImages = (images = []) => (Array.isArray(images) ? images : [])
    .filter((image) => image && (image.remoteUrl || image.url))
    .map((image) => ({
        coverType: image.coverType || null,
        remoteUrl: image.remoteUrl || null,
        url: image.url || null,
    }));

const memberMedia = (media) => {
    if (!media || typeof media !== 'object') return null;
    return {
        title: media.title || media.artistName || media.name || '',
        year: media.year || null,
        hasFile: typeof media.hasFile === 'boolean' ? media.hasFile : undefined,
        network: media.network || media.studio || '',
        images: pickImages(media.images),
        statistics: media.statistics && typeof media.statistics.trackFileCount === 'number'
            ? { trackFileCount: media.statistics.trackFileCount }
            : undefined,
        artist: media.artist ? {
            artistName: media.artist.artistName || media.artist.name || '',
            images: pickImages(media.artist.images),
        } : undefined,
    };
};

export const sanitizeQueueForMembers = (queue) => {
    const records = recordsOf(queue).map((record) => ({
        id: record.id,
        status: record.status || null,
        size: Number(record.size) || 0,
        sizeleft: Number(record.sizeleft) || 0,
        timeleft: record.timeleft || '',
        trackedDownloadStatus: record.trackedDownloadStatus || null,
        trackedDownloadState: record.trackedDownloadState || null,
        // Keep only phase keywords — never forward path-bearing status payloads.
        statusMessages: Array.isArray(record.statusMessages)
            ? record.statusMessages.map((entry) => ({
                title: String(entry?.title || '').slice(0, 80),
            }))
            : undefined,
        errorMessage: record.errorMessage ? 'Download error' : undefined,
        series: memberMedia(record.series),
        movie: memberMedia(record.movie),
        album: memberMedia(record.album),
        artist: memberMedia(record.artist),
        episode: record.episode ? {
            title: record.episode.title || '',
            seasonNumber: record.episode.seasonNumber,
            episodeNumber: record.episode.episodeNumber,
            hasFile: typeof record.episode.hasFile === 'boolean' ? record.episode.hasFile : undefined,
        } : undefined,
    }));
    return { records, totalRecords: records.length };
};

export const sanitizeCalendarForMembers = (calendar = []) => recordsOf(calendar).map((item) => ({
    id: item.id,
    title: item.title || '',
    airDateUtc: item.airDateUtc || null,
    airDate: item.airDate || null,
    monitored: item.monitored,
    hasFile: item.hasFile,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    digitalRelease: item.digitalRelease || null,
    physicalRelease: item.physicalRelease || null,
    inCinemas: item.inCinemas || null,
    added: item.added || null,
    _releaseDate: item._releaseDate || null,
    studio: item.studio || '',
    network: item.network || '',
    images: pickImages(item.images),
    series: memberMedia(item.series),
    arrInstanceId: item.arrInstanceId,
    arrInstanceName: item.arrInstanceName,
}));
