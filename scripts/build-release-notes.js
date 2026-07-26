import fs from 'fs';

const CHANGELOG_URL = 'https://github.com/kalebharrison/Server-Manager-Portal/blob/beta/docs/CHANGELOG.md';

const normalizeChangelog = (changelog) => changelog.replace(/\r\n/g, '\n');

const stripChangelogItem = (line) => (
    line
        .replace(/^\* /, '')
        .replace(/\s*\(\[[a-f0-9]+\]\([^)]+\)\)\s*$/i, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim()
);

const parseLatestRelease = (changelog) => {
    const normalized = normalizeChangelog(changelog);
    // Keep-a-Changelog: ## [1.2.3](...) (YYYY-MM-DD)  OR fork style: ## 1.2.3 (YYYY-MM-DD)
    const headerMatch = normalized.match(/^## (?:\[([\d.]+)\][^\n]*\(([^)]+)\)|([\d.]+)\s+\(([^)]+)\))/m);
    if (!headerMatch) return null;

    const version = headerMatch[1] || headerMatch[3];
    const date = (headerMatch[2] || headerMatch[4] || '').trim();
    const bodyStart = headerMatch.index + headerMatch[0].length;
    const rest = normalized.slice(bodyStart);
    const nextRel = rest.search(/\n## (?:\[|\d)/);
    const body = nextRel === -1 ? rest : rest.slice(0, nextRel);
    const sections = [];

    for (const part of body.split(/\n### /).map((chunk) => chunk.trim()).filter(Boolean)) {
        const lines = part.split('\n');
        const title = lines[0]?.trim();
        if (!title) continue;

        const items = lines
            .map((line) => line.trim())
            .filter((line) => line.startsWith('* '))
            .map((line) => stripChangelogItem(line))
            .filter(Boolean);

        if (items.length > 0) {
            sections.push({ title, items });
        }
    }

    return {
        version,
        date,
        title: `What's new in v${version}`,
        sections,
        changelogUrl: CHANGELOG_URL,
    };
};

const emptyNotes = () => ({
    version: null,
    date: null,
    title: "What's new",
    sections: [],
    changelogUrl: CHANGELOG_URL,
});

try {
    const changelogPath = fs.existsSync('docs/CHANGELOG.md') ? 'docs/CHANGELOG.md' : 'CHANGELOG.md';
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    const release = parseLatestRelease(changelog) || emptyNotes();
    fs.mkdirSync('static', { recursive: true });
    fs.writeFileSync('static/release-notes.json', `${JSON.stringify(release, null, 2)}\n`);
    console.log(`Wrote release notes for v${release.version || 'unknown'} (${release.sections.length} sections)`);
} catch (e) {
    console.warn('Could not build release notes:', e.message);
    fs.mkdirSync('static', { recursive: true });
    fs.writeFileSync('static/release-notes.json', `${JSON.stringify(emptyNotes(), null, 2)}\n`);
}
