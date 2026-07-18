import React from 'react';
import { ExternalLink } from 'lucide-react';

import { CreditStrip, DetailSection, NamedValueGrid } from './RequestMediaDetails';
import type { RequestMediaItem } from './types';

export const RequestMediaCredits: React.FC<{ detail: RequestMediaItem }> = ({ detail }) => {
    const imdbUrl = detail.imdbId ? `https://www.imdb.com/title/${detail.imdbId}` : '';
    return (
        <div className="grid grid-cols-1 gap-7 xl:grid-cols-2">
            <div className="space-y-7">
                <CreditStrip title="Created By" credits={detail.creators} />
                <CreditStrip title="Crew" credits={detail.crew} />
                <NamedValueGrid title="Production" items={detail.productionCompanies} />
            </div>
            <div className="space-y-7">
                <CreditStrip title="Cast" credits={detail.cast} />
                {(detail.homepage || imdbUrl) ? (
                    <DetailSection title="Links">
                        <div className="flex flex-wrap gap-2">
                            {detail.homepage ? (
                                <a href={detail.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/35 px-3 py-2 text-sm font-bold text-text hover:border-plex hover:text-plex">
                                    Homepage
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            ) : null}
                            {imdbUrl ? (
                                <a href={imdbUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/35 px-3 py-2 text-sm font-bold text-text hover:border-plex hover:text-plex">
                                    IMDb
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            ) : null}
                        </div>
                    </DetailSection>
                ) : null}
            </div>
        </div>
    );
};
