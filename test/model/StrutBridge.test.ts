import { describe, it, expect } from 'vitest';
import { StrutBridge } from '@model/puzzle/StrutBridge';
import type { Island } from '@model/puzzle/Island';

/** Build a minimal StrutBridge with given start/end already set. */
function makePlacedStrutBridge(
    start: { x: number; y: number },
    end: { x: number; y: number }
): StrutBridge {
    const bridge = new StrutBridge('b1', { id: 'strut_3', mustCoverIsland: true });
    bridge.start = start;
    bridge.end = end;
    return bridge;
}

describe('StrutBridge', () => {
    describe('getStrutLocation', () => {
        it('returns null when the bridge is not placed', () => {
            const bridge = new StrutBridge('b1', { id: 'strut_3', mustCoverIsland: true });
            const result = bridge.getStrutLocation({ islands: [] });
            expect(result).toBeNull();
        });

        it('returns midpoint when no islands are crossed', () => {
            const bridge = makePlacedStrutBridge({ x: 0, y: 0 }, { x: 4, y: 0 });
            const islands: Island[] = [
                { id: 'A', x: 0, y: 0 },
                { id: 'B', x: 4, y: 0 },
            ];
            const result = bridge.getStrutLocation({ islands });
            expect(result).toEqual({ x: 2, y: 0 });
        });

        it('returns midpoint for a vertical bridge with no islands crossed', () => {
            const bridge = makePlacedStrutBridge({ x: 2, y: 0 }, { x: 2, y: 6 });
            const islands: Island[] = [
                { id: 'A', x: 2, y: 0 },
                { id: 'B', x: 2, y: 6 },
            ];
            const result = bridge.getStrutLocation({ islands });
            expect(result).toEqual({ x: 2, y: 3 });
        });

        it('returns the island location when exactly one island is crossed', () => {
            // Island at x=1 (not midpoint x=2) — exercises that strut != midpoint
            const bridge = makePlacedStrutBridge({ x: 0, y: 0 }, { x: 4, y: 0 });
            const islands: Island[] = [
                { id: 'A', x: 0, y: 0 },
                { id: 'mid', x: 1, y: 0 },
                { id: 'B', x: 4, y: 0 },
            ];
            const result = bridge.getStrutLocation({ islands });
            expect(result).toEqual({ x: 1, y: 0 });
        });

        it('returns island closest to midpoint when two islands are crossed', () => {
            // Bridge from (0,0) to (6,0), midpoint (3,0)
            // Crossed islands at x=1 (dist 2 from midpoint) and x=4 (dist 1 from midpoint)
            const bridge = makePlacedStrutBridge({ x: 0, y: 0 }, { x: 6, y: 0 });
            const islands: Island[] = [
                { id: 'A', x: 0, y: 0 },
                { id: 'near', x: 4, y: 0 },
                { id: 'far', x: 1, y: 0 },
                { id: 'B', x: 6, y: 0 },
            ];
            const result = bridge.getStrutLocation({ islands });
            expect(result).toEqual({ x: 4, y: 0 });
        });

        it('returns island closest to midpoint for a vertical bridge with two crossed islands', () => {
            // Bridge from (0,0) to (0,8), midpoint (0,4)
            // Crossed islands at y=2 (dist 2 from midpoint) and y=5 (dist 1 from midpoint)
            const bridge = makePlacedStrutBridge({ x: 0, y: 0 }, { x: 0, y: 8 });
            const islands: Island[] = [
                { id: 'A', x: 0, y: 0 },
                { id: 'near', x: 0, y: 5 },
                { id: 'far', x: 0, y: 2 },
                { id: 'B', x: 0, y: 8 },
            ];
            const result = bridge.getStrutLocation({ islands });
            expect(result).toEqual({ x: 0, y: 5 });
        });

        it('does not include endpoint islands in crossed-island list', () => {
            // Bridge from (0,0) to (2,0), only endpoints, no intermediate island
            const bridge = makePlacedStrutBridge({ x: 0, y: 0 }, { x: 2, y: 0 });
            const islands: Island[] = [
                { id: 'A', x: 0, y: 0 },
                { id: 'B', x: 2, y: 0 },
            ];
            const result = bridge.getStrutLocation({ islands });
            // No crossed islands → midpoint
            expect(result).toEqual({ x: 1, y: 0 });
        });
    });

    describe('getCrossedIslands', () => {
        it('returns empty array when bridge is not placed', () => {
            const bridge = new StrutBridge('b1', { id: 'strut_3', mustCoverIsland: true });
            expect(bridge.getCrossedIslands([])).toEqual([]);
        });

        it('returns all islands strictly between endpoints on horizontal bridge', () => {
            const bridge = makePlacedStrutBridge({ x: 0, y: 0 }, { x: 5, y: 0 });
            const islands: Island[] = [
                { id: 'A', x: 0, y: 0 },
                { id: 'mid1', x: 2, y: 0 },
                { id: 'mid2', x: 3, y: 0 },
                { id: 'B', x: 5, y: 0 },
                { id: 'off', x: 2, y: 1 }, // Different row — should not be included
            ];
            const crossed = bridge.getCrossedIslands(islands);
            expect(crossed.map(i => i.id)).toEqual(['mid1', 'mid2']);
        });

        it('returns all islands strictly between endpoints on vertical bridge', () => {
            const bridge = makePlacedStrutBridge({ x: 3, y: 0 }, { x: 3, y: 4 });
            const islands: Island[] = [
                { id: 'A', x: 3, y: 0 },
                { id: 'mid', x: 3, y: 2 },
                { id: 'B', x: 3, y: 4 },
                { id: 'off', x: 4, y: 2 }, // Different column — should not be included
            ];
            const crossed = bridge.getCrossedIslands(islands);
            expect(crossed.map(i => i.id)).toEqual(['mid']);
        });
    });
});
