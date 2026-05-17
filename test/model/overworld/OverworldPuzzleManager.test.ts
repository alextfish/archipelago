import { beforeEach, describe, expect, it } from 'vitest';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import type { TiledMapData } from '@model/overworld/MapPuzzleExtractor';

describe('OverworldPuzzleManager', () => {
    let tiledMapData: TiledMapData;

    beforeEach(() => {
        tiledMapData = {
            width: 5,
            height: 5,
            tilewidth: 32,
            tileheight: 32,
            layers: [
                {
                    name: 'ground',
                    type: 'tilelayer',
                    width: 5,
                    height: 5,
                    visible: true,
                    opacity: 1,
                    data: [
                        6, 0, 6, 0, 0,
                        0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0,
                    ],
                },
                {
                    name: 'puzzles',
                    type: 'objectgroup',
                    visible: true,
                    opacity: 1,
                    objects: [
                        {
                            id: 1,
                            name: 'cave_puzzle',
                            type: 'puzzle',
                            x: 0,
                            y: 0,
                            width: 96,
                            height: 32,
                            visible: true,
                            rotation: 0,
                            properties: [],
                        },
                    ],
                },
            ],
        };
    });

    it('should prefix extracted puzzle IDs when a namespace is configured', () => {
        const manager = new OverworldPuzzleManager(defaultTileConfig, 'interior:journalcave');

        const puzzles = manager.loadPuzzlesFromMap(tiledMapData);
        const puzzle = puzzles.get('interior:journalcave:cave_puzzle');

        expect(puzzle).toBeDefined();
        expect(puzzle?.id).toBe('interior:journalcave:cave_puzzle');
        expect(manager.getPuzzleById('cave_puzzle')).toBeNull();
    });

    it('should index namespaced puzzles for bounds and spatial lookup', () => {
        const manager = new OverworldPuzzleManager(defaultTileConfig, 'interior:journalcave');

        manager.loadPuzzlesFromMap(tiledMapData);

        expect(manager.getPuzzleDefinitionById('interior:journalcave:cave_puzzle')?.id)
            .toBe('interior:journalcave:cave_puzzle');
        expect(manager.getPuzzleBounds('interior:journalcave:cave_puzzle')).toEqual({
            x: 0,
            y: 0,
            width: 96,
            height: 32,
        });
        expect(manager.getPuzzleAtTilePosition(0, 0)?.id).toBe('interior:journalcave:cave_puzzle');
        expect(manager.getPuzzleAtPosition(16, 16, tiledMapData)?.id).toBe('interior:journalcave:cave_puzzle');
    });
});