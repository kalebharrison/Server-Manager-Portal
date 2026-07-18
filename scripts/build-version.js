import fs from 'fs';
import { execSync } from 'child_process';

const normalizeSha = (sha, pkgVersion) => {
    if (!sha) return '';
    const trimmed = String(sha).trim();
    const prefixRegex = new RegExp(`^v${pkgVersion.replace(/\./g, '\\.')}-`, 'i');
    const withoutPrefix = trimmed.replace(prefixRegex, '');
    return withoutPrefix.slice(0, 7);
};

const resolveBuildVersion = (pkgVersion) => {
    const fromEnv = normalizeSha(process.env.GIT_SHA || process.env.GITHUB_SHA || '', pkgVersion);
    if (fromEnv) return fromEnv;

    try {
        return execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
    } catch {
        return `build-${Date.now()}`;
    }
};

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const pkgVersion = pkg.version;
const hasExplicitSha = Boolean(process.env.GIT_SHA || process.env.GITHUB_SHA);

if (!hasExplicitSha) {
    console.log('Skipping version stamp; set GIT_SHA or GITHUB_SHA to stamp assets.');
    process.exit(0);
}

const assetVersion = resolveBuildVersion(pkgVersion);

const isTag = process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/');
const finalVersion = isTag ? `v${pkgVersion}` : `v${pkgVersion}-${assetVersion}`;

fs.writeFileSync('version.txt', finalVersion);

try {
    const indexPath = 'client/index.html';
    const html = fs.readFileSync(indexPath, 'utf8');
    const stamped = html
        .replace(/(?:\/)?static\/tailwind\.css\?v=[^"']+/g, `static/tailwind.css?v=${assetVersion}`)
        .replace(/(?:\/)?static\/bundle\.js\?v=[^"']+/g, `static/bundle.js?v=${assetVersion}`);
    fs.writeFileSync(indexPath, stamped);
} catch (e) {
    console.warn('Could not stamp client/index.html asset versions:', e.message);
}
