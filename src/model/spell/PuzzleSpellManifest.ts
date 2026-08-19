import type { SpellKind } from './SpellPatternRegistry';

// ---------------------------------------------------------------------------
// Effect payload types
// ---------------------------------------------------------------------------

/**
 * Effect payload for the 'island' spell.
 *
 * The `spawnObjectID` references a point object in the `spell_effects` Tiled
 * layer. That object's world-space position is converted to puzzle-local
 * coordinates by MapPuzzleSpellExtractor.
 */
export interface IslandSpellEffect {
    readonly spawnObjectID: number;
    /** Optional: distance in pixels the island rises during the animation. Defaults to 64. */
    readonly riseDistancePx?: number;
    /** Optional: animation duration in milliseconds. Defaults to 800. */
    readonly durationMs?: number;
    /** Optional: particle colour for the rising effect. Defaults to 'blue' (water context). */
    readonly particleColour?: string;
}

/**
 * Effect payload for the 'bridge' spell.
 *
 * The bridge appears placed in the puzzle at the start/end position.
 * The player may subsequently pick it up and move it.
 */
export interface BridgeSpellEffect {
    readonly startObjectID: number;
    readonly endObjectID: number;
    readonly bridgeType: 'normal' | 'strut';
    /** Optional: particle colour for the appearance animation. Defaults to 'blue'. */
    readonly particleColour?: string;
}

/**
 * Effect payload for the 'open' spell.
 *
 * The wall rectangles are referenced by object IDs in the `spell_effects`
 * Tiled layer. Tile bounds are derived from the rectangle dimensions.
 */
export interface OpenSpellEffect {
    readonly leftWallObjectID: number;
    readonly rightWallObjectID: number;
    /** Number of tiles to shift the left wall leftward. */
    readonly leftShiftTiles: number;
    /** Number of tiles to shift the right wall rightward. */
    readonly rightShiftTiles: number;
    /** Optional: particle colour. Defaults to 'blue' for water context. */
    readonly particleColour?: string;
}

export type SpellEffect = IslandSpellEffect | BridgeSpellEffect | OpenSpellEffect;

// ---------------------------------------------------------------------------
// Per-spell definition (puzzle-level)
// ---------------------------------------------------------------------------

/**
 * One spell that a puzzle can support.
 *
 * There is at most one spell of each `kind` per puzzle, so `kind` serves as
 * the unique identifier within the owning puzzle's manifest.
 */
export interface PuzzleSpellDefinition {
    readonly kind: SpellKind;
    /** Optional: ID of a point object in the `spell_effects` layer for the landscape glyph. */
    readonly landscapeGlyphAnchorID?: number;
    readonly effect: SpellEffect;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * All spells supported by a single puzzle.
 *
 * Parsed from the `spellMetadata` JSON property on the puzzle object in the
 * `puzzles` Tiled layer (for overworld puzzles), or from a `spells` array
 * field in puzzle JSON (for standalone series puzzles).
 */
export interface PuzzleSpellManifest {
    readonly spells: readonly PuzzleSpellDefinition[];
}

// ---------------------------------------------------------------------------
// JSON shape for the spellMetadata Tiled property
// ---------------------------------------------------------------------------

/**
 * The raw JSON shape stored in the `spellMetadata` custom property of a
 * puzzle object in the Tiled `puzzles` layer.
 *
 * This is the serialisable form that MapPuzzleSpellExtractor reads. It mirrors
 * PuzzleSpellManifest but uses `objectID` references (Tiled object IDs) rather
 * than resolved coordinates.
 */
export interface TiledSpellMetadata {
    readonly spells: readonly TiledSpellEntry[];
}

export interface TiledSpellEntry {
    readonly kind: SpellKind;
    readonly landscapeGlyphAnchorId?: number;
    // island
    readonly spawnObjectId?: number;
    readonly riseDistancePx?: number;
    readonly durationMs?: number;
    // bridge
    readonly startObjectId?: number;
    readonly endObjectId?: number;
    readonly bridgeType?: 'normal' | 'strut';
    // open
    readonly leftWallObjectId?: number;
    readonly rightWallObjectId?: number;
    readonly leftShiftTiles?: number;
    readonly rightShiftTiles?: number;
    // shared optional
    readonly particleColour?: string;
}
