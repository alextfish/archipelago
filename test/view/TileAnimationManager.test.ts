import { describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { TileAnimationManager } from '@view/TileAnimationManager';

describe('TileAnimationManager', () => {
    it('advances all matching tile instances through their animation frames', () => {
        const animatedTileA = { index: 101 };
        const animatedTileB = { index: 101 };
        const staticTile = { index: 5 };

        const map = {
            layers: [
                {
                    data: [
                        [animatedTileA, staticTile],
                        [animatedTileB],
                    ],
                },
            ],
        } as unknown as Phaser.Tilemaps.Tilemap;

        const tilesets = [
            {
                firstgid: 100,
                tileData: {
                    1: {
                        animation: [
                            { tileid: 1, duration: 100 },
                            { tileid: 2, duration: 150 },
                        ],
                    },
                },
            },
        ] as unknown as Phaser.Tilemaps.Tileset[];

        const manager = new TileAnimationManager(map, tilesets);

        manager.update(99);
        expect(animatedTileA.index).toBe(101);
        expect(animatedTileB.index).toBe(101);
        expect(staticTile.index).toBe(5);

        manager.update(1);
        expect(animatedTileA.index).toBe(102);
        expect(animatedTileB.index).toBe(102);

        manager.update(150);
        expect(animatedTileA.index).toBe(101);
        expect(animatedTileB.index).toBe(101);
    });

    it('ignores animated tile definitions that do not appear in the map', () => {
        const map = {
            layers: [
                {
                    data: [
                        [{ index: 5 }],
                    ],
                },
            ],
        } as unknown as Phaser.Tilemaps.Tilemap;

        const tilesets = [
            {
                firstgid: 100,
                tileData: {
                    1: {
                        animation: [
                            { tileid: 1, duration: 100 },
                            { tileid: 2, duration: 100 },
                        ],
                    },
                },
            },
        ] as unknown as Phaser.Tilemaps.Tileset[];

        const manager = new TileAnimationManager(map, tilesets);

        expect(() => manager.update(100)).not.toThrow();
    });
});
