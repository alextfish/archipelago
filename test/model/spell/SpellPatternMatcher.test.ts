import { describe, it, expect } from 'vitest';
import { SpellPatternMatcher } from '@model/spell/SpellPatternMatcher';
import type { Bridge } from '@model/puzzle/Bridge';
import { createBridgeType } from '@model/puzzle/BridgeType';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let bridgeCounter = 0;

function makeBridge(x1: number, y1: number, x2: number, y2: number): Bridge {
    return {
        id: `b${++bridgeCounter}`,
        type: createBridgeType({ id: 'test' }),
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
    };
}

function matcher(): SpellPatternMatcher {
    return new SpellPatternMatcher();
}

// ---------------------------------------------------------------------------
// Island spell
// ---------------------------------------------------------------------------

describe('SpellPatternMatcher — island spell', () => {
    it('detects a standard island pattern at the origin', () => {
        // Spine: (2,0)→(2,4) — one 4-tile vertical bridge
        // U-shape: (0,2)→(0,6), (0,6)→(4,6), (4,2)→(4,6) — three 4-tile bridges
        const bridges: Bridge[] = [
            makeBridge(2, 0, 2, 4),   // spine
            makeBridge(0, 2, 0, 6),   // U left
            makeBridge(0, 6, 4, 6),   // U bottom
            makeBridge(4, 2, 4, 6),   // U right
        ];

        const result = matcher().findMatches(bridges, ['island']);
        expect(result).toHaveLength(1);
        expect(result[0].kind).toBe('island');
        expect(result[0].variantID).toBe('standard');
        expect(result[0].components).toHaveLength(2);
    });

    it('detects a translated island pattern', () => {
        // Shift everything by (+3, +2)
        const bridges: Bridge[] = [
            makeBridge(5, 2, 5, 6),   // spine (2+3, 0+2)→(2+3, 4+2)
            makeBridge(3, 4, 3, 8),   // U left
            makeBridge(3, 8, 7, 8),   // U bottom
            makeBridge(7, 4, 7, 8),   // U right
        ];

        const result = matcher().findMatches(bridges, ['island']);
        expect(result).toHaveLength(1);
        expect(result[0].kind).toBe('island');
        expect(result[0].components[0].offsetX).toBe(3);
        expect(result[0].components[0].offsetY).toBe(2);
    });

    it('does not match when the spine is connected to the U-shape', () => {
        // Connect spine bottom to U left by adding a bridge linking (2,4) to (0,4)
        const bridges: Bridge[] = [
            makeBridge(2, 0, 2, 4),   // spine
            makeBridge(0, 2, 0, 6),   // U left
            makeBridge(0, 6, 4, 6),   // U bottom
            makeBridge(4, 2, 4, 6),   // U right
            makeBridge(0, 4, 2, 4),   // extra bridge connecting spine to U — ruins isolation
        ];

        const result = matcher().findMatches(bridges, ['island']);
        expect(result).toHaveLength(0);
    });

    it('does not match when the U-shape is incomplete', () => {
        // Missing U bottom bridge
        const bridges: Bridge[] = [
            makeBridge(2, 0, 2, 4),
            makeBridge(0, 2, 0, 6),
            // no bottom bridge
            makeBridge(4, 2, 4, 6),
        ];

        const result = matcher().findMatches(bridges, ['island']);
        expect(result).toHaveLength(0);
    });

    it('does not match when there is no spine', () => {
        const bridges: Bridge[] = [
            makeBridge(0, 2, 0, 6),
            makeBridge(0, 6, 4, 6),
            makeBridge(4, 2, 4, 6),
        ];

        const result = matcher().findMatches(bridges, ['island']);
        expect(result).toHaveLength(0);
    });

    it('does not match when an extra bridge extends from the U-shape', () => {
        const bridges: Bridge[] = [
            makeBridge(2, 0, 2, 4),
            makeBridge(0, 2, 0, 6),
            makeBridge(0, 6, 4, 6),
            makeBridge(4, 2, 4, 6),
            makeBridge(4, 6, 6, 6),   // extra extending from U bottom-right corner
        ];

        const result = matcher().findMatches(bridges, ['island']);
        expect(result).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Bridge spell
// ---------------------------------------------------------------------------

describe('SpellPatternMatcher — bridge spell', () => {
    /**
     * Build the standard 6-bridge frame for a given width w.
     * Layout:
     *   (0,0)        (w,0)
     *     |            |
     *   (0,2)---(w,2)-(w,2)
     *     |            |
     *   (0,4)---(w,4)-(w,4)
     */
    function makeBridgeFrame(w: number, xOffset = 0, yOffset = 0): Bridge[] {
        const o = (x: number, y: number) => ({ x: x + xOffset, y: y + yOffset });
        return [
            makeBridge(o(0, 0).x, o(0, 0).y, o(0, 2).x, o(0, 2).y),
            makeBridge(o(0, 2).x, o(0, 2).y, o(0, 4).x, o(0, 4).y),
            makeBridge(o(0, 2).x, o(0, 2).y, o(w, 2).x, o(w, 2).y),
            makeBridge(o(0, 4).x, o(0, 4).y, o(w, 4).x, o(w, 4).y),
            makeBridge(o(w, 4).x, o(w, 4).y, o(w, 2).x, o(w, 2).y),
            makeBridge(o(w, 2).x, o(w, 2).y, o(w, 0).x, o(w, 0).y),
        ];
    }

    it('detects width4 bridge spell', () => {
        const result = matcher().findMatches(makeBridgeFrame(4), ['bridge']);
        expect(result).toHaveLength(1);
        expect(result[0].variantID).toBe('width4');
    });

    it('detects width6 bridge spell', () => {
        const result = matcher().findMatches(makeBridgeFrame(6), ['bridge']);
        expect(result).toHaveLength(1);
        expect(result[0].variantID).toBe('width6');
    });

    it('detects width8 bridge spell', () => {
        const result = matcher().findMatches(makeBridgeFrame(8), ['bridge']);
        expect(result).toHaveLength(1);
        expect(result[0].variantID).toBe('width8');
    });

    it('detects a translated bridge frame', () => {
        const result = matcher().findMatches(makeBridgeFrame(5, 10, 3), ['bridge']);
        expect(result).toHaveLength(1);
        expect(result[0].variantID).toBe('width5');
        expect(result[0].components[0].offsetX).toBe(10);
        expect(result[0].components[0].offsetY).toBe(3);
    });

    it('does not match when one bridge is missing from the frame', () => {
        const bridges = makeBridgeFrame(4);
        bridges.pop(); // remove last bridge
        const result = matcher().findMatches(bridges, ['bridge']);
        expect(result).toHaveLength(0);
    });

    it('does not match when an extra bridge extends from the frame', () => {
        const bridges = makeBridgeFrame(4);
        bridges.push(makeBridge(0, 0, -2, 0)); // extra at top-left corner
        const result = matcher().findMatches(bridges, ['bridge']);
        expect(result).toHaveLength(0);
    });

    it('returns no match when only island kind is allowed', () => {
        const result = matcher().findMatches(makeBridgeFrame(4), ['island']);
        expect(result).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Open spell
// ---------------------------------------------------------------------------

describe('SpellPatternMatcher — open spell', () => {
    /**
     * Build the standard left+right open components with a given rightBaseX.
     */
    function makeOpenPair(rightBaseX: number, xOffset = 0, yOffset = 0): Bridge[] {
        const o = (x: number, y: number) => ({ x: x + xOffset, y: y + yOffset });
        const r = rightBaseX;
        return [
            // Left component (5 bridges)
            makeBridge(o(0, 0).x, o(0, 0).y, o(2, 0).x, o(2, 0).y),
            makeBridge(o(2, 0).x, o(2, 0).y, o(2, 2).x, o(2, 2).y),
            makeBridge(o(0, 2).x, o(0, 2).y, o(2, 2).x, o(2, 2).y),
            makeBridge(o(2, 2).x, o(2, 2).y, o(2, 4).x, o(2, 4).y),
            makeBridge(o(0, 4).x, o(0, 4).y, o(2, 4).x, o(2, 4).y),
            // Right component (5 bridges, mirrored)
            makeBridge(o(r + 2, 0).x, o(r + 2, 0).y, o(r, 0).x, o(r, 0).y),
            makeBridge(o(r, 0).x, o(r, 0).y, o(r, 2).x, o(r, 2).y),
            makeBridge(o(r, 2).x, o(r, 2).y, o(r + 2, 2).x, o(r + 2, 2).y),
            makeBridge(o(r, 2).x, o(r, 2).y, o(r, 4).x, o(r, 4).y),
            makeBridge(o(r, 4).x, o(r, 4).y, o(r + 2, 4).x, o(r + 2, 4).y),
        ];
    }

    it('detects open spell gap0 (rightBaseX=4)', () => {
        const result = matcher().findMatches(makeOpenPair(4), ['open']);
        expect(result).toHaveLength(1);
        expect(result[0].variantID).toBe('gap0');
    });

    it('detects open spell gap1 (rightBaseX=5)', () => {
        const result = matcher().findMatches(makeOpenPair(5), ['open']);
        expect(result).toHaveLength(1);
        expect(result[0].variantID).toBe('gap1');
    });

    it('detects open spell gap2 (rightBaseX=6)', () => {
        const result = matcher().findMatches(makeOpenPair(6), ['open']);
        expect(result).toHaveLength(1);
        expect(result[0].variantID).toBe('gap2');
    });

    it('detects a translated open pair', () => {
        const result = matcher().findMatches(makeOpenPair(4, 5, 1), ['open']);
        expect(result).toHaveLength(1);
    });

    it('does not match when the two components are connected', () => {
        const bridges = makeOpenPair(4);
        // Add a bridge connecting left (2,2) to right (4,2) — ruins isolation
        bridges.push(makeBridge(2, 2, 4, 2));
        const result = matcher().findMatches(bridges, ['open']);
        expect(result).toHaveLength(0);
    });

    it('does not match when one component is incomplete', () => {
        const bridges = makeOpenPair(4);
        bridges.pop(); // remove last bridge from right component
        const result = matcher().findMatches(bridges, ['open']);
        expect(result).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Multiple spell kinds active simultaneously
// ---------------------------------------------------------------------------

describe('SpellPatternMatcher — multiple allowed kinds', () => {
    it('returns matches for all satisfied kinds', () => {
        // Place both an island pattern and a bridge pattern with no bridges shared.
        // Island at origin, bridge frame offset so they don't interfere.
        const islandBridges: Bridge[] = [
            makeBridge(2, 0, 2, 4),
            makeBridge(0, 2, 0, 6),
            makeBridge(0, 6, 4, 6),
            makeBridge(4, 2, 4, 6),
        ];
        const frameBridges: Bridge[] = [
            // bridge frame at x+20 to avoid overlap
            makeBridge(20, 0, 20, 2),
            makeBridge(20, 2, 20, 4),
            makeBridge(20, 2, 24, 2),
            makeBridge(20, 4, 24, 4),
            makeBridge(24, 4, 24, 2),
            makeBridge(24, 2, 24, 0),
        ];

        const result = matcher().findMatches([...islandBridges, ...frameBridges], ['island', 'bridge']);
        expect(result.some(r => r.kind === 'island')).toBe(true);
        expect(result.some(r => r.kind === 'bridge')).toBe(true);
    });

    it('ignores disallowed spell kinds', () => {
        const islandBridges: Bridge[] = [
            makeBridge(2, 0, 2, 4),
            makeBridge(0, 2, 0, 6),
            makeBridge(0, 6, 4, 6),
            makeBridge(4, 2, 4, 6),
        ];

        // island pattern placed, but only bridge is allowed
        const result = matcher().findMatches(islandBridges, ['bridge']);
        expect(result).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// BridgePuzzle runtime mutation API sanity (not spell-specific)
// ---------------------------------------------------------------------------
