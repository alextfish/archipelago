import { describe, it, expect } from 'vitest';
import { SpeechBubblePlacer } from '@model/puzzle/SpeechBubblePlacer';
import type { BubbleRequest, BubblePlacement, PuzzleForBubblePlacement } from '@model/puzzle/SpeechBubblePlacer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePuzzle(
    placedBridges: PuzzleForBubblePlacement['placedBridges'] = [],
    width = 10,
    height = 10,
): PuzzleForBubblePlacement {
    return { placedBridges, width, height };
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

        // 2-tile gap: 1 tile for the arrow, 1 tile for the bubble content
        expect(placement.topLeft).toEqual({ x: 5, y: 3 });
        expect(placement.width).toBe(1);
        expect(placement.npcPosition).toEqual({ x: 3, y: 3 });
    });

    it('places a wide bubble (width 3) to the right of its NPC when unobstructed', () => {
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [{ npcPosition: { x: 1, y: 2 }, width: 3 }];

        const [placement] = place(puzzle, requests);

        // Cells: (3,2), (4,2), (5,2)
        expect(placement.topLeft).toEqual({ x: 3, y: 2 });
    });

    // -----------------------------------------------------------------------
    // Priority 2 — avoid covering NPCs (highest-cost penalty; priority 1,
    // "within 4 squares", is satisfied by construction for all placements)
    // -----------------------------------------------------------------------

    it('avoids placing the bubble on top of another NPC to its right', () => {
        // NPC1 at (1,1). The right candidate is 2 tiles away at (3,1), which covers NPC2.
        // Best alternative: left at (1 - 1 - 1, 1) = (-1,1).
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 1 }, width: 1 },
            { npcPosition: { x: 3, y: 1 }, width: 1 },
        ];

        const [first] = place(puzzle, requests);

        // NPC2 is at (3,1), so right placement (topLeft = (3,1)) has cost 1000.
        // Left placement (topLeft = (-1,1)) has cost 0. Left should win.
        expect(first.topLeft).toEqual({ x: -1, y: 1 });
    });

    it('places the second bubble to the right when the first is out of the way', () => {
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 1 }, width: 1 },  // placed left at (-1,1)
            { npcPosition: { x: 3, y: 1 }, width: 1 },  // right at (5,1) — unobstructed
        ];

        const [, second] = place(puzzle, requests);

        expect(second.topLeft).toEqual({ x: 5, y: 1 });
    });

    it('avoids covering an NPC with a wide bubble placed to the right', () => {
        // NPC1 at (2,2), width 2. Right placement occupies (4,2) and (5,2).
        // NPC2 is at (4,2), so right cost = 1000.
        // Left placement occupies (-1,2) and (0,2) — cost 0.
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 2, y: 2 }, width: 2 },
            { npcPosition: { x: 4, y: 2 }, width: 1 },
        ];

        const [first] = place(puzzle, requests);

        expect(first.topLeft).toEqual({ x: -1, y: 2 }); // Left placement
    });

    // -----------------------------------------------------------------------
    // Priority 3 — avoid overlapping already-placed bubbles
    // -----------------------------------------------------------------------

    it('avoids placing a bubble where a previously placed bubble already is', () => {
        // NPC1 at (1,2), width 2, placed right: occupies (3,2) and (4,2).
        // NPC2 at (3,0), width 1. Below (topLeft=(3,2)) overlaps (3,2) → cost 100.
        // Right (topLeft=(5,0)) has no overlap → cost 0.
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 2 }, width: 2 },
            { npcPosition: { x: 3, y: 0 }, width: 1 },
        ];

        const [, second] = place(puzzle, requests);

        // Right placement (5,0) has cost 0; below (3,2) has cost 100.
        expect(second.topLeft).toEqual({ x: 5, y: 0 });
    });

    it('returns a placement for every request, even when all four directions overlap something', () => {
        // All four candidate directions for NPC0 land on another NPC 2 tiles away.
        const puzzle = makePuzzle();
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 5, y: 5 }, width: 1 },  // NPC0 — the one we care about
            { npcPosition: { x: 7, y: 5 }, width: 1 },  // 2 right of NPC0
            { npcPosition: { x: 3, y: 5 }, width: 1 },  // 2 left of NPC0
            { npcPosition: { x: 5, y: 3 }, width: 1 },  // 2 above NPC0
            { npcPosition: { x: 5, y: 7 }, width: 1 },  // 2 below NPC0
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
        // NPC at (0,2) blocks the left candidate (0,2) with cost 1000.
        // NPC at (2,3) blocks the below candidate... (2,4) — not blocked.
        // Right: topLeft=(4,2) → bridge cell cost=10.
        // Left: topLeft=(0,2) → NPC cost=1000.
        // Above: topLeft=(2,0) → cost=0 → wins.
        const puzzle = makePuzzle([
            { start: { x: 2, y: 2 }, end: { x: 5, y: 2 } },
        ]);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 0, y: 2 }, width: 1 },  // blocks left for NPC at (2,2)
            { npcPosition: { x: 2, y: 3 }, width: 1 },  // alongside NPC at (2,2)
            { npcPosition: { x: 2, y: 2 }, width: 1 },  // the NPC under test
        ];

        const [, , placement] = place(puzzle, requests);

        expect(placement.topLeft).toEqual({ x: 2, y: 0 }); // Above — only cost-free direction
    });

    it('still picks the direction with fewest bridge cells when all directions are partially obstructed', () => {
        // Vertical bridge from (3,0) to (3,4). Intermediate cells: (3,1),(3,2),(3,3).
        // NPC at (3,2). Going right: (5,2) → cost 0. That should be chosen.
        const puzzle = makePuzzle([
            { start: { x: 3, y: 0 }, end: { x: 3, y: 4 } },
        ]);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 3, y: 2 }, width: 1 },
        ];

        const [placement] = place(puzzle, requests);

        expect(placement.topLeft).toEqual({ x: 5, y: 2 }); // Right — no bridge cell there
    });

    it('does not count bridge endpoint cells as bridge cells', () => {
        // Bridge from (3,2) to (8,2). Endpoints: (3,2),(8,2). Intermediate cells: (4,2)–(7,2).
        // NPC at (6,2), width 1.
        // Right: topLeft=(8,2) → bridge ENDPOINT (not counted) → cost=0 → wins first.
        // Left: topLeft=(4,2) → bridge INTERMEDIATE cell → cost=10.
        // This confirms that endpoints are excluded from bridge cell penalisation.
        const puzzle = makePuzzle([
            { start: { x: 3, y: 2 }, end: { x: 8, y: 2 } },
        ]);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 6, y: 2 }, width: 1 },
        ];

        const [placement] = place(puzzle, requests);

        expect(placement.topLeft).toEqual({ x: 8, y: 2 }); // Right — endpoint not penalised
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
        // NPC at (5,5) sits exactly at the centre of an 11×11 puzzle (centre = (5,5)).
        // The centre-first algorithm processes it first.
        //
        // Situation for the main NPC at (5,5):
        //   Right → (7,5) = another NPC  → cost 1000
        //   Left  → (3,5) = another NPC  → cost 1000
        //   Above → (5,3) = bridge cell  → cost 10
        //   Below → (5,7) = clear        → cost 0  ← wins
        //
        // A vertical bridge runs from (5,1) to (5,5); (5,3) is an intermediate cell.
        const puzzle = makePuzzle(
            [{ start: { x: 5, y: 1 }, end: { x: 5, y: 5 } }],
            11, 11,
        );
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 3, y: 5 }, width: 1 },  // blocks left of main  (left candidate = 3,5)
            { npcPosition: { x: 5, y: 5 }, width: 1 },  // main NPC — exactly at puzzle centre
            { npcPosition: { x: 7, y: 5 }, width: 1 },  // blocks right of main (right candidate = 7,5)
        ];

        const [, main] = place(puzzle, requests);

        expect(main.topLeft).toEqual({ x: 5, y: 7 }); // Below — cheapest option
    });

    // -----------------------------------------------------------------------
    // Centre-first processing order
    // -----------------------------------------------------------------------

    it('processes NPCs centre-first, allowing outer NPCs to place bubbles further out', () => {
        // 10×10 puzzle — centre at (4.5, 4.5).
        // Distances:
        //   NPC_B at (5,5): d²=0.5  — most central, processed first
        //   NPC_C at (7,5): d²=6.5  — mid
        //   NPC_A at (1,5): d²=12.5 — most outer, processed last
        //
        // NPC_B's right direction lands on NPC_C at (7,5) (cost 1000), so it claims
        // the left cell (3,5) first.  When NPC_A is finally processed, its right
        // direction would overlap that bubble (cost 100), so it is pushed to (-1,5).
        // If the input order were used instead, NPC_A would claim (3,5) first,
        // forcing NPC_B to go above.
        const puzzle = makePuzzle([], 10, 10);
        const requests: BubbleRequest[] = [
            { npcPosition: { x: 1, y: 5 }, width: 1 },  // NPC_A — outer
            { npcPosition: { x: 5, y: 5 }, width: 1 },  // NPC_B — inner
            { npcPosition: { x: 7, y: 5 }, width: 1 },  // NPC_C — blocks B's right
        ];

        const placements = place(puzzle, requests);

        expect(placements[0].topLeft).toEqual({ x: -1, y: 5 }); // A pushed further left
        expect(placements[1].topLeft).toEqual({ x: 3, y: 5 });  // B claims central-left cell
        expect(placements[2].topLeft).toEqual({ x: 9, y: 5 });  // C goes right unobstructed
    });
});
