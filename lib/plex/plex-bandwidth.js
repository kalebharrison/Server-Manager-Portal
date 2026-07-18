export const normalizePlexBandwidthKbps = (raw) => {
    const value = Number(raw) || 0;
    if (!value) return 0;
    return value > 500_000 ? Math.round(value / 1000) : Math.round(value);
};
