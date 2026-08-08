const extractText = (raw) => {
    const normalized = String(raw || '').replace(/\r\n/g, '\n');
    const plain = normalized.match(
        /Content-Type:\s*text\/plain(?:;[^\n]*)?\n(?:Content-[^\n]+\n)*\n([\s\S]*?)(?:\n--|\nContent-Type:|$)/i,
    );
    let body = plain ? plain[1] : '';
    if (!body) {
        const idx = normalized.search(/\n\n/);
        body = idx >= 0 ? normalized.slice(idx + 2) : normalized;
    }
    return body.replace(/=\n/g, '').trim().slice(0, 20000);
};

export default {
    async email(message, env) {
        const raw = await new Response(message.raw).text();
        const payload = {
            Sender: message.from,
            Recipient: message.to,
            From: message.headers.get('From') || message.from,
            To: message.headers.get('To') || message.to,
            Subject: message.headers.get('Subject') || '',
            'Text-part': extractText(raw),
            Headers: {
                'Message-ID': message.headers.get('Message-ID') || '',
                To: message.headers.get('To') || message.to,
            },
        };
        const res = await fetch(env.PORTAL_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`portal webhook ${res.status}: ${text.slice(0, 200)}`);
        }
    },
};
