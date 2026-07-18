const createEmptyFileSizes = () => ({
    '0 - 500 MB': { movies: 0, shows: 0 },
    '500 MB - 1.5 GB': { movies: 0, shows: 0 },
    '1.5 GB - 5 GB': { movies: 0, shows: 0 },
    '5 GB - 10 GB': { movies: 0, shows: 0 },
    '10 GB+': { movies: 0, shows: 0 },
});

const recordFileSize = (fileSizes, dirType, partSize) => {
    const sizeMB = partSize / (1024 * 1024);
    const bucket = sizeMB < 500 ? '0 - 500 MB'
        : sizeMB < 1500 ? '500 MB - 1.5 GB'
            : sizeMB < 5000 ? '1.5 GB - 5 GB'
                : sizeMB < 10000 ? '5 GB - 10 GB'
                    : '10 GB+';
    if (dirType === 'movie') fileSizes[bucket].movies++;
    else if (dirType === 'show') fileSizes[bucket].shows++;
};

const recordMediaStats = (dirType, media, resolutions, codecs) => {
    if (dirType !== 'movie' && dirType !== 'show') return;
    const res = String(media.videoResolution || '').toLowerCase();
    if (res === '4k' || res === '2160') resolutions['4K']++;
    else if (res === '1080') resolutions['1080p']++;
    else if (res === '720') resolutions['720p']++;
    else if (res === '576' || res === '480' || res === 'sd') resolutions['SD']++;
    else resolutions['Other']++;

    const codec = String(media.videoCodec || '').toLowerCase();
    if (codec === 'hevc' || codec === 'h265') codecs['H.265 / HEVC']++;
    else if (codec === 'h264' || codec === 'avc') codecs['H.264 / AVC']++;
    else if (codec === 'av1') codecs['AV1']++;
    else codecs['Other']++;
};

export const crawlPlexLibraryStats = async ({ uri, config, signal, log }) => {
    const sectionsRes = await fetch(`${uri}/library/sections`, {
        headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' },
        signal,
    });
    if (!sectionsRes.ok) throw new Error(`Sections request failed: ${sectionsRes.status}`);
    const { MediaContainer: { Directory: directories = [] } } = await sectionsRes.json();

    let totalMoviesCount = 0;
    let totalShowsCount = 0;
    let totalMusicCount = 0;
    let totalEpisodesCount = 0;
    let totalArtistsCount = 0;
    let totalAlbumsCount = 0;
    let totalTracksCount = 0;
    let totalMoviesBytes = 0;
    let totalShowsBytes = 0;
    let totalMusicBytes = 0;
    let total4kMovies = 0;
    const fourKShows = new Set();

    const resolutions = { '4K': 0, '1080p': 0, '720p': 0, 'SD': 0, 'Other': 0 };
    const codecs = { 'H.265 / HEVC': 0, 'H.264 / AVC': 0, 'AV1': 0, 'Other': 0 };
    const fileSizes = createEmptyFileSizes();

    for (const dir of directories) {
        try {
            const countRes = await fetch(
                `${uri}/library/sections/${dir.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`,
                { headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }, signal },
            );
            if (countRes.ok) {
                const { MediaContainer: mc } = await countRes.json();
                const count = mc.totalSize || mc.size || 0;
                if (dir.type === 'movie') {
                    totalMoviesCount += count;
                } else if (dir.type === 'show') {
                    totalShowsCount += count;
                } else if (dir.type === 'artist') {
                    totalMusicCount += count;
                    totalArtistsCount += count;
                    const albCountRes = await fetch(
                        `${uri}/library/sections/${dir.key}/all?type=9&X-Plex-Container-Start=0&X-Plex-Container-Size=1`,
                        { headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }, signal },
                    );
                    if (albCountRes.ok) {
                        const { MediaContainer: albMc } = await albCountRes.json();
                        totalAlbumsCount += albMc.totalSize || albMc.size || 0;
                    }
                }
            }

            const typeParam = dir.type === 'movie' ? '?type=1' : dir.type === 'show' ? '?type=4' : dir.type === 'artist' ? '?type=10' : '';
            if (!typeParam) continue;

            let start = 0;
            let bytes = 0;
            const PAGE = 1000;
            while (true) {
                const pageRes = await fetch(
                    `${uri}/library/sections/${dir.key}/all${typeParam}&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE}`,
                    { headers: { 'X-Plex-Token': config.plexToken, 'Accept': 'application/json' }, signal },
                );
                if (!pageRes.ok) break;
                const { MediaContainer: { Metadata: items = [] } } = await pageRes.json();
                if (items.length === 0) break;

                if (dir.type === 'show') totalEpisodesCount += items.length;
                else if (dir.type === 'artist') totalTracksCount += items.length;

                for (const item of items) {
                    let is4k = false;
                    for (const media of item.Media || []) {
                        if (media.videoResolution === '4k') is4k = true;
                        recordMediaStats(dir.type, media, resolutions, codecs);
                        for (const part of media.Part || []) {
                            if (part.size) {
                                const partSize = parseInt(part.size, 10);
                                bytes += partSize;
                                recordFileSize(fileSizes, dir.type, partSize);
                            }
                        }
                    }
                    if (is4k) {
                        if (dir.type === 'movie') total4kMovies++;
                        else if (dir.type === 'show') fourKShows.add(item.grandparentRatingKey || item.parentRatingKey || item.title);
                    }
                }
                start += PAGE;
            }
            if (dir.type === 'movie') totalMoviesBytes += bytes;
            else if (dir.type === 'show') totalShowsBytes += bytes;
            else if (dir.type === 'artist') totalMusicBytes += bytes;
        } catch (e) {
            log(`[PlexStats] Failed to fetch section "${dir.title}": ${e.message}`);
        }
    }

    const totalVideoTitles = totalMoviesCount + totalShowsCount;
    const total4kTitles = total4kMovies + fourKShows.size;

    return {
        movies: totalMoviesCount,
        shows: totalShowsCount,
        music: totalMusicCount,
        episodes: totalEpisodesCount,
        artists: totalArtistsCount,
        albums: totalAlbumsCount,
        tracks: totalTracksCount,
        moviesBytes: totalMoviesBytes,
        showsBytes: totalShowsBytes,
        musicBytes: totalMusicBytes,
        fourKPercent: totalVideoTitles > 0 ? Math.round((total4kTitles / totalVideoTitles) * 100) : 0,
        resolutions,
        codecs,
        fileSizes,
    };
};
