import { describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import { RoofManager } from '@view/RoofManager';

class MockPolygon {
    points: { x: number; y: number }[];

    constructor(points: { x: number; y: number }[]) {
        this.points = points;
    }

    contains(x: number, y: number): boolean {
        const bounds = MockPolygon.GetAABB(this);
        return x >= bounds.x
            && x <= bounds.x + bounds.width
            && y >= bounds.y
            && y <= bounds.y + bounds.height;
    }

    static GetAABB(polygon: MockPolygon): { x: number; y: number; width: number; height: number } {
        const xs = polygon.points.map((point) => point.x);
        const ys = polygon.points.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
}

describe('RoofManager', () => {
    it('creates hide zones from rectangular Tiled objects and hides matching roof tiles', () => {
        (Phaser as unknown as { Geom: { Polygon: typeof MockPolygon } }).Geom = {
            Polygon: MockPolygon
        };

        const tweenAdd = vi.fn(({ targets, alpha }: { targets: { alpha: number }; alpha: number }) => {
            targets.alpha = alpha;
            return {
                stop: vi.fn()
            };
        });

        const scene = {
            tweens: {
                add: tweenAdd
            }
        } as unknown as Phaser.Scene;

        const roofTileA = { alpha: 1 };
        const roofTileB = { alpha: 1 };
        const roofLayer = {
            getTileAt: (tileX: number, tileY: number) => {
                if (tileX === 1 && tileY === 2) {
                    return roofTileA;
                }

                if (tileX === 2 && tileY === 2) {
                    return roofTileB;
                }

                return null;
            }
        };

        const map = {
            tileWidth: 32,
            tileHeight: 32
        } as Phaser.Tilemaps.Tilemap;

        const tiledMapData = {
            layers: [
                {
                    type: 'objectgroup',
                    name: 'roof hide zones',
                    objects: [
                        {
                            id: 1,
                            name: 'roof waterfall cave',
                            x: 32,
                            y: 64,
                            width: 64,
                            height: 32
                        }
                    ]
                }
            ]
        };

        const manager = new RoofManager(scene);
        manager.initialize(map, roofLayer as unknown as Phaser.Tilemaps.TilemapLayer, tiledMapData);

        expect((manager as any).hideZones).toHaveLength(1);

        manager.update(48, 80);

        expect(tweenAdd).toHaveBeenCalledTimes(2);
        expect(roofTileA.alpha).toBe(0);
        expect(roofTileB.alpha).toBe(0);
    });
});