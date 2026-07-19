export const postDiscordWebhook = async (webhookUrl, { content, embeds } = {}, { fetchImpl = fetch, log } = {}) => {
    const url = String(webhookUrl || '').trim();
    if (!url) return false;
    const body = {};
    if (content) body.content = String(content).slice(0, 1900);
    if (Array.isArray(embeds) && embeds.length) body.embeds = embeds.slice(0, 10);
    if (!body.content && !body.embeds?.length) return false;

    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            log?.(`Discord webhook failed: HTTP ${response.status}`);
            return false;
        }
        return true;
    } catch (error) {
        log?.(`Discord webhook failed: ${error.message}`);
        return false;
    }
};

export const discordEmbed = ({ title, description, color = 0xe5a00d, fields = [] }) => ({
    title: String(title || '').slice(0, 256),
    description: String(description || '').slice(0, 4000),
    color,
    fields: fields.slice(0, 25).map((field) => ({
        name: String(field.name || '').slice(0, 256),
        value: String(field.value || '').slice(0, 1024),
        inline: !!field.inline,
    })),
    timestamp: new Date().toISOString(),
});
