import { describe, expect, it } from 'vitest';
import { OverworldWaterPaddingGenerator } from '@model/overworld/OverworldWaterPaddingGenerator';

describe('OverworldWaterPaddingGenerator', () => {
    it('pads map dimensions, shifts existing content, and adds a generated water layer', () => {
        const mapData: any = {
            width: 2,
            height: 2,
            tilewidth: 32,
            tileheight: 32,
            layers: [
                {
                    id: 1,
                    name: 'ground',
                    type: 'tilelayer',
                    width: 2,
                    height: 2,
                    data: [1, 2, 3, 4],
                },
                {
                    id: 2,
                    name: 'spawns',
                    type: 'objectgroup',
                    objects: [{ id: 100, x: 0, y: 0 }],
                },
            ],
        };

        const changed = OverworldWaterPaddingGenerator.apply(mapData, {
            paddingTiles: 1,
            waterTileIDs: [9],
        });

        expect(changed).toBe(true);
        expect(mapData.width).toBe(4);
        expect(mapData.height).toBe(4);

        const groundLayer = mapData.layers.find((l: any) => l.name === 'ground');
        expect(groundLayer.width).toBe(4);
        expect(groundLayer.height).toBe(4);
        expect(groundLayer.data).toEqual([
            0, 0, 0, 0,
            0, 1, 2, 0,
            0, 3, 4, 0,
            0, 0, 0, 0,
        ]);

        const spawnsLayer = mapData.layers.find((l: any) => l.name === 'spawns');
        expect(spawnsLayer.objects[0].x).toBe(32);
        expect(spawnsLayer.objects[0].y).toBe(32);

        const waterLayer = mapData.layers.find((l: any) => l.name === 'generated/water');
        expect(waterLayer).toBeDefined();
        expect(waterLayer.data).toEqual([
            9, 9, 9, 9,
            9, 0, 0, 9,
            9, 0, 0, 9,
            9, 9, 9, 9,
        ]);

        const autoRenderProp = waterLayer.properties.find((p: any) => p.name === 'autoRender');
        expect(autoRenderProp?.value).toBe(true);
    });

    it('is idempotent when called multiple times on the same map object', () => {
        const mapData: any = {
            width: 1,
            height: 1,
            tilewidth: 32,
            tileheight: 32,
            layers: [
                { id: 1, name: 'ground', type: 'tilelayer', width: 1, height: 1, data: [5] },
            ],
        };

        const first = OverworldWaterPaddingGenerator.apply(mapData, { paddingTiles: 1, waterTileIDs: [7] });
        const layerCountAfterFirst = mapData.layers.length;
        const second = OverworldWaterPaddingGenerator.apply(mapData, { paddingTiles: 1, waterTileIDs: [7] });

        expect(first).toBe(true);
        expect(second).toBe(false);
        expect(mapData.layers.length).toBe(layerCountAfterFirst);
        expect(mapData.width).toBe(3);
        expect(mapData.height).toBe(3);
    });

    it('does not re-apply when map is already marked as padded', () => {
        const mapData: any = {
            width: 10,
            height: 10,
            tilewidth: 32,
            tileheight: 32,
            properties: [{ name: 'generatedWaterPadding', type: 'bool', value: true }],
            layers: [
                { id: 1, name: 'ground', type: 'tilelayer', width: 10, height: 10, data: new Array(100).fill(0) },
            ],
        };

        const changed = OverworldWaterPaddingGenerator.apply(mapData);
        expect(changed).toBe(false);
        expect(mapData.width).toBe(10);
        expect(mapData.height).toBe(10);
        expect(mapData.layers).toHaveLength(1);
    });
});
