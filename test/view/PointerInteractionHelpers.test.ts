import { describe, expect, it } from 'vitest';
import type { Interactable } from '@view/InteractionCursor';
import {
    findInteractableAtTile,
    findInteractableInRangeAtTile,
    isWithinInteractionRange,
} from '@view/PointerInteractionHelpers';

describe('PointerInteractionHelpers', () => {
    const interactables: Interactable[] = [
        { type: 'npc', tileX: 10, tileY: 10, data: { npcId: 'a' } },
        { type: 'puzzle', tileX: 11, tileY: 10, data: { puzzleId: 'p1' } },
    ];

    it('identifies tiles within immediate interaction range', () => {
        expect(isWithinInteractionRange(10, 10, 11, 10)).toBe(true);
        expect(isWithinInteractionRange(10, 10, 9, 9)).toBe(true);
        expect(isWithinInteractionRange(10, 10, 12, 10)).toBe(false);
    });

    it('finds an interactable exactly at a tile', () => {
        const target = findInteractableAtTile(interactables, 11, 10);
        expect(target?.type).toBe('puzzle');
        expect(target?.data?.puzzleId).toBe('p1');
    });

    it('returns undefined when no interactable is at the tile', () => {
        const target = findInteractableAtTile(interactables, 20, 20);
        expect(target).toBeUndefined();
    });

    it('returns clicked interactable only when tile is in range', () => {
        const inRangeTarget = findInteractableInRangeAtTile(interactables, 10, 10, 11, 10);

        expect(inRangeTarget?.type).toBe('puzzle');
        expect(inRangeTarget?.data?.puzzleId).toBe('p1');
    });

    it('returns undefined for out-of-range tiles even when interactables exist there', () => {
        const target = findInteractableInRangeAtTile(interactables, 7, 7, 10, 10);
        expect(target).toBeUndefined();
    });
});
