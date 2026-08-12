import type { BridgeTypeSpec } from '@model/puzzle/BridgePuzzle';
import type { Island } from '@model/puzzle/Island';

export type PuzzleSpellGlyph = 'island' | 'bridge' | 'open';

export interface SpellGridPoint {
    x: number;
    y: number;
}

export interface SpellRect {
    x: number;
    y: number;
    width: number;
    height: number;
    objectName?: string;
}

export type SpellIslandRef = string | SpellGridPoint;

export interface SpellTraceBridgeSpec {
    start: SpellIslandRef;
    end: SpellIslandRef;
    count?: number;
}

export interface SpellTraceComponentSpec {
    islands?: SpellIslandRef[];
    bridges: SpellTraceBridgeSpec[];
}

export interface SpellGlyphPlacement {
    x: number;
    y: number;
    coordinateSpace?: 'grid' | 'world';
    frame?: number;
    scale?: number;
}

export interface SpellNearbyGlyphPlacement extends SpellGlyphPlacement {
    word: string;
    language?: 'grass' | 'fire';
}

export interface SpellRectReference {
    objectName: string;
}

export interface IslandSpellEffectSpec {
    type: 'island';
    island: Island;
}

export interface BridgeSpellEffectSpec {
    type: 'bridge';
    bridgeId?: string;
    bridgeType: BridgeTypeSpec;
    start: SpellGridPoint;
    end: SpellGridPoint;
}

export interface OpenSpellEffectSpec {
    type: 'open';
    openedTiles: SpellGridPoint[];
    leftWall?: SpellRect | SpellRectReference | string;
    rightWall?: SpellRect | SpellRectReference | string;
}

export type PuzzleSpellEffectSpec =
    | IslandSpellEffectSpec
    | BridgeSpellEffectSpec
    | OpenSpellEffectSpec;

export interface PuzzleSpellSpec {
    id: string;
    glyph: PuzzleSpellGlyph;
    glyphLanguage?: 'grass' | 'fire';
    trace: {
        components: SpellTraceComponentSpec[];
    };
    glyphPlacement?: SpellGlyphPlacement;
    nearbyGlyphs?: SpellNearbyGlyphPlacement[];
    effect: PuzzleSpellEffectSpec;
}
