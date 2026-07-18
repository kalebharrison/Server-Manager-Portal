import { createClientId } from '../shared/id';

export const RULE_FIELDS = [
    { value: 'isTranscoding', label: 'Is Transcoding', type: 'bool' as const },
    { value: 'videoResolution', label: 'Video Resolution', type: 'select' as const, options: ['4k', '1080', '720', '480', 'sd'] },
    { value: 'transcodeVideoDecision', label: 'Transcode Decision', type: 'select' as const, options: ['transcode', 'copy', 'directplay'] },
    { value: 'mediaType', label: 'Media Type', type: 'select' as const, options: ['movie', 'episode', 'track'] },
    { value: 'state', label: 'Playback State', type: 'select' as const, options: ['playing', 'paused', 'buffering'] },
    { value: 'sessionLocation', label: 'Connection Location', type: 'select' as const, options: ['lan', 'wan', 'cellular'] },
    { value: 'videoCodec', label: 'Video Codec', type: 'text' as const },
    { value: 'audioCodec', label: 'Audio Codec', type: 'text' as const },
    { value: 'bandwidth', label: 'Bandwidth (Mbps)', type: 'number' as const },
    { value: 'user', label: 'Username', type: 'text' as const },
    { value: 'playerProduct', label: 'Player App', type: 'text' as const },
    { value: 'playerTitle', label: 'Player/Device Name', type: 'text' as const },
];

export const KR_OP_TEXT = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: "doesn't contain" },
];
export const KR_OP_NUMBER = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
];
export const KR_OP_BOOL = [{ value: 'equals', label: 'is' }];
export const KR_OP_SELECT = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
];

export function krGetOps(field: any) {
    if (!field) return KR_OP_TEXT;
    if (field.type === 'bool') return KR_OP_BOOL;
    if (field.type === 'number') return KR_OP_NUMBER;
    if (field.type === 'select') return KR_OP_SELECT;
    return KR_OP_TEXT;
}

export function krMkCond() {
    return { id: createClientId(), field: 'isTranscoding', operator: 'equals', value: 'true' };
}

export function krMkRule(): any {
    return {
        id: Date.now().toString(),
        name: 'New Rule',
        enabled: true,
        conditionLogic: 'AND',
        conditions: [krMkCond()],
        killMessage: 'Your stream has been stopped by the server administrator.',
    };
}
