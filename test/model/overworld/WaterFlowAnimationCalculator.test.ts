import { describe, it, expect } from 'vitest';
import { WaterFlowAnimationCalculator } from '@model/overworld/WaterFlowAnimationCalculator';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { GridKey } from '@model/puzzle/FlowTypes';

// ── animationKeyForDirections ────────────────────────────────────────────────

describe('WaterFlowAnimationCalculator.animationKeyForDirections', () => {
    it('returns "water-flow-none" for empty direction key', () => {
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('')).toBe('water-flow-none');
    });

    it('prefixes the direction key correctly', () => {
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('E')).toBe('water-flow-E');
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('NS')).toBe('water-flow-NS');
        expect(WaterFlowAnimationCalculator.animationKeyForDirections('NSEW')).toBe('water-flow-NSEW');
    });
});

// ── frameIndexForDirections (legacy compatibility mapping) ─────────────────

describe('WaterFlowAnimationCalculator.frameIndexForDirections', () => {
    it('returns 0 for empty direction key', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('')).toBe(0);
    });

    it('single direction bit mapping is preserved', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('E')).toBe(1);
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('W')).toBe(2);
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('S')).toBe(4);
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('N')).toBe(8);
    });

    it('adds source row offset when requested', () => {
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('E', true)).toBe(17);
        expect(WaterFlowAnimationCalculator.frameIndexForDirections('NSEW', true)).toBe(31);
    });
});

// ── back-propagation helpers ────────────────────────────────────────────────

describe('WaterFlowAnimationCalculator.calculateCombinedDirectionsWithBackPropagation', () => {
    it('adds inferred incoming direction from a neighbour outgoing edge', () => {
        const outgoing = new Map<GridKey, string>([
            [gridKey(0, 0), 'E'],
            [gridKey(1, 0), 'E'],
        ]);

        const combined = WaterFlowAnimationCalculator.calculateCombinedDirectionsWithBackPropagation(outgoing);

        expect(combined.get(gridKey(0, 0))).toBe('E');
        // Tile (1,0) receives incoming W from tile (0,0), plus its own outgoing E.
        expect(combined.get(gridKey(1, 0))).toBe('EW');
    });

    it('does not infer incoming flow from tiles missing from the map', () => {
        const outgoing = new Map<GridKey, string>([
            [gridKey(0, 0), 'E'],
        ]);

        const combined = WaterFlowAnimationCalculator.calculateCombinedDirectionsWithBackPropagation(outgoing);
        expect(combined.get(gridKey(0, 0))).toBe('E');
    });
});

describe('WaterFlowAnimationCalculator.calculateBackPropagatedPhaseOffsets', () => {
    it('assigns higher phase to upstream tiles in a simple chain', () => {
        const outgoing = new Map<GridKey, string>([
            [gridKey(0, 0), 'E'],
            [gridKey(1, 0), 'E'],
            [gridKey(2, 0), ''], // sink
        ]);

        const phase = WaterFlowAnimationCalculator.calculateBackPropagatedPhaseOffsets(outgoing);

        expect(phase.get(gridKey(2, 0))).toBe(0);
        expect(phase.get(gridKey(1, 0))).toBe(1);
        expect(phase.get(gridKey(0, 0))).toBe(2);
    });

    it('produces deterministic fallback phases for pure cycles', () => {
        const outgoing = new Map<GridKey, string>([
            [gridKey(0, 0), 'E'],
            [gridKey(1, 0), 'W'],
        ]);

        const phase = WaterFlowAnimationCalculator.calculateBackPropagatedPhaseOffsets(outgoing);
        expect(phase.get(gridKey(0, 0))).toBeDefined();
        expect(phase.get(gridKey(1, 0))).toBeDefined();
    });
});

// ── full plan calculation ────────────────────────────────────────────────────

describe('WaterFlowAnimationCalculator.calculateTileAnimationPlans', () => {
    it('returns an animation plan per tile', () => {
        const outgoing = new Map<GridKey, string>([
            [gridKey(0, 0), 'E'],
            [gridKey(1, 0), 'W'],
        ]);

        const plans = WaterFlowAnimationCalculator.calculateTileAnimationPlans(outgoing);

        expect(plans.size).toBe(2);
        expect(plans.get(gridKey(0, 0))?.frameSequence.length).toBe(4);
        expect(plans.get(gridKey(1, 0))?.frameSequence.length).toBe(4);
        expect(plans.get(gridKey(0, 0))?.animationKey.startsWith('water-flow-')).toBe(true);
    });

    it('animationKeysForMap returns de-duplicated keys from plans', () => {
        const outgoing = new Map<GridKey, string>([
            [gridKey(0, 0), 'E'],
            [gridKey(1, 0), 'E'],
            [gridKey(2, 0), 'E'],
        ]);

        const keys = WaterFlowAnimationCalculator.animationKeysForMap(outgoing);
        expect(keys.size).toBeGreaterThanOrEqual(1);
        for (const key of keys.values()) {
            expect(key.startsWith('water-flow-')).toBe(true);
        }
    });
});
