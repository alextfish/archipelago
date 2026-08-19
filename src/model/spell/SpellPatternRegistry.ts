/**
 * Built-in spell pattern definitions for the three Fire-language spell kinds.
 *
 * Patterns are stored as canonical segments in local grid tile coordinates.
 * Each segment represents ONE bridge placement (from one island to another).
 * All pattern geometry is defined here once; individual puzzles only declare
 * which kinds they allow and what effect each spell produces.
 *
 * Coordinate conventions:
 *   - x increases rightward, y increases downward.
 *   - Units are grid tiles (same unit as Island.x / Island.y).
 *   - All segments are axis-aligned (horizontal or vertical).
 *
 * Each pattern variant groups segments into connected components. A match
 * requires every component in the variant to appear isolated in the
 * puzzle's placed bridges (no extra bridge may share an island endpoint with
 * a matched component).
 */

export type SpellKind = 'island' | 'bridge' | 'open';

/** A single bridge (axis-aligned) in local grid coordinates. */
export interface CanonicalSegment {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
}

/** One connected component within a spell pattern variant. */
export interface SpellPatternComponent {
    /** Canonical segments (bridges) that form this component. */
    readonly segments: readonly CanonicalSegment[];
}

/** One variant of a spell pattern (e.g. different bridge lengths). */
export interface SpellPatternVariant {
    readonly variantID: string;
    /** Each entry must match a distinct isolated connected component. */
    readonly components: readonly SpellPatternComponent[];
}

/** The full definition for one spell kind. */
export interface SpellPatternDefinition {
    readonly kind: SpellKind;
    readonly variants: readonly SpellPatternVariant[];
}

// ---------------------------------------------------------------------------
// Helper to build segments more readably.
// ---------------------------------------------------------------------------

function seg(x1: number, y1: number, x2: number, y2: number): CanonicalSegment {
    return { x1, y1, x2, y2 };
}

// ---------------------------------------------------------------------------
// Island spell
//
// Two isolated components:
//   Component A — vertical spine (1 bridge of 4 tiles)
//   Component B — U-shape (3 bridges of 4 tiles forming the U)
//
// Pattern layout (grid tiles, translated to (0,0) origin):
//
//     col: 0    1    2    3    4
//  row 0:       [spine top]
//  row 2: [U left start]  [U right start]
//  row 4: [spine end]
//  row 6: [U bottom]....[U bottom]
//
// Doubled variant scales all coordinates by 2 for larger puzzle grids.
// ---------------------------------------------------------------------------

const ISLAND_SPINE: SpellPatternComponent = {
    segments: [
        seg(2, 0, 2, 4),   // 4-tile vertical bridge
    ],
};

const ISLAND_U_SHAPE: SpellPatternComponent = {
    segments: [
        seg(0, 2, 0, 6),   // left side: 4-tile vertical bridge going down
        seg(0, 6, 4, 6),   // bottom:    4-tile horizontal bridge going right
        seg(4, 2, 4, 6),   // right side: 4-tile vertical bridge going down
    ],
};

const ISLAND_SPINE_DOUBLED: SpellPatternComponent = {
    segments: [
        seg(4, 0, 4, 8),   // 8-tile vertical bridge
    ],
};

const ISLAND_U_SHAPE_DOUBLED: SpellPatternComponent = {
    segments: [
        seg(0,  4, 0,  12),   // left side: 8-tile vertical bridge
        seg(0, 12, 8,  12),   // bottom:    8-tile horizontal bridge
        seg(8,  4, 8,  12),   // right side: 8-tile vertical bridge
    ],
};

const ISLAND_PATTERN: SpellPatternDefinition = {
    kind: 'island',
    variants: [
        {
            variantID: 'standard',
            components: [ISLAND_SPINE, ISLAND_U_SHAPE],
        },
        {
            variantID: 'doubled',
            components: [ISLAND_SPINE_DOUBLED, ISLAND_U_SHAPE_DOUBLED],
        },
    ],
};

// ---------------------------------------------------------------------------
// Bridge spell
//
// One connected component: a rectangular frame open at top-left and top-right.
// The width (horizontal distance between the two sides) varies by variant.
//
// Frame layout (w = variant width):
//
//    (0,0)     (w,0)
//      |         |
//    (0,2)-(w,2)-(w,2)  ← top horizontal joins here
//      |         |
//    (0,4)-(w,4)-(w,4)  ← bottom horizontal joins here
//
// Each side has two 2-tile bridges stacked vertically; horizontals vary.
// ---------------------------------------------------------------------------

function buildBridgeComponent(w: number): SpellPatternComponent {
    return {
        segments: [
            seg(0, 0, 0, 2),   // left top:     2-tile vertical bridge
            seg(0, 2, 0, 4),   // left bottom:  2-tile vertical bridge
            seg(0, 2, w, 2),   // top horizontal: w-tile bridge
            seg(0, 4, w, 4),   // bottom horizontal: w-tile bridge
            seg(w, 4, w, 2),   // right bottom: 2-tile vertical bridge
            seg(w, 2, w, 0),   // right top:    2-tile vertical bridge
        ],
    };
}

const BRIDGE_PATTERN: SpellPatternDefinition = {
    kind: 'bridge',
    variants: [4, 5, 6, 7, 8].map(w => ({
        variantID: `width${w}`,
        components: [buildBridgeComponent(w)],
    })),
};

// ---------------------------------------------------------------------------
// Open spell
//
// Two isolated components that mirror each other: a left piece and a right
// piece. Each component is a 5-bridge Y-shape (bracket with central spine).
// The horizontal gap between the two components varies by variant.
//
// Left component:
//
//   ——→ (rightward)
//      |
//   ←—— (leftward, back at same y)
//      |
//   ——→ (rightward)
//
// Right component mirrors this, with rightBaseX setting the left edge of the
// right-hand piece.
// ---------------------------------------------------------------------------

const OPEN_LEFT: SpellPatternComponent = {
    segments: [
        seg(0, 0, 2, 0),   // top horizontal:    2-tile rightward
        seg(2, 0, 2, 2),   // right spine top:   2-tile downward
        seg(0, 2, 2, 2),   // middle horizontal: 2-tile rightward
        seg(2, 2, 2, 4),   // right spine bottom: 2-tile downward
        seg(0, 4, 2, 4),   // bottom horizontal: 2-tile rightward
    ],
};

function buildOpenRightComponent(rightBaseX: number): SpellPatternComponent {
    const r = rightBaseX;
    return {
        segments: [
            seg(r + 2, 0, r, 0),   // top horizontal:    2-tile leftward
            seg(r,     0, r, 2),   // left spine top:    2-tile downward
            seg(r,     2, r + 2, 2),   // middle horizontal: 2-tile rightward
            seg(r,     2, r, 4),   // left spine bottom: 2-tile downward
            seg(r,     4, r + 2, 4),   // bottom horizontal: 2-tile rightward
        ],
    };
}

// rightBaseX = 4, 5, 6 gives increasing gaps between left and right pieces.
const OPEN_PATTERN: SpellPatternDefinition = {
    kind: 'open',
    variants: [4, 5, 6].map((rightBaseX, i) => ({
        variantID: `gap${i}`,
        components: [OPEN_LEFT, buildOpenRightComponent(rightBaseX)],
    })),
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All built-in spell pattern definitions, keyed by SpellKind. */
export const SPELL_PATTERNS: Readonly<Record<SpellKind, SpellPatternDefinition>> = {
    island: ISLAND_PATTERN,
    bridge: BRIDGE_PATTERN,
    open: OPEN_PATTERN,
};
