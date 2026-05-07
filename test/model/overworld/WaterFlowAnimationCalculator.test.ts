import { describe, it, expect } from 'vitest';
import { WaterFlowAnimationCalculator } from '@model/overworld/WaterFlowAnimationCalculator';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { GridKey } from '@model/puzzle/FlowTypes';

// ── animationKeyForDirections ────────────────────────────────────────────────

describe('WaterFlowAnimationCalculator.animationKeyForDirections', () => {
    it('returns "water-none" for empty direction key', () => {
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('')).toBe('water-none');
    });

    it('prefixes the direction key correctly', () => {
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('E')).toBe('water-E');
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('NS')).toBe('water-NS');
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('NSEW')).toBe('water-NSEW');
    });

    it('preserves the canonical direction string as-is', () => {
        const key = WaterFlowAnimationCalculator.animationKeyForDirections('NE');
        expect(key).toBe('water-NE');
    });
});

// ── frameIndexForDirections ──────────────────────────────────────────────────

describe('WaterFlowAnimationCalculator.frameIndexForDirections', () => {
    it('returns 0 for empty direction key', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('')).toBe(0);
    });

    it('single direction — East only → 1', () => {
        // bit0 = E → index 1
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('E')).toBe(1);
    });

    it('single direction — West only → 2', () => {
        // bit1 = W → index 2
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('W')).toBe(2);
    });

    it('single direction — South only → 4', () => {
        // bit2 = S → index 4
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('S')).toBe(4);
    });

    it('single direction — North only → 8', () => {
        // bit3 = N → index 8
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('N')).toBe(8);
    });

    it('NS → 12 (N=8, S=4)', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NS')).toBe(12);
    });

    it('EW → 3 (E=1, W=2)', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('EW')).toBe(3);
    });

    it('NE → 9 (N=8, E=1)', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NE')).toBe(9);
    });

    it('NSEW → 15 (all bits set)', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NSEW')).toBe(15);
    });

    it('adds 16 for source tiles', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('E', true)).toBe(17);
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NS', true)).toBe(28);
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NSEW', true)).toBe(31);
    });

    it('source tile with empty direction key → 16', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('', true)).toBe(16);
    });

    it('matches tile IDs from the water directions tileset definition', () => {
        // Spot-check a few values against the Tiled TMX specification.
        // The tileset ordering is: localID = 8·N + 4·S + 2·W + 1·E
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('E')).toBe(1);   // tile id 1
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('W')).toBe(2);   // tile id 2
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('S')).toBe(4);   // tile id 4
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('N')).toBe(8);   // tile id 8
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NE')).toBe(9);  // tile id 9
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NW')).toBe(10); // tile id 10
    });
});

// ── animationKeysForMap ──────────────────────────────────────────────────────

describe('WaterFlowAnimationCalculator.animationKeysForMap', () => {
    it('returns an empty set for an empty map', () => {
        const keys = WaterFlowAnimationCalculator.animationKeysForMap(
            new Map<GridKey, string>()
        );
        expect(keys.size).toBe(0);
    });

    it('returns one key per unique direction', () => {
        const dirMap = new Map<GridKey, string>([
            [gridKey(0, 0), 'NS'],
            [gridKey(1, 0), 'NS'], // duplicate direction
            [gridKey(2, 0), 'E'],
        ]);
        const keys = WaterFlowAnimationCalculator.animationKeysForMap(dirMap);
        expect(keys.size).toBe(2);
        expect(keys.has('water-NS')).toBe(true);
        expect(keys.has('water-E')).toBe(true);
    });

    it('includes one entry per distinct direction even if many tiles share it', () => {
        const dirMap = new Map<GridKey, string>(
            Array.from({ length: 10 }, (_, i) => [gridKey(i, 0), 'NSEW'])
        );
        const keys = WaterFlowAnimationCalculator.animationKeysForMap(dirMap);
        expect(keys.size).toBe(1);
        expect(keys.has('water-NSEW')).toBe(true);
    });
});
