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

export const discordEmbed = ({
    title,
    description,
    color = 0xe5a00d,
    fields = [],
    thumbnail,
    image,
    footer,
    url,
} = {}) => {
    const embed = {
        title: String(title || '').slice(0, 256),
        color,
        fields: fields.slice(0, 25).map((field) => ({
            name: String(field.name || '').slice(0, 256),
            value: String(field.value || '').slice(0, 1024),
            inline: !!field.inline,
        })),
        timestamp: new Date().toISOString(),
    };
    const desc = String(description || '').trim();
    if (desc) embed.description = desc.slice(0, 4000);
    const thumb = String(thumbnail || '').trim();
    if (/^https:\/\//i.test(thumb)) embed.thumbnail = { url: thumb };
    const hero = String(image || '').trim();
    if (/^https:\/\//i.test(hero)) embed.image = { url: hero };
    const foot = String(footer || '').trim();
    if (foot) embed.footer = { text: foot.slice(0, 2048) };
    const link = String(url || '').trim();
    if (/^https:\/\//i.test(link)) embed.url = link;
    return embed;
};
