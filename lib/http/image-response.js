export const readImageResponse = async (response, { maxBytes = 5 * 1024 * 1024, source = 'Image source', fallbackContentType = '' } = {}) => {
    if (!response?.ok) throw new Error(`${source} returned HTTP ${response?.status || 502}`);
    const contentType = String(response.headers?.get?.('content-type') || fallbackContentType).split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error(`${source} returned non-image content`);
    const declaredBytes = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new Error(`${source} image is too large`);
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > maxBytes) throw new Error(`${source} image is empty or too large`);
    return { body, contentType };
};
