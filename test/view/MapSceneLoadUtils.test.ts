import { describe, expect, it, vi } from 'vitest';
import {
    areMapSceneTilesetsReady,
    prepareMapSceneData,
    queueMapSceneImageRequests,
} from '@view/MapSceneLoadUtils';

describe('MapSceneLoadUtils', () => {
    describe('prepareMapSceneData', () => {
        it('loads map data and derives any missing tileset image requests', async () => {
            const result = await prepareMapSceneData(
                'resources/interiors/shop.json',
                async () => ({
                    tilesets: [
                        { name: 'beach', image: 'resources/tilesets/beach.png' },
                        { name: 'embedded', image: 'tilesets/cave.png' },
                    ],
                }),
                (textureKey) => textureKey === 'beachTileset',
            );

            expect(result.mapData.tilesets).toHaveLength(2);
            expect(result.tilesetImageRequests).toEqual([
                {
                    textureKey: 'tileset_embedded',
                    imagePath: 'resources/tilesets/cave.png',
                },
            ]);
        });

        it('supports skipping resource-prefixed tilesets while preparing requests', async () => {
            const result = await prepareMapSceneData(
                'resources/overworld.json',
                async () => ({
                    tilesets: [
                        { name: 'beach', image: 'resources/tilesets/beach.png' },
                        { name: 'embedded', image: 'tilesets/cave.png' },
                    ],
                }),
                () => false,
                { skipResourcePrefixedImages: true },
            );

            expect(result.tilesetImageRequests).toEqual([
                {
                    textureKey: 'tileset_embedded',
                    imagePath: 'resources/tilesets/cave.png',
                },
            ]);
        });
    });

    describe('queueMapSceneImageRequests', () => {
        it('queues each request and starts the loader when idle', () => {
            const queueImage = vi.fn();
            const startLoader = vi.fn();

            queueMapSceneImageRequests(
                [
                    { textureKey: 'one', imagePath: 'path/one.png' },
                    { textureKey: 'two', imagePath: 'path/two.png' },
                ],
                queueImage,
                () => false,
                startLoader,
            );

            expect(queueImage).toHaveBeenNthCalledWith(1, 'one', 'path/one.png');
            expect(queueImage).toHaveBeenNthCalledWith(2, 'two', 'path/two.png');
            expect(startLoader).toHaveBeenCalledOnce();
        });

        it('does not start the loader when there is nothing to queue', () => {
            const queueImage = vi.fn();
            const startLoader = vi.fn();

            queueMapSceneImageRequests([], queueImage, () => false, startLoader);

            expect(queueImage).not.toHaveBeenCalled();
            expect(startLoader).not.toHaveBeenCalled();
        });
    });

    describe('areMapSceneTilesetsReady', () => {
        it('returns true only when every image-backed tileset texture exists', () => {
            expect(areMapSceneTilesetsReady(
                {
                    tilesets: [
                        { name: 'beach', image: 'resources/tilesets/beach.png' },
                        { name: 'collection' },
                    ],
                },
                (textureKey) => textureKey === 'beachTileset',
            )).toBe(true);

            expect(areMapSceneTilesetsReady(
                {
                    tilesets: [
                        { name: 'beach', image: 'resources/tilesets/beach.png' },
                        { name: 'embedded', image: 'tilesets/cave.png' },
                    ],
                },
                (textureKey) => textureKey === 'beachTileset',
            )).toBe(false);
        });
    });
});
