export type RequestMediaType = 'movie' | 'tv';

// Portal-native Discover responses keep the legacy request shape and retain
// a few routing fields which are not part of the legacy request dashboard.
export type PortalRequestItem = any;
export type PortalIssueItem = any;
export type PortalServiceOptions = any;

export type RequestSeason = {
    seasonNumber: number;
    name: string;
    episodeCount?: number;
    status?: number | null;
    statusLabel?: string | null;
};

export type RequestNamedValue = {
    id?: number | string | null;
    name: string;
    logoUrl?: string;
};

export type RequestCredit = {
    id?: number | string | null;
    name: string;
    role?: string;
    profileUrl?: string;
};

export type RequestMediaItem = {
    id: number;
    tmdbId: number;
    mediaId?: number | null;
    mediaType: RequestMediaType;
    title: string;
    year?: string | null;
    overview?: string;
    tagline?: string;
    posterUrl?: string;
    backdropUrl?: string;
    rating?: number | null;
    releaseDate?: string | null;
    firstAirDate?: string | null;
    runtime?: number | null;
    status?: string | null;
    originalLanguage?: string | null;
    homepage?: string | null;
    imdbId?: string | null;
    budget?: number | null;
    revenue?: number | null;
    network?: string | null;
    studio?: string | null;
    numberOfSeasons?: number | null;
    numberOfEpisodes?: number | null;
    lastAirDate?: string | null;
    nextAirDate?: string | null;
    genres?: RequestNamedValue[];
    productionCompanies?: RequestNamedValue[];
    cast?: RequestCredit[];
    crew?: RequestCredit[];
    creators?: RequestCredit[];
    seasons?: RequestSeason[];
    requestId?: number | null;
    requestStatus?: number | null;
    requestStatusLabel?: string | null;
    mediaStatus?: number | null;
    mediaStatusLabel?: string | null;
    available?: boolean;
    processing?: boolean;
    requested?: boolean;
    pending?: boolean;
    approved?: boolean;
    canRequest?: boolean;
    /** Portal: join Notify list on someone else's open request. */
    canNotify?: boolean;
    notifying?: boolean;
    ratingKey?: string;
    plexUrl?: string;
    source?: 'request' | 'plex';
};

export type RequestListResponse = {
    connected?: boolean;
    results: RequestMediaItem[];
    pageInfo?: {
        page?: number;
        pages?: number;
        results?: number;
        pageSize?: number;
        hasNextPage?: boolean;
    };
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
    originalLanguage?: string | null;
    genres?: RequestNamedValue[];
    seasons?: RequestSeason[];
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
