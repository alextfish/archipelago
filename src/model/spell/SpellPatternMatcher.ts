import type { Bridge } from '@model/puzzle/Bridge';
import {
    SPELL_PATTERNS,
    type SpellKind,
    type SpellPatternComponent,
    type SpellPatternVariant,
} from './SpellPatternRegistry';

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

/** One matched component within a spell match. */
export interface SpellMatchComponent {
    /** Index of the component definition (within the variant) that was satisfied. */
    readonly componentIndex: number;
    /** IDs of bridges whose placements collectively satisfy this component. */
    readonly matchedBridgeIDs: readonly string[];
    /**
     * Translation offset applied to the canonical pattern to reach this match.
     * (offset.x, offset.y) are in grid tile units.
     */
    readonly offsetX: number;
    readonly offsetY: number;
}

/** A single spell match found in the current puzzle state. */
export interface SpellMatch {
    readonly kind: SpellKind;
    readonly variantID: string;
    /** One entry per component in the matched variant. */
    readonly components: readonly SpellMatchComponent[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** A bridge endpoint pair in puzzle-local grid coordinates. */
interface GridSegment {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    /** ID of the bridge this segment came from. */
    readonly bridgeID: string;
}

/** A connected component of grid segments (bridges). */
interface SegmentComponent {
    readonly segments: GridSegment[];
    readonly bridgeIDs: Set<string>;
}

/** Normalise a segment so x1 ≤ x2; when equal, y1 ≤ y2. */
function normaliseSegment(
    x1: number, y1: number, x2: number, y2: number,
): [number, number, number, number] {
    if (x1 > x2 || (x1 === x2 && y1 > y2)) {
        return [x2, y2, x1, y1];
    }
    return [x1, y1, x2, y2];
}

function segKey(x1: number, y1: number, x2: number, y2: number): string {
    const [nx1, ny1, nx2, ny2] = normaliseSegment(x1, y1, x2, y2);
    return `${nx1},${ny1},${nx2},${ny2}`;
}

/**
 * Convert placed bridges into grid segments.
 *
 * Each placed bridge produces exactly one segment with the bridge's start and
 * end coordinates. Non-orthogonal or zero-length bridges are skipped.
 */
function bridgesToSegments(bridges: Bridge[]): GridSegment[] {
    const result: GridSegment[] = [];
    for (const bridge of bridges) {
        if (!bridge.start || !bridge.end) continue;
        const { start, end, id } = bridge;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (dx !== 0 && dy !== 0) continue; // non-orthogonal: skip
        if (dx === 0 && dy === 0) continue; // zero-length: skip
        result.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, bridgeID: id });
    }
    return result;
}

/** Build a key-set for fast existence lookup. */
function buildSegmentKeySet(segments: GridSegment[]): Set<string> {
    return new Set(segments.map(s => segKey(s.x1, s.y1, s.x2, s.y2)));
}

/**
 * Split a flat list of grid segments into connected components.
 * Two segments are connected when they share an endpoint (same grid position).
 */
function splitIntoComponents(segments: GridSegment[]): SegmentComponent[] {
    if (segments.length === 0) return [];

    const pointToSegs = new Map<string, number[]>();
    const addPoint = (key: string, idx: number): void => {
        const arr = pointToSegs.get(key);
        if (arr) arr.push(idx);
        else pointToSegs.set(key, [idx]);
    };

    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        addPoint(`${s.x1},${s.y1}`, i);
        addPoint(`${s.x2},${s.y2}`, i);
    }

    const visited = new Array<boolean>(segments.length).fill(false);
    const components: SegmentComponent[] = [];

    for (let start = 0; start < segments.length; start++) {
        if (visited[start]) continue;

        const compSegs: GridSegment[] = [];
        const compIDs = new Set<string>();
        const queue = [start];
        visited[start] = true;

        while (queue.length > 0) {
            const idx = queue.pop()!;
            const s = segments[idx];
            compSegs.push(s);
            compIDs.add(s.bridgeID);

            for (const ptKey of [`${s.x1},${s.y1}`, `${s.x2},${s.y2}`]) {
                for (const neighbour of pointToSegs.get(ptKey) ?? []) {
                    if (!visited[neighbour]) {
                        visited[neighbour] = true;
                        queue.push(neighbour);
                    }
                }
            }
        }

        components.push({ segments: compSegs, bridgeIDs: compIDs });
    }

    return components;
}

/**
 * Collect all distinct grid-point keys used by a list of segments.
 */
function componentPoints(segs: GridSegment[]): Set<string> {
    const pts = new Set<string>();
    for (const s of segs) {
        pts.add(`${s.x1},${s.y1}`);
        pts.add(`${s.x2},${s.y2}`);
    }
    return pts;
}

/**
 * Try to match a single canonical component against a candidate
 * SegmentComponent using a specific translation offset.
 *
 * Returns matchedBridgeIDs on success, or null.
 */
function tryMatchComponentAtOffset(
    canonical: SpellPatternComponent,
    candidate: SegmentComponent,
    ox: number,
    oy: number,
): string[] | null {
    if (canonical.segments.length !== candidate.segments.length) return null;

    const candidateKeys = buildSegmentKeySet(candidate.segments);

    for (const cs of canonical.segments) {
        const key = segKey(cs.x1 + ox, cs.y1 + oy, cs.x2 + ox, cs.y2 + oy);
        if (!candidateKeys.has(key)) return null;
    }

    return Array.from(candidate.bridgeIDs);
}

/**
 * Try to match a single canonical component against a candidate
 * SegmentComponent, trying all possible translation offsets derived from
 * pairing the canonical component's first segment against each candidate
 * segment.
 *
 * Returns { offsetX, offsetY, matchedBridgeIDs } on success, or null.
 */
function tryMatchComponent(
    canonical: SpellPatternComponent,
    candidate: SegmentComponent,
): { offsetX: number; offsetY: number; matchedBridgeIDs: string[] } | null {
    if (canonical.segments.length !== candidate.segments.length) return null;

    // Derive candidate translation offsets by pairing the first canonical
    // segment (in normalised form) against each candidate segment.
    const firstCanon = canonical.segments[0];
    const [cx1, cy1, cx2, cy2] = normaliseSegment(firstCanon.x1, firstCanon.y1, firstCanon.x2, firstCanon.y2);

    for (const cand of candidate.segments) {
        const [sx1, sy1, sx2, sy2] = normaliseSegment(cand.x1, cand.y1, cand.x2, cand.y2);

        // Two possible alignments of the normalised first canonical segment
        // with the normalised candidate segment.
        const offsets: Array<[number, number]> = [
            [sx1 - cx1, sy1 - cy1],
        ];
        // Only add the second offset if it produces different coordinates.
        const ox2 = sx2 - cx2;
        const oy2 = sy2 - cy2;
        if (ox2 !== offsets[0][0] || oy2 !== offsets[0][1]) {
            offsets.push([ox2, oy2]);
        }

        for (const [ox, oy] of offsets) {
            const ids = tryMatchComponentAtOffset(canonical, candidate, ox, oy);
            if (ids) {
                return { offsetX: ox, offsetY: oy, matchedBridgeIDs: ids };
            }
        }
    }

    return null;
}

/**
 * Try to match all components of a spell variant against the available puzzle
 * components. Each puzzle component may only be used once.
 *
 * All components of the same variant must be found at the SAME translation
 * offset (the one established by the first matching component). This prevents
 * spurious cross-variant matches where two independently-translated isolated
 * components happen to satisfy different-gap open variants.
 *
 * Returns an array of SpellMatchComponent on success, or null.
 */
function tryMatchVariant(
    variant: SpellPatternVariant,
    puzzleComponents: SegmentComponent[],
): SpellMatchComponent[] | null {
    const usedIndices = new Set<number>();
    const matched: SpellMatchComponent[] = [];
    let sharedOffset: { ox: number; oy: number } | null = null;

    for (let ci = 0; ci < variant.components.length; ci++) {
        const canonical = variant.components[ci];
        let found = false;

        for (let pi = 0; pi < puzzleComponents.length; pi++) {
            if (usedIndices.has(pi)) continue;

            if (sharedOffset !== null) {
                // All components after the first must use the same offset.
                const ids = tryMatchComponentAtOffset(canonical, puzzleComponents[pi], sharedOffset.ox, sharedOffset.oy);
                if (ids) {
                    usedIndices.add(pi);
                    matched.push({
                        componentIndex: ci,
                        matchedBridgeIDs: ids,
                        offsetX: sharedOffset.ox,
                        offsetY: sharedOffset.oy,
                    });
                    found = true;
                    break;
                }
            } else {
                const result = tryMatchComponent(canonical, puzzleComponents[pi]);
                if (result) {
                    sharedOffset = { ox: result.offsetX, oy: result.offsetY };
                    usedIndices.add(pi);
                    matched.push({
                        componentIndex: ci,
                        matchedBridgeIDs: result.matchedBridgeIDs,
                        offsetX: result.offsetX,
                        offsetY: result.offsetY,
                    });
                    found = true;
                    break;
                }
            }
        }

        if (!found) return null;
    }

    return matched;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure pattern-matching service.
 *
 * Accepts the currently placed bridges and the set of spell kinds to check.
 * Returns all spells whose pattern is satisfied by isolated bridge components
 * in the current puzzle state.
 *
 * No cast-mode awareness: the caller is responsible for determining whether
 * each match is a first cast or a repeat cast by consulting saved progress.
 */
export class SpellPatternMatcher {
    /**
     * @param allowedKinds - Only check these spell kinds (from the puzzle manifest).
     */
    findMatches(placedBridges: Bridge[], allowedKinds: readonly SpellKind[]): SpellMatch[] {
        const segments = bridgesToSegments(placedBridges);
        const puzzleComponents = splitIntoComponents(segments);

        // Map from bridge ID to puzzle-component index.
        const bridgeToComponentIndex = new Map<string, number>();
        for (let i = 0; i < puzzleComponents.length; i++) {
            for (const id of puzzleComponents[i].bridgeIDs) {
                bridgeToComponentIndex.set(id, i);
            }
        }

        // Grid-point sets per component, for isolation checking.
        const componentPointSets = puzzleComponents.map(c => componentPoints(c.segments));

        const results: SpellMatch[] = [];

        for (const kind of allowedKinds) {
            const definition = SPELL_PATTERNS[kind];
            if (!definition) continue;

            for (const variant of definition.variants) {
                const matchResult = tryMatchVariant(variant, puzzleComponents);
                if (!matchResult) continue;

                // Verify isolation: no bridge outside the matched components
                // may share a grid point with any matched component.
                const matchedComponentIndices = new Set(
                    matchResult.flatMap(m =>
                        m.matchedBridgeIDs.map(id => bridgeToComponentIndex.get(id) ?? -1)
                    )
                );

                const matchedPoints = new Set<string>();
                for (const idx of matchedComponentIndices) {
                    if (idx >= 0) {
                        for (const pt of componentPointSets[idx]) {
                            matchedPoints.add(pt);
                        }
                    }
                }

                let isolated = true;
                for (let pi = 0; pi < puzzleComponents.length; pi++) {
                    if (matchedComponentIndices.has(pi)) continue;
                    for (const pt of componentPointSets[pi]) {
                        if (matchedPoints.has(pt)) {
                            isolated = false;
                            break;
                        }
                    }
                    if (!isolated) break;
                }

                if (!isolated) continue;

                results.push({ kind, variantID: variant.variantID, components: matchResult });
            }
        }

        return results;
    }
}
