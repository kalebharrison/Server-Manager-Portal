import { memo } from 'react';

import { TopBingeSection, TopMovieSection } from './WrapUpFavoriteSections';
import { TimeOfDaySection, TopDaySection, TopLibrarySection } from './WrapUpPatternSections';
import { MediaProfileSection, StreamingHabitSection, WatchStyleSection } from './WrapUpProfileSections';
import { ServerRankSection, TotalStreamsSection } from './WrapUpPrimarySections';

interface WrapUpContentProps {
    metric: string;
    analytics: any;
    days: number | string;
}

export const WrapUpContent = memo(function WrapUpContent({ metric, analytics, days }: WrapUpContentProps) {
    switch (metric) {
        case 'Server Rank':
            return <ServerRankSection analytics={analytics} />;
        case 'Total Streams':
            return <TotalStreamsSection analytics={analytics} days={days} />;
        case 'Top Binge':
            return <TopBingeSection analytics={analytics} />;
        case 'Top Movie':
            return <TopMovieSection analytics={analytics} />;
        case 'Time of Day':
            return <TimeOfDaySection analytics={analytics} />;
        case 'Top Day':
            return <TopDaySection analytics={analytics} />;
        case 'Top Library':
            return <TopLibrarySection analytics={analytics} />;
        case 'Media Profile':
            return <MediaProfileSection analytics={analytics} />;
        case 'Watch Style':
            return <WatchStyleSection analytics={analytics} />;
        case 'Streaming Habit':
            return <StreamingHabitSection analytics={analytics} />;
        default:
            return null;
    }
});
