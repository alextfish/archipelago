import type { Bridge } from './Bridge';
import type { BridgeType } from './BridgeType';
import type { Island } from './Island';

/**
 * Minimal puzzle interface needed for strut location computation.
 * Avoids a circular import with BridgePuzzle.
 */
export interface PuzzleForStrutLocation {
    islands: Island[];
}

/** Names of the sprite frames used to render a strut bridge segment. */
export type StrutBridgeFrameName =
    | 'strut'
    | 'l2s-single' | 'l2s-left' | 'l2s-right' | 'l2s-mid'
    | 's2r-single' | 's2r-left' | 's2r-right' | 's2r-mid'
    | 'l2r';

/**
 * A bridge that is automatically created when the puzzle's bridge string
 * contains a '+' suffix on a length entry (e.g. "3,2,3+,4+").
 *
 * StrutBridges must pass over at least one island (enforced by a
 * BridgeMustCoverIslandConstraint added automatically at puzzle construction).
 * The strut location is the grid position of the "strut" — the island the
 * bridge is resting on, or the midpoint when no island is crossed.
 */
export class StrutBridge implements Bridge {
    id: string;
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    type: BridgeType;

    constructor(id: string, type: BridgeType) {
        this.id = id;
        this.type = type;
    }

    /**
     * Returns the strut location for this bridge when placed, based on
     * which islands the bridge crosses:
     * - 0 islands crossed → midpoint of the bridge
     * - 1 island crossed  → that island's position
     * - 2+ islands crossed → island closest to the midpoint
     *
     * Returns null when the bridge is not placed or has length less than 2.
     */
    getStrutLocation(puzzle: PuzzleForStrutLocation): { x: number; y: number } | null {
        if (!this.start || !this.end) return null;

        const length = Math.abs(this.end.x - this.start.x) + Math.abs(this.end.y - this.start.y);
        if (length < 2) return null;

        const { start, end } = this;
        const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

        const crossedIslands = this.getCrossedIslands(puzzle.islands);

        if (crossedIslands.length === 0) {
            return midpoint;
        }

        if (crossedIslands.length === 1) {
            return { x: crossedIslands[0].x, y: crossedIslands[0].y };
        }

        // 2+ islands: choose the one closest to the midpoint
        let closest = crossedIslands[0];
        let closestDist = distSquared(closest, midpoint);
        for (let i = 1; i < crossedIslands.length; i++) {
            const d = distSquared(crossedIslands[i], midpoint);
            if (d < closestDist) {
                closestDist = d;
                closest = crossedIslands[i];
            }
        }
        return { x: closest.x, y: closest.y };
    }

    /**
     * Returns all islands that this bridge crosses (strictly between endpoints).
     * Assumes the bridge is placed (start and end are defined).
     */
    getCrossedIslands(islands: Island[]): Island[] {
        if (!this.start || !this.end) return [];
        const { start, end } = this;
        const result: Island[] = [];

        const isHorizontal = start.y === end.y;
        const isVertical = start.x === end.x;
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        for (const island of islands) {
            // Exclude endpoint islands
            if (island.x === start.x && island.y === start.y) continue;
            if (island.x === end.x && island.y === end.y) continue;

            // Horizontal bridge
            if (isHorizontal && island.y === start.y) {
                if (island.x > minX && island.x < maxX) {
                    result.push(island);
                }
            }

            // Vertical bridge
            if (isVertical && island.x === start.x) {
                if (island.y > minY && island.y < maxY) {
                    result.push(island);
                }
            }
        }

        return result;
    }

    /**
     * Returns the ordered list of sprite frame names for this bridge, from the
     * start endpoint to the end endpoint, including endpoint tiles.
     *
     * Frame name semantics:
     * - l2s-* : "left/top to strut" — the approach from the start endpoint
     * - strut  : the strut tile itself
     * - s2r-* : "strut to right/bottom" — the departure toward the end endpoint
     *
     * Returns null when the bridge is not placed.
     */
    getFrames(puzzle: PuzzleForStrutLocation): StrutBridgeFrameName[] | null {
        if (!this.start || !this.end) return null;

        const { start, end } = this;
        const isHorizontal = start.y === end.y;
        const length = isHorizontal
            ? Math.abs(end.x - start.x)
            : Math.abs(end.y - start.y);

        if (length === 1) {
            return ['l2s-single', 's2r-single'];
        }

        const strutLocation = this.getStrutLocation(puzzle);
        // Defensive: getStrutLocation should always return a value for length >= 2;
        // null here would indicate an unexpected state.
        if (!strutLocation) return null;

        const strutDist = isHorizontal
            ? Math.abs(strutLocation.x - Math.min(start.x, end.x))
            : Math.abs(strutLocation.y - Math.min(start.y, end.y));
        const rightDist = length - strutDist;

        return [
            ...buildSectionFrames(strutDist, 'l2s'),
            'strut',
            ...buildSectionFrames(rightDist, 's2r'),
        ];
    }
}

function buildSectionFrames(
    dist: number,
    prefix: 'l2s' | 's2r'
): StrutBridgeFrameName[] {
    if (dist === 1) return [`${prefix}-single`];
    if (dist === 2) return [`${prefix}-left`, `${prefix}-right`];
    return [
        `${prefix}-left`,
        ...Array<StrutBridgeFrameName>(dist - 2).fill(`${prefix}-mid`),
        `${prefix}-right`,
    ];
}

function distSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
