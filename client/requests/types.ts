export type RequestMediaType = 'movie' | 'tv';

export type RequestSeason = {
    seasonNumber: number;
    name: string;
    episodeCount?: number;
    status?: number | null;
    statusLabel?: string | null;
};

export type RequestMediaItem = {
    id: number;
    tmdbId: number;
    mediaType: RequestMediaType;
    title: string;
    year?: string | null;
    overview?: string;
    posterUrl?: string;
    backdropUrl?: string;
    rating?: number | null;
    releaseDate?: string | null;
    firstAirDate?: string | null;
    seasons?: RequestSeason[];
    requestId?: number | null;
    requestStatus?: number | null;
    requestStatusLabel?: string | null;
    mediaStatus?: number | null;
    mediaStatusLabel?: string | null;
    available?: boolean;
    processing?: boolean;
    pending?: boolean;
    approved?: boolean;
    canRequest?: boolean;
};

export type RequestListResponse = {
    connected?: boolean;
    results: RequestMediaItem[];
    pageInfo?: {
        page?: number;
        pages?: number;
        results?: number;
    };
};

export type RequestAppStatus = {
    configured: boolean;
    supported: boolean;
    ready: boolean;
    connected?: boolean;
    type?: string;
    publicUrl?: string;
    error?: string | null;
};

export type AdminRequestItem = {
    id: number;
    status: number | null;
    statusLabel: string;
    mediaType: RequestMediaType;
    type: RequestMediaType;
    title: string;
    year?: string | null;
    overview?: string;
    posterUrl?: string;
    backdropUrl?: string;
    requestedBy?: {
        id?: number | null;
        displayName?: string;
        email?: string | null;
        avatar?: string;
    };
    createdAt?: string | null;
    updatedAt?: string | null;
    is4k?: boolean;
};
