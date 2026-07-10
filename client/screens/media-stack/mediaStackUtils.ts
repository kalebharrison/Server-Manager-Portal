import { formatTime } from '../../shared/format';

export const clampMonthOffset = (offset: number) => Math.max(-24, Math.min(offset, 24));

export const formatRelativeAirDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isMidnight = date.getHours() === 0 && date.getMinutes() === 0;
    const timeStr = isMidnight ? '' : ` at ${formatTime(date)}`;
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (date >= today && date < tomorrow) return `Today${timeStr}`;
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    if (date >= tomorrow && date < dayAfterTomorrow) return `Tomorrow${timeStr}`;
    if (diffDays > 1 && diffDays < 7) {
        return `${date.toLocaleDateString([], { weekday: 'long' })}${timeStr}`;
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + timeStr;
};

export const formatBytes = (bytes: number) => {
    if (!bytes) return '0.0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
};

export const mapSonarrCalendarItems = (calendar: any[] = []) => calendar
    .map((ep: any) => {
        const poster = ep.series?.images?.find((img: any) => img.coverType === 'poster');
        return {
            id: `sonarr-${ep.id || ep.airDateUtc || ep.airDate}-${ep.title}`,
            type: 'tv',
            service: 'Sonarr',
            title: ep.series?.title || 'Unknown Series',
            subtitle: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`,
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

export const mapQueueRecords = (records: any[] = [], service: string) => records.map((item: any) => ({ ...item, service }));

export const mapSonarrHistoryItems = (records: any[] = []) => records
    .map((item: any) => {
        let title = item.series?.title || item.sourceTitle || 'Unknown TV Show';
        if (item.series?.title && item.episode?.seasonNumber !== undefined && item.episode?.episodeNumber !== undefined) {
            title += ` - S${String(item.episode.seasonNumber).padStart(2, '0')}E${String(item.episode.episodeNumber).padStart(2, '0')}`;
            if (item.episode.title) title += ` - ${item.episode.title}`;
        }
        return {
            id: `sonarr-hist-${item.id}`,
            service: 'Sonarr',
            title,
            date: new Date(item.date),
            eventType: item.eventType
        };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

export const mapRadarrHistoryItems = (records: any[] = []) => records
    .map((item: any) => ({
        id: `radarr-hist-${item.id}`,
        service: 'Radarr',
        title: item.movie?.title || item.sourceTitle || 'Unknown Movie',
        date: new Date(item.date),
        eventType: item.eventType
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

export const groupCalendarItemsByDate = (items: any[]) => {
    const groups: { [dateStr: string]: any[] } = {};
    items.forEach(item => {
        const dateStr = item.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(item);
    });
    return groups;
};

export const getHistoryColor = (type: string) => {
    if (!type) return 'bg-muted';
    switch (type.toLowerCase()) {
        case 'grabbed':
            return 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]';
        case 'downloadfolderimported':
        case 'moviefileimported':
        case 'imported':
            return 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]';
        case 'downloadfailed':
        case 'failed':
            return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]';
        case 'episodefiledeleted':
        case 'moviefiledeleted':
        case 'deleted':
            return 'bg-zinc-600 shadow-[0_0_6px_rgba(113,113,122,0.5)]';
        default:
            return 'bg-plex shadow-[0_0_6px_rgba(229,160,13,0.5)]';
    }
};

export const formatEventType = (type: string) => {
    if (!type) return '';
    switch (type.toLowerCase()) {
        case 'grabbed':
            return 'Grabbed';
        case 'downloadfolderimported':
        case 'moviefileimported':
        case 'imported':
            return 'Imported';
        case 'downloadfailed':
        case 'failed':
            return 'Failed';
        case 'episodefiledeleted':
        case 'moviefiledeleted':
        case 'deleted':
            return 'Deleted';
        default:
            return type
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
    }
};
