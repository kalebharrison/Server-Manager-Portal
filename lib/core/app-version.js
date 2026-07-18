import { execSync } from 'child_process';
import fsSync from 'fs';

export const resolveAppVersion = () => {
    let pkgVersion = '1.0.0';
    try {
        const pkg = JSON.parse(fsSync.readFileSync('package.json', 'utf8'));
        if (pkg?.version) pkgVersion = String(pkg.version);
    } catch {
        // package metadata may be absent in unusual deployments
    }

    try {
        const stamped = fsSync.readFileSync('version.txt', 'utf8').trim();
        const expectedPrefix = `v${pkgVersion}`;
        if (stamped === expectedPrefix || stamped.startsWith(`${expectedPrefix}-`)) {
            return stamped;
        }
    } catch {
        // version.txt is optional; fall back to package.json plus commit hash
    }

    const isTagBuild = String(process.env.GITHUB_REF || '').startsWith('refs/tags/');
    try {
        const gitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
        return isTagBuild ? `v${pkgVersion}` : `v${pkgVersion}-${gitHash}`;
    } catch {
        return `v${pkgVersion}`;
    }
};
