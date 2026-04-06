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
     * Returns null when the bridge is not placed.
     */
    getStrutLocation(puzzle: PuzzleForStrutLocation): { x: number; y: number } | null {
        if (!this.start || !this.end) return null;

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

        for (const island of islands) {
            // Exclude endpoint islands
            if (island.x === start.x && island.y === start.y) continue;
            if (island.x === end.x && island.y === end.y) continue;

            // Horizontal bridge
            if (start.y === end.y && island.y === start.y) {
                const minX = Math.min(start.x, end.x);
                const maxX = Math.max(start.x, end.x);
                if (island.x > minX && island.x < maxX) {
                    result.push(island);
                }
            }

            // Vertical bridge
            if (start.x === end.x && island.x === start.x) {
                const minY = Math.min(start.y, end.y);
                const maxY = Math.max(start.y, end.y);
                if (island.y > minY && island.y < maxY) {
                    result.push(island);
                }
            }
        }

        return result;
    }
}

function distSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
