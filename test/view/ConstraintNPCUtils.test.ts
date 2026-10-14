import { describe, expect, it } from 'vitest';
import { getConstraintPuzzleID } from '@view/ConstraintNPCUtils';

describe('ConstraintNPCUtils', () => {
    it('extracts the puzzle ID from a simple constraint NPC ID', () => {
        expect(getConstraintPuzzleID('constraint-forest-type-1')).toBe('forest');
    });

    it('supports puzzle IDs that contain hyphens', () => {
        expect(getConstraintPuzzleID('constraint-forest-1-type-7')).toBe('forest-1');
    });

    it('returns null for IDs that are not constraint NPCs', () => {
        expect(getConstraintPuzzleID('npc-forest-1')).toBeNull();
    });

    it('returns null for malformed constraint NPC IDs', () => {
        expect(getConstraintPuzzleID('constraint-forest')).toBeNull();
        expect(getConstraintPuzzleID('constraint--type-1')).toBeNull();
    });
});
