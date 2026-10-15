import { describe, expect, it } from 'vitest';
import {
    createHiddenLayersBySuffix,
    createOverheadLayersBySuffix,
    createVisualLayers,
    loadMapTilesets,
} from '@view/MapSceneLayerUtils';

class FakeLayer {
    public alpha = 1;
    public depth = 0;

    setAlpha(alpha: number): this {
        this.alpha = alpha;
        return this;
    }

    setDepth(depth: number): this {
        this.depth = depth;
        return this;
    }
}

describe('MapSceneLayerUtils', () => {
    describe('loadMapTilesets', () => {
        it('returns texture keys and attached tilesets for each tileset name', () => {
            const attachments = loadMapTilesets(
                [
                    { name: 'beach' },
                    { name: 'cavewalls' },
                ],
                (tilesetName: string, textureKey: string) => `${tilesetName}:${textureKey}`,
            );

            expect(attachments).toEqual([
                {
                    name: 'beach',
                    textureKey: 'beachTileset',
                    tileset: 'beach:beachTileset',
                },
                {
                    name: 'cavewalls',
                    textureKey: 'tileset_cavewalls',
                    tileset: 'cavewalls:tileset_cavewalls',
                },
            ]);
        });
    });

    describe('createVisualLayers', () => {
        it('creates auto-render layers and lifts overhead layers above the player', () => {
            const created = new Map<string, FakeLayer>();
            const result = createVisualLayers(
                [
                    { name: 'ground', properties: [{ name: 'autoRender', value: true }] },
                    {
                        name: 'upper/canopy',
                        properties: [
                            { name: 'autoRender', value: true },
                            { name: 'renderAbovePlayer', value: true },
                        ],
                    },
                    { name: 'bridges', properties: [{ name: 'autoRender', value: true }] },
                    { name: 'building/collision' },
                ],
                (layerName: string) => {
                    const layer = new FakeLayer();
                    created.set(layerName, layer);
                    return layer;
                },
                [],
                {
                    overheadLayerDepth: 100_000,
                    skippedLayerNames: ['bridges'],
                },
            );

            expect(result.createdLayerNames).toEqual(['ground', 'upper/canopy']);
            expect(result.failedLayerNames).toEqual([]);
            expect(created.get('ground')?.depth).toBe(0);
            expect(created.get('upper/canopy')?.depth).toBe(100_000);
        });

        it('records visual layers that fail to create', () => {
            const result = createVisualLayers(
                [{ name: 'foreground', properties: [{ name: 'autoRender', value: true }] }],
                () => null,
                [],
                { overheadLayerDepth: 100_000 },
            );

            expect(result.createdLayerNames).toEqual([]);
            expect(result.failedLayerNames).toEqual(['foreground']);
        });
    });

    describe('createHiddenLayersBySuffix', () => {
        it('creates matching layers and hides them', () => {
            const created = new Map<string, FakeLayer>();
            const result = createHiddenLayersBySuffix(
                [
                    { name: 'walls/collision' },
                    { name: 'roof/roofs' },
                ],
                (layerName: string) => {
                    const layer = new FakeLayer();
                    created.set(layerName, layer);
                    return layer;
                },
                [],
                'collision',
            );

            expect(result.createdLayerNames).toEqual(['walls/collision']);
            expect(created.get('walls/collision')?.alpha).toBe(0);
        });
    });

    describe('createOverheadLayersBySuffix', () => {
        it('creates matching layers and assigns overhead depth', () => {
            const created = new Map<string, FakeLayer>();
            const result = createOverheadLayersBySuffix(
                [
                    { name: 'walls/collision' },
                    { name: 'building/roofs' },
                ],
                (layerName: string) => {
                    const layer = new FakeLayer();
                    created.set(layerName, layer);
                    return layer;
                },
                [],
                'roofs',
                100_000,
            );

            expect(result.createdLayerNames).toEqual(['building/roofs']);
            expect(created.get('building/roofs')?.depth).toBe(100_000);
        });
    });
});
