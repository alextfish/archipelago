import { describe, it, expect } from 'vitest';
import { SpeechBubblePlacer } from '@model/puzzle/SpeechBubblePlacer';
import type { BubbleRequest, BubblePlacement, PuzzleForBubblePlacement } from '@model/puzzle/SpeechBubblePlacer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePuzzle(placedBridges: PuzzleForBubblePlacement['placedBridges'] = []): PuzzleForBubblePlacement {
    return { placedBridges };
}

function place(puzzle: PuzzleForBubblePlacement, requests: BubbleRequest[]): BubblePlacement[] {
    return new SpeechBubblePlacer(puzzle, requests).place();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpeechBubblePlacer', () => {

    // -----------------------------------------------------------------------
    // Default placement
    // -----------------------------------------------------------------------

    it('places a single bubble to the right of its NPC when nothing is in the way', () => {
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [{ npcPosition: { x: 3, y: 3 }, width: 1 }];

        const [placement] = place(puzzle, requests);

        expect(placement.topLeft).toEqual({ x: 4, y: 3 });
        expect(placement.width).toBe(1);
        expect(placement.npcPosition).toEqual({ x: 3, y: 3 });
    });

    it('places a wide bubble (width 3) to the right of its NPC when unobstructed', () => {
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [{ npcPosition: { x: 1, y: 2 }, width: 3 }];

        const [placement] = place(puzzle, requests);

        // Cells: (2,2), (3,2), (4,2)
        expect(placement.topLeft).toEqual({ x: 2, y: 2 });
    });

    // -----------------------------------------------------------------------
    // Priority 2 — avoid covering NPCs (highest-cost penalty; priority 1,
    // "within 4 squares", is satisfied by construction for all placements)
    // -----------------------------------------------------------------------

    it('avoids placing the bubble on top of another NPC to its right', () => {
        // NPC1 at (1,1). Placing to the right (2,1) would cover NPC2.
        // Best alternative: left at (0,1).
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 1 }, width: 1 },
            { npcPosition: { x: 2, y: 1 }, width: 1 },
        ];

        const [first] = place(puzzle, requests);

        // NPC2 is at (2,1), so right placement (topLeft = (2,1)) has cost 1000.
        // Left placement (topLeft = (0,1)) has cost 0. Left should win.
        expect(first.topLeft).toEqual({ x: 0, y: 1 });
    });

    it('places the second bubble to the right when the first is out of the way', () => {
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 1 }, width: 1 },  // placed left at (0,1)
            { npcPosition: { x: 2, y: 1 }, width: 1 },  // right at (3,1) — unobstructed
        ];

        const [, second] = place(puzzle, requests);

        expect(second.topLeft).toEqual({ x: 3, y: 1 });
    });

    it('avoids covering an NPC with a wide bubble placed to the right', () => {
        // NPC1 at (2,2), width 2. Right placement occupies (3,2) and (4,2).
        // NPC2 is at (4,2), so right cost = 1000.
        // Left placement occupies (0,2) and (1,2) — cost 0.
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 2, y: 2 }, width: 2 },
            { npcPosition: { x: 4, y: 2 }, width: 1 },
        ];

        const [first] = place(puzzle, requests);

        expect(first.topLeft).toEqual({ x: 0, y: 2 }); // Left placement
    });

    // -----------------------------------------------------------------------
    // Priority 3 — avoid overlapping already-placed bubbles
    // -----------------------------------------------------------------------

    it('avoids placing a bubble where a previously placed bubble already is', () => {
        // NPC1 at (1,2), width 2, placed right: occupies (2,2) and (3,2).
        // NPC2 at (2,1), width 1. Below (topLeft=(2,2)) overlaps (2,2) → cost 100.
        // Right (topLeft=(3,1)) has no overlap → cost 0.
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 2 }, width: 2 },
            { npcPosition: { x: 2, y: 1 }, width: 1 },
        ];

        const [, second] = place(puzzle, requests);

        // Right placement (3,1) has cost 0; below (2,2) has cost 100.
        expect(second.topLeft).toEqual({ x: 3, y: 1 });
    });

    it('returns a placement for every request, even when all four directions overlap something', () => {
        // Extremely constrained layout: NPCs surrounding every direction of NPC0.
        // The placer must still return a placement (the least-bad option).
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 5, y: 5 }, width: 1 },  // NPC0 — the one we care about
            { npcPosition: { x: 6, y: 5 }, width: 1 },  // Right of NPC0
            { npcPosition: { x: 4, y: 5 }, width: 1 },  // Left of NPC0
            { npcPosition: { x: 5, y: 4 }, width: 1 },  // Above NPC0
            { npcPosition: { x: 5, y: 6 }, width: 1 },  // Below NPC0
        ];

        const placements = place(puzzle, requests);

        expect(placements).toHaveLength(5);
        expect(placements[0].npcPosition).toEqual({ x: 5, y: 5 });
    });

    // -----------------------------------------------------------------------
    // Priority 4 — avoid covering bridge squares
    // -----------------------------------------------------------------------

    it('prefers a direction that does not cover a bridge cell', () => {
        // NPC at (2,2), width 1.
        // Horizontal bridge from (2,2) to (5,2): intermediate cells (3,2),(4,2).
        // NPCs to the left (1,2) and below (2,3) block those directions.
        // Right: topLeft=(3,2) → bridge cell cost=10.
        // Left: topLeft=(1,2) → NPC cost=1000.
        // Above: topLeft=(2,1) → cost=0 → wins.
        // Below: topLeft=(2,3) → NPC cost=1000.
        const puzzle = makePuzzle([
            { start: { x: 2, y: 2 }, end: { x: 5, y: 2 } },
        ]);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 2 }, width: 1 },  // blocks left for NPC at (2,2)
            { npcPosition: { x: 2, y: 3 }, width: 1 },  // blocks below for NPC at (2,2)
            { npcPosition: { x: 2, y: 2 }, width: 1 },  // the NPC under test
        ];

        const [,, placement] = place(puzzle, requests);

        expect(placement.topLeft).toEqual({ x: 2, y: 1 }); // Above — only cost-free direction
    });

    it('still picks the direction with fewest bridge cells when all directions are partially obstructed', () => {
        // Vertical bridge from (3,0) to (3,4). Intermediate cells: (3,1),(3,2),(3,3).
        // NPC at (3,2). Going right: (4,2) → cost 0. That should be chosen.
        const puzzle = makePuzzle([
            { start: { x: 3, y: 0 }, end: { x: 3, y: 4 } },
        ]);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 3, y: 2 }, width: 1 },
        ];

        const [placement] = place(puzzle, requests);

        expect(placement.topLeft).toEqual({ x: 4, y: 2 }); // Right — no bridge cell there
    });

    it('does not count bridge endpoint cells as bridge cells', () => {
        // Bridge from (3,2) to (6,2). Endpoints: (3,2),(6,2). Intermediate cells: (4,2),(5,2).
        // NPC at (5,2), width 1.
        // Right: topLeft=(6,2) → bridge ENDPOINT (not counted) → cost=0 → wins first.
        // Left: topLeft=(4,2) → bridge INTERMEDIATE cell → cost=10.
        // This confirms that endpoints are excluded from bridge cell penalisation.
        const puzzle = makePuzzle([
            { start: { x: 3, y: 2 }, end: { x: 6, y: 2 } },
        ]);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 5, y: 2 }, width: 1 },
        ];

        const [placement] = place(puzzle, requests);

        expect(placement.topLeft).toEqual({ x: 6, y: 2 }); // Right — endpoint not penalised
    });

    // -----------------------------------------------------------------------
    // Return shape
    // -----------------------------------------------------------------------

    it('returns one placement per request in the same order', () => {
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 0, y: 0 }, width: 1 },
            { npcPosition: { x: 5, y: 5 }, width: 2 },
            { npcPosition: { x: 9, y: 3 }, width: 4 },
        ];

        const placements = place(puzzle, requests);

        expect(placements).toHaveLength(3);
        placements.forEach((p, i) => {
            expect(p.npcPosition).toEqual(requests[i].npcPosition);
            expect(p.width).toBe(requests[i].width);
        });
    });

    it('returns an empty array when there are no requests', () => {
        const placements = place(makePuzzle(), []);
        expect(placements).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Combined priorities
    // -----------------------------------------------------------------------

    it('prefers avoiding NPCs over avoiding bubbles over avoiding bridges', () => {
        // Set up a situation where:
        //   Right → covers an NPC (cost 1000)
        //   Left  → overlaps a previous bubble (cost 100)
        //   Above → covers a bridge cell (cost 10)
        //   Below → clear (cost 0)
        //
        // NPC0 at (3,5) placed first so its bubble goes right to (4,5).
        // Main NPC at (5,5). NPC at (6,5) blocks right.
        // Short vertical bridge from (5,3) to (5,5): only intermediate cell is (5,4).
        // That makes "above" (topLeft=(5,4)) cost 10 but "below" (topLeft=(5,6)) cost 0.
        const puzzle = makePuzzle([
            { start: { x: 5, y: 3 }, end: { x: 5, y: 5 } },
        ]);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 3, y: 5 }, width: 1 },   // Bubble goes right to (4,5)
            { npcPosition: { x: 5, y: 5 }, width: 1 },   // Main NPC under test
            { npcPosition: { x: 6, y: 5 }, width: 1 },   // NPC to the right of main
        ];

        const [, main] = place(puzzle, requests);

        expect(main.topLeft).toEqual({ x: 5, y: 6 }); // Below — cheapest option
    });
});
