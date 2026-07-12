export const clampMonthOffset = (offset: number) => Math.max(-24, Math.min(offset, 24));

export const mapSonarrCalendarItems = (calendar: any[] = []) => calendar
    .map((ep: any) => {
        const poster = ep.series?.images?.find((img: any) => img.coverType === 'poster');
        return {
            id: `sonarr-${ep.id || ep.airDateUtc || ep.airDate}-${ep.title}`,
            type: 'tv',
            service: 'Sonarr',
            sourceId: ep.series?.id || ep.seriesId || '',
            title: ep.series?.title || 'Unknown Series',
            subtitle: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`,
            seasonNumber: Number(ep.seasonNumber),
            episodeNumber: Number(ep.episodeNumber),
            date: new Date(ep.airDateUtc || ep.airDate),
            hasFile: ep.hasFile,
            monitored: ep.monitored,
            imageUrl: poster ? (poster.remoteUrl || poster.url) : null,
            network: ep.series?.network || ''
        };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

export const mapRadarrCalendarItems = (calendar: any[] = []) => calendar
    .flatMap((movie: any) => {
        const releaseDateStr = movie.digitalRelease || movie.physicalRelease || movie.inCinemas || movie.added;
        if (!releaseDateStr) return [];
        const poster = movie.images?.find((img: any) => img.coverType === 'poster');
        return [{
            id: `radarr-${movie.id || releaseDateStr}-${movie.title}`,
            type: 'movie',
            service: 'Radarr',
            title: movie.title,
            subtitle: movie.studio || 'Movie Release',
            date: new Date(releaseDateStr),
            hasFile: movie.hasFile,
            monitored: movie.monitored,
            imageUrl: poster ? (poster.remoteUrl || poster.url) : null,
            network: movie.studio || ''
        }];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

const pickPosterUrl = (images: any[] = []) => {
    const poster = images.find((img: any) => img.coverType === 'poster') || images[0];
    return poster ? (poster.remoteUrl || poster.url || '') : '';
};

const prettyStatus = (value: string) => value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const queuePhase = (item: any, progress: number) => {
    const status = String(item.status || '').toLowerCase();
    const trackedStatus = String(item.trackedDownloadStatus || '').toLowerCase();
    const trackedState = String(item.trackedDownloadState || '').toLowerCase();
    const messages = JSON.stringify(item.statusMessages || item.errorMessage || '').toLowerCase();

    if (status.includes('stalled') || trackedState.includes('stalled') || messages.includes('stalled')) return 'Stalled';
    if (trackedStatus === 'error' || status.includes('error') || status.includes('failed')) return 'Failed';
    if (trackedStatus === 'warning' || status.includes('warning')) return 'Needs Attention';
    if (status.includes('paused')) return 'Paused';
    if (status.includes('delay') || status.includes('queued') || status.includes('pending')) return 'Waiting';
    if (status.includes('completed') || progress >= 99.9) return 'Importing';
    if (status.includes('download') || item.timeleft) return 'Downloading';
    return status ? prettyStatus(status) : 'Waiting';
};

export const mapQueueRecords = (records: any[] = [], service: string) => records.map((item: any, index: number) => {
    const isTv = service === 'Sonarr';
    const subject = isTv ? item.series : item.movie;
    const title = subject?.title || '';
    const total = Number(item.size || 0);
    const remaining = Number(item.sizeleft || 0);
    const downloaded = Math.max(0, total - remaining);
    const progress = total > 0 ? Math.max(0, Math.min(100, (downloaded / total) * 100)) : 0;
    const episode = item.episode || {};
    const isUpgrade = isTv ? episode.hasFile === true : subject?.hasFile === true;
    const seasonEpisode = episode.seasonNumber !== undefined && episode.episodeNumber !== undefined
        ? `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`
        : '';

    return {
        id: `${service}-${item.id || subject?.id || item.downloadId || item.trackedDownloadId || index}`,
        service,
        type: isTv ? 'tv' : 'movie',
        kindLabel: isTv ? 'TV Show' : 'Movie',
        acquisitionKind: isUpgrade ? 'upgrade' : 'new',
        acquisitionLabel: isUpgrade ? 'Upgrade' : 'New',
        title,
        hasMediaTitle: !!title,
        subtitle: isTv
            ? [seasonEpisode, episode.title].filter(Boolean).join(' - ')
            : subject?.year ? String(subject.year) : '',
        imageUrl: pickPosterUrl(subject?.images || []),
        progress,
        phase: queuePhase(item, progress),
        timeleft: item.timeleft || '',
        downloaded,
        total,
    };
});

export const groupCalendarItemsByDate = (items: any[]) => {
    const groups: { [dateStr: string]: any[] } = {};
    items.forEach(item => {
        const dateStr = item.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(item);
    });
    return groups;
};

export const summarizeSeasonReleaseBatches = (items: any[] = []) => {
    const batches = new Map<string, any[]>();
    const singles: any[] = [];
    items.forEach((item) => {
        if (item.type !== 'tv' || !Number.isFinite(item.seasonNumber) || !Number.isFinite(item.episodeNumber)) {
            singles.push(item);
            return;
        }
        const key = `${item.sourceId || item.title}:${item.date.toISOString().slice(0, 10)}:${item.seasonNumber}`;
        const batch = batches.get(key) || [];
        batch.push(item);
        batches.set(key, batch);
    });

    const summaries = Array.from(batches.values()).map((batch) => {
        if (batch.length === 1) return batch[0];
        const first = batch[0];
        const episodes = batch.map((item) => item.episodeNumber).sort((a, b) => a - b);
        const range = episodes[0] === episodes[episodes.length - 1]
            ? String(episodes[0])
            : `${episodes[0]}-${episodes[episodes.length - 1]}`;
        return {
            ...first,
            id: `${first.id}-batch`,
            subtitle: `Season ${first.seasonNumber} - Episodes ${range}`,
            hasFile: batch.every((item) => item.hasFile),
            monitored: batch.some((item) => item.monitored),
            releaseCount: batch.length,
        };
    });
    return [...singles, ...summaries].sort((a, b) => a.date.getTime() - b.date.getTime());
};
