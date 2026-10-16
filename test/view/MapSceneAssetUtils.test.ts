import { describe, expect, it } from 'vitest';
import {
    areTilesetTexturesReady,
    findMapLayersBySuffix,
    getConstraintDisguiseImageLoadRequests,
    getTilesetTextureKey,
    getTilesetImageLoadRequests,
    resolveTilesetImagePath,
    shouldAutoRenderLayer,
    shouldRenderLayerAbovePlayer,
} from '@view/MapSceneAssetUtils';

describe('MapSceneAssetUtils', () => {
    describe('getTilesetTextureKey', () => {
        it('uses explicit keys for known external tilesets', () => {
            expect(getTilesetTextureKey('beach')).toBe('beachTileset');
            expect(getTilesetTextureKey('SproutLandsGrassIslands')).toBe('grassTileset');
        });

        it('falls back to the embedded tileset naming convention', () => {
            expect(getTilesetTextureKey('cavewalls')).toBe('tileset_cavewalls');
        });
    });

    describe('resolveTilesetImagePath', () => {
        it('leaves data URLs and web URLs unchanged', () => {
            expect(resolveTilesetImagePath('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
            expect(resolveTilesetImagePath('https://example.com/tile.png')).toBe('https://example.com/tile.png');
        });

        it('normalises known repo-relative path styles', () => {
            expect(resolveTilesetImagePath('resources/tilesets/beach.png')).toBe('resources/tilesets/beach.png');
            expect(resolveTilesetImagePath('../tilesets/cave.png')).toBe('resources/tilesets/cave.png');
            expect(resolveTilesetImagePath('tilesets/cave.png')).toBe('resources/tilesets/cave.png');
            expect(resolveTilesetImagePath('sprites/sign.png')).toBe('resources/sprites/sign.png');
            expect(resolveTilesetImagePath('plain.png')).toBe('resources/tilesets/plain.png');
        });
    });

    describe('findMapLayersBySuffix', () => {
        it('finds matching layers regardless of grouped path prefix', () => {
            const layers = [
                { name: 'Beach/collision' },
                { name: 'Forest/roofs' },
                { name: 'npcs' },
            ];

            expect(findMapLayersBySuffix(layers, 'collision')).toEqual([{ name: 'Beach/collision' }]);
            expect(findMapLayersBySuffix(layers, 'roofs')).toEqual([{ name: 'Forest/roofs' }]);
        });
    });

    describe('getTilesetImageLoadRequests', () => {
        it('returns unresolved image loads for missing textures', () => {
            const requests = getTilesetImageLoadRequests(
                [
                    { name: 'beach', image: 'resources/tilesets/beach.png' },
                    { name: 'cavewalls', image: '../tilesets/cave.png' },
                ],
                (textureKey) => textureKey === 'beachTileset',
            );

            expect(requests).toEqual([
                {
                    textureKey: 'tileset_cavewalls',
                    imagePath: 'resources/tilesets/cave.png',
                },
            ]);
        });

        it('supports skipping already-preloaded resource-prefixed tilesets', () => {
            const requests = getTilesetImageLoadRequests(
                [
                    { name: 'beach', image: 'resources/tilesets/beach.png' },
                    { name: 'embedded', image: 'tilesets/cave.png' },
                ],
                () => false,
                { skipResourcePrefixedImages: true },
            );

            expect(requests).toEqual([
                {
                    textureKey: 'tileset_embedded',
                    imagePath: 'resources/tilesets/cave.png',
                },
            ]);
        });
    });

    describe('getConstraintDisguiseImageLoadRequests', () => {
        it('collects unique disguise sprite requests from nested constraint object layers', () => {
            const requests = getConstraintDisguiseImageLoadRequests(
                {
                    layers: [
                        {
                            type: 'group',
                            layers: [
                                {
                                    type: 'objectgroup',
                                    objects: [
                                        {
                                            properties: [
                                                { name: 'constraint', value: 'true' },
                                                { name: 'disguise_sprite', value: 'Cultist-1' },
                                                { name: 'disguise_sprite_solved', value: 'Cultist-1-Ruby' },
                                            ],
                                        },
                                        {
                                            properties: [
                                                { name: 'constraint', value: true },
                                                { name: 'disguise_sprite', value: 'Cultist-1' },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
                (textureKey) => textureKey === 'Cultist-1-Ruby',
            );

            expect(requests).toEqual([
                {
                    textureKey: 'Cultist-1',
                    imagePath: 'resources/sprites/Cultist-1.png',
                },
            ]);
        });
    });

    describe('areTilesetTexturesReady', () => {
        it('returns true only when every image-backed tileset texture exists', () => {
            expect(areTilesetTexturesReady(
                [
                    { name: 'beach', image: 'resources/tilesets/beach.png' },
                    { name: 'collection' },
                ],
                (textureKey) => textureKey === 'beachTileset',
            )).toBe(true);

            expect(areTilesetTexturesReady(
                [
                    { name: 'beach', image: 'resources/tilesets/beach.png' },
                    { name: 'embedded', image: 'tilesets/cave.png' },
                ],
                (textureKey) => textureKey === 'beachTileset',
            )).toBe(false);
        });
    });

    describe('shouldAutoRenderLayer', () => {
        it('renders ordinary layers with autoRender=true', () => {
            expect(shouldAutoRenderLayer({
                name: 'Beach/ground',
                properties: [{ name: 'autoRender', value: true }],
            })).toBe(true);
        });

        it('skips collision, roof, and explicitly skipped layers', () => {
            expect(shouldAutoRenderLayer({
                name: 'Beach/collision',
                properties: [{ name: 'autoRender', value: true }],
            })).toBe(false);

            expect(shouldAutoRenderLayer({
                name: 'Beach/roofs',
                properties: [{ name: 'autoRender', value: true }],
            })).toBe(false);

            expect(shouldAutoRenderLayer(
                {
                    name: 'bridges',
                    properties: [{ name: 'autoRender', value: true }],
                },
                { skippedLayerNames: ['bridges'] },
            )).toBe(false);
        });
    });

    describe('shouldRenderLayerAbovePlayer', () => {
        it('reads the renderAbovePlayer flag from layer properties', () => {
            expect(shouldRenderLayerAbovePlayer({
                properties: [{ name: 'renderAbovePlayer', value: true }],
            })).toBe(true);

            expect(shouldRenderLayerAbovePlayer({
                properties: [{ name: 'renderAbovePlayer', value: false }],
            })).toBe(false);
        });
    });
});
