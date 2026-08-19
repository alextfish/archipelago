import type { SpellKind } from './SpellPatternRegistry';

/**
 * Persisted spell progress for a single puzzle.
 *
 * Only the kinds of spells that have been cast at least once are stored.
 * All permanent side-effects (new island, new bridge, opened tiles) are
 * fully determined by the puzzle's SpellManifest, so there is no need to
 * store them separately. On load, the runtime rebuilds those effects from
 * the manifest and the list of cast kinds.
 */
export interface PuzzleSpellProgress {
    /** Kinds of spells that have been cast (at least once) in this puzzle. */
    readonly castSpellKinds: readonly SpellKind[];
}

/**
 * Check whether a spell kind has already been cast in the given progress.
 */
export function hasBeenCast(progress: PuzzleSpellProgress, kind: SpellKind): boolean {
    return progress.castSpellKinds.includes(kind);
}

/**
 * Return a new progress record with the given kind recorded as cast.
 * Idempotent: if the kind is already present, the original object is returned.
 */
export function recordCast(progress: PuzzleSpellProgress, kind: SpellKind): PuzzleSpellProgress {
    if (hasBeenCast(progress, kind)) return progress;
    return { castSpellKinds: [...progress.castSpellKinds, kind] };
}

/** An empty spell progress record (no spells cast yet). */
export const EMPTY_SPELL_PROGRESS: PuzzleSpellProgress = { castSpellKinds: [] };
