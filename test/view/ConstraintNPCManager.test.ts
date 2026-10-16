import { describe, it, expect, vi } from 'vitest';
import { ConstraintNPCManager } from '@view/ConstraintNPCManager';

vi.mock('@helpers/TestMarkers', () => ({
    attachTestMarker: vi.fn(() => null),
    isTestMode: vi.fn(() => false),
}));

describe('ConstraintNPCManager disguise switching', () => {
    it('applies solved and normal disguise textures based on puzzle completion', () => {
        const manager = new ConstraintNPCManager(
            {} as any,
            { getAllPuzzles: () => new Map() } as any,
            {} as any,
            {
                isPuzzleCompleted: vi.fn((puzzleId: string) => puzzleId === 'puzzle-a'),
            } as any,
            {} as any,
            {},
            () => {},
            () => false,
            () => {},
        );

        const sprite = {
            setVisible: vi.fn(),
            setTexture: vi.fn(),
        };

        (manager as any).constraintNPCSprites.set('constraint-puzzle-a-MyConstraint-A', sprite);
        (manager as any).constraintDisguiseKeys.set('constraint-puzzle-a-MyConstraint-A', {
            normalKey: 'cultist_hidden',
            solvedKey: 'cultist_revealed',
        });

        manager.showConstraintNPCsForPuzzle('puzzle-a');

        expect(sprite.setVisible).toHaveBeenCalledWith(true);
        expect(sprite.setTexture).toHaveBeenCalledWith('cultist_revealed');

        sprite.setVisible.mockClear();
        sprite.setTexture.mockClear();

        manager.showConstraintNPCsForPuzzle('puzzle-b');

        expect(sprite.setVisible).not.toHaveBeenCalled();
        expect(sprite.setTexture).not.toHaveBeenCalled();

        manager.showConstraintNPCsForPuzzle('puzzle-a');
        (manager as any).gameState.isPuzzleCompleted = vi.fn(() => false);
        manager.showConstraintNPCsForPuzzle('puzzle-a');

        expect(sprite.setTexture).toHaveBeenLastCalledWith('cultist_hidden');
    });

    it('uses the solved disguise immediately when loading an already-completed puzzle', () => {
        const sprite = {
            setOrigin: vi.fn().mockReturnThis(),
            setDepth: vi.fn().mockReturnThis(),
            setTexture: vi.fn(),
        };
        const addNPC = vi.fn();
        const addInteractable = vi.fn();

        const manager = new ConstraintNPCManager(
            {
                add: { sprite: vi.fn(() => sprite) },
                textures: { exists: vi.fn(() => false) },
            } as any,
            {
                getAllPuzzles: () => new Map([[
                    'interior:house:puzzle-a',
                    {
                        constraints: [{
                            personified: true,
                            constructor: { name: 'MyConstraint' },
                            getDisplayItems: () => [{
                                position: { x: 1, y: 2 },
                                elementID: 'A',
                                disguiseSpriteKey: 'cultist_hidden',
                                disguiseSpriteSolvedKey: 'cultist_revealed',
                                constraintType: 'mystic',
                            }],
                        }],
                        islands: [],
                    },
                ]]),
                getPuzzleDefinitionById: () => ({
                    bounds: { x: 64, y: 96, width: 96, height: 96 },
                }),
            } as any,
            {
                worldToGrid: vi.fn(() => ({ x: 2, y: 3 })),
                gridToWorld: vi.fn((x: number, y: number) => ({ x: x * 32, y: y * 32 })),
            } as any,
            {
                isPuzzleCompleted: vi.fn((puzzleId: string) => puzzleId === 'interior:house:puzzle-a'),
            } as any,
            {} as any,
            { tilewidth: 32, tileheight: 32 },
            addNPC,
            () => false,
            addInteractable,
        );

        manager.loadConstraintNPCs();

        expect(addNPC).toHaveBeenCalledOnce();
        expect(addInteractable).toHaveBeenCalledOnce();
        expect(sprite.setTexture).toHaveBeenCalledWith('cultist_revealed');
    });
});
