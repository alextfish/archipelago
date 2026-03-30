import type { Point } from './Point';

/** A request to place a speech bubble for a specific NPC/constraint. */
export interface BubbleRequest {
    /** The grid position of the NPC whose bubble is being placed. */
    npcPosition: Point;
    /**
     * Number of glyphs in the bubble (1–4).
     * The bubble occupies exactly this many squares horizontally and 1 square vertically.
     */
    width: number;
}

/** The result of placing a speech bubble — its top-left grid position and dimensions. */
export interface BubblePlacement {
    /** The grid position of the NPC speaking. */
    npcPosition: Point;
    /** The top-left corner of the placed bubble on the grid. */
    topLeft: Point;
    /** Width of the bubble in grid squares. */
    width: number;
}

/**
 * Minimal puzzle information required by the placer.
 * Using a structural interface keeps the placer decoupled from Phaser and
 * makes it straightforward to unit-test.
 */
export interface PuzzleForBubblePlacement {
    placedBridges: Array<{ start?: Point; end?: Point }>;
}

const COST_COVERS_NPC = 1000;
const COST_OVERLAPS_BUBBLE = 100;
const COST_COVERS_BRIDGE = 10;

/**
 * Greedy algorithm that finds sensible grid positions for constraint-feedback
 * speech bubbles when all bridges in a puzzle have been placed.
 *
 * Each bubble is 1 square tall and N squares wide (where N = number of glyphs).
 * The algorithm considers placing each bubble in four directions (right, left,
 * above, below) relative to its NPC and picks the direction with the lowest cost,
 * weighted by the following priorities in descending order:
 *
 *  1. Avoid covering any NPC position (all NPC positions are the npcPositions in
 *     the requests — one per personified constraint).
 *  2. Avoid overlapping any already-placed speech bubble.
 *  3. Avoid covering squares that contain bridge segments.
 *
 * Bubbles are processed in the order they are supplied. The first candidate
 * direction in case of equal cost is "right", matching the existing convention.
 */
export class SpeechBubblePlacer {
    private readonly npcPositions: Point[];
    private readonly bridgeCells: Point[];

    constructor(
        private readonly puzzle: PuzzleForBubblePlacement,
        private readonly requests: BubbleRequest[],
    ) {
        this.npcPositions = requests.map(r => r.npcPosition);
        this.bridgeCells = this.computeBridgeCells();
    }

    /**
     * Place all bubbles, returning one BubblePlacement per request in the same
     * order as the input requests.
     */
    place(): BubblePlacement[] {
        const placements: BubblePlacement[] = [];
        const placedBubbleCells: Point[] = [];

        for (const request of this.requests) {
            const { npcPosition, width } = request;
            const candidates = this.getCandidates(npcPosition, width);

            let bestTopLeft = candidates[0];
            let bestCost = Infinity;

            for (const topLeft of candidates) {
                const cells = this.getBubbleCells(topLeft, width);
                const cost = this.computeCost(cells, placedBubbleCells);
                if (cost < bestCost) {
                    bestCost = cost;
                    bestTopLeft = topLeft;
                }
            }

            placements.push({ npcPosition, topLeft: bestTopLeft, width });
            placedBubbleCells.push(...this.getBubbleCells(bestTopLeft, width));
        }

        return placements;
    }

    /**
     * Return the four candidate top-left positions for a bubble adjacent to the NPC.
     * The ordering (right, left, above, below) acts as a tiebreaker so that,
     * when all options are equally good, the bubble is placed to the right.
     */
    private getCandidates(npc: Point, width: number): Point[] {
        return [
            { x: npc.x + 1,     y: npc.y     },   // Right
            { x: npc.x - width, y: npc.y     },   // Left
            { x: npc.x,         y: npc.y - 1 },   // Above
            { x: npc.x,         y: npc.y + 1 },   // Below
        ];
    }

    /** Return all grid cells occupied by a bubble whose top-left corner is topLeft. */
    private getBubbleCells(topLeft: Point, width: number): Point[] {
        const cells: Point[] = [];
        for (let dx = 0; dx < width; dx++) {
            cells.push({ x: topLeft.x + dx, y: topLeft.y });
        }
        return cells;
    }

    /**
     * Compute the total placement cost for a set of candidate cells.
     *
     * Costs are additive across cells:
     *  - 1000 per cell that lands on an NPC position.
     *  - 100  per cell that overlaps an already-placed bubble.
     *  - 10   per cell that overlaps a bridge segment.
     */
    private computeCost(cells: Point[], placedBubbleCells: Point[]): number {
        let cost = 0;
        for (const cell of cells) {
            if (this.npcPositions.some(p => p.x === cell.x && p.y === cell.y)) {
                cost += COST_COVERS_NPC;
            }
            if (placedBubbleCells.some(p => p.x === cell.x && p.y === cell.y)) {
                cost += COST_OVERLAPS_BUBBLE;
            }
            if (this.bridgeCells.some(p => p.x === cell.x && p.y === cell.y)) {
                cost += COST_COVERS_BRIDGE;
            }
        }
        return cost;
    }

    /**
     * Return all intermediate (non-endpoint) cells occupied by placed bridges.
     * Endpoint cells are island positions and are already tracked as NPC positions,
     * so they are excluded here to avoid double-penalising them.
     */
    private computeBridgeCells(): Point[] {
        const cells: Point[] = [];
        for (const bridge of this.puzzle.placedBridges) {
            if (!bridge.start || !bridge.end) continue;
            const { start, end } = bridge;
            if (start.y === end.y) {
                // Horizontal bridge
                const minX = Math.min(start.x, end.x);
                const maxX = Math.max(start.x, end.x);
                for (let x = minX + 1; x < maxX; x++) {
                    cells.push({ x, y: start.y });
                }
            } else if (start.x === end.x) {
                // Vertical bridge
                const minY = Math.min(start.y, end.y);
                const maxY = Math.max(start.y, end.y);
                for (let y = minY + 1; y < maxY; y++) {
                    cells.push({ x: start.x, y });
                }
            }
        }
        return cells;
    }
}
