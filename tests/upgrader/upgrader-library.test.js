import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyUpgraderLibrary,
    friendlyLibraryName,
    humanizeRootLabel,
    librariesForArrInstance,
    slugifyRootPath,
} from '../../lib/upgrader/upgrader-library.js';

test('humanizeRootLabel and slugifyRootPath from arbitrary folders', () => {
    assert.equal(humanizeRootLabel('/media/current/anime.movies'), 'Anime Movies');
    assert.equal(slugifyRootPath('/media/current/anime.movies'), 'anime-movies');
    assert.equal(humanizeRootLabel('/data/tv_shows'), 'Tv Shows');
    assert.equal(slugifyRootPath('/data/tv_shows'), 'tv-shows');
});

test('single root keeps instance name as library label', () => {
    const instance = {
        id: 'radarr-1',
        type: 'radarr',
        name: 'Radarr',
        activeDirectory: '/media/movies',
    };
    const result = classifyUpgraderLibrary(instance, { path: '/media/movies/Foo' });
    assert.equal(result.libraryKey, 'radarr:radarr-1:movies');
    assert.equal(result.libraryName, 'Radarr');
});

test('two roots on one Radarr split by path basename labels', () => {
    const instance = {
        id: 'radarr-1',
        type: 'radarr',
        name: 'Radarr',
        activeDirectory: '/media/current/movies',
        activeAnimeDirectory: '/media/current/anime.movies',
        animeTags: [9],
    };
    const main = classifyUpgraderLibrary(instance, { path: '/media/current/movies/Alien' });
    const anime = classifyUpgraderLibrary(instance, { path: '/media/current/anime.movies/Akira' });
    assert.equal(main.libraryKey, 'radarr:radarr-1:movies');
    assert.equal(main.libraryName, 'Movies');
    assert.equal(anime.libraryKey, 'radarr:radarr-1:anime-movies');
    assert.equal(anime.libraryName, 'Anime Movies');
});

test('anime tag fallback when path missing', () => {
    const instance = {
        id: 'sonarr-1',
        type: 'sonarr',
        name: 'Sonarr',
        activeDirectory: '/media/tv.shows',
        activeAnimeDirectory: '/media/anime.shows',
        animeTags: [36],
    };
    const tagged = classifyUpgraderLibrary(instance, { tags: [36, 1] });
    const untagged = classifyUpgraderLibrary(instance, { tags: [1] });
    assert.equal(tagged.libraryName, 'Anime Shows');
    assert.equal(tagged.libraryKey, 'sonarr:sonarr-1:anime-shows');
    assert.equal(untagged.libraryName, 'Tv Shows');
    assert.equal(untagged.libraryKey, 'sonarr:sonarr-1:tv-shows');
});

test('librariesForArrInstance lists one entry per configured root', () => {
    const split = librariesForArrInstance({
        id: 'r1',
        type: 'radarr',
        name: 'Radarr',
        activeDirectory: '/media/movies',
        activeAnimeDirectory: '/media/anime.movies',
    });
    assert.equal(split.length, 2);
    assert.deepEqual(split.map((entry) => entry.name), ['Movies', 'Anime Movies']);

    const single = librariesForArrInstance({
        id: 'r2',
        type: 'radarr',
        name: 'Radarr Main',
        activeDirectory: '/media/movies',
    });
    assert.equal(single.length, 1);
    assert.equal(single[0].name, 'Radarr Main');
});

test('Lidarr always labels as Music', () => {
    assert.equal(friendlyLibraryName({ type: 'lidarr', name: 'Lidarr' }), 'Music');
    assert.equal(friendlyLibraryName({ type: 'lidarr', name: 'Artists' }, 'Artists'), 'Music');
    assert.equal(friendlyLibraryName({ type: 'lidarr', name: 'Jazz Vault' }), 'Music');

    const libs = librariesForArrInstance({
        id: 'l1',
        type: 'lidarr',
        name: 'Artists',
        activeDirectory: '/media/artists',
    });
    assert.equal(libs.length, 1);
    assert.equal(libs[0].name, 'Music');
});
