import { describe, expect, it, vi } from 'vitest';
import { OverworldScene } from '@view/scenes/OverworldScene';
import { InteriorScene } from '@view/scenes/InteriorScene';

describe('scene NPC layer loading', () => {
    it('passes grouped overworld NPC layer offsets into the sprite controller', () => {
        const groupedLayer = { objects: [] };
        const loadNPCsFromLayerWithOffset = vi.fn();
        const scene = Object.create(OverworldScene.prototype) as any;

        scene.map = {
            getObjectLayer: vi.fn((name: string) => name === 'Town/Market/npcs' ? groupedLayer : null),
        };
        scene.npcSpriteController = {
            loadNPCsFromLayerWithOffset,
        };

        scene.loadNPCLayers([
            {
                name: 'npcs',
                fullPath: 'Town/Market/npcs',
                offsetX: 64,
                offsetY: 96,
                data: {},
            },
        ]);

        expect(loadNPCsFromLayerWithOffset).toHaveBeenCalledWith(
            groupedLayer,
            'Town/Market/npcs',
            64,
            96,
        );
    });

    it('passes grouped interior NPC layer offsets into the sprite controller', () => {
        const groupedLayer = { objects: [] };
        const loadNPCsFromLayerWithOffset = vi.fn();
        const scene = Object.create(InteriorScene.prototype) as any;

        scene.map = {
            getObjectLayer: vi.fn((name: string) => name === 'House/BackRoom/npcs' ? groupedLayer : null),
        };
        scene.npcSpriteController = {
            loadNPCsFromLayerWithOffset,
        };

        scene.loadNPCLayers([
            {
                name: 'npcs',
                fullPath: 'House/BackRoom/npcs',
                offsetX: 32,
                offsetY: 160,
                data: {},
            },
        ]);

        expect(loadNPCsFromLayerWithOffset).toHaveBeenCalledWith(
            groupedLayer,
            'House/BackRoom/npcs',
            32,
            160,
        );
    });
});
