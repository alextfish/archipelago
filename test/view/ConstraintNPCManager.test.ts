import { describe, it, expect, vi } from 'vitest';
import { ConstraintNPCManager } from '@view/ConstraintNPCManager';

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
});
