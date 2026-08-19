import type { BridgePuzzle, BridgeTypeSpec } from '@model/puzzle/BridgePuzzle';
import { createBridgeType } from '@model/puzzle/BridgeType';
import type {
    BridgeSpellEffect,
    IslandSpellEffect,
    OpenSpellEffect,
    PuzzleSpellDefinition,
} from '@model/spell/PuzzleSpellManifest';
import type { SpellKind } from '@model/spell/SpellPatternRegistry';

function spellIslandID(puzzleID: string, kind: SpellKind): string {
    return `spell_${puzzleID}_${kind}_island`;
}

function spellBridgeTypeID(puzzleID: string, kind: SpellKind): string {
    return `spell_${puzzleID}_${kind}_bridge`;
}

function applyIslandEffect(puzzle: BridgePuzzle, kind: SpellKind, effect: IslandSpellEffect): void {
    const spawn = effect.spawnLocal;
    if (!spawn) return;
    puzzle.addRuntimeIsland({
        id: spellIslandID(puzzle.id, kind),
        x: spawn.x,
        y: spawn.y,
    });
}

function applyBridgeEffect(puzzle: BridgePuzzle, kind: SpellKind, effect: BridgeSpellEffect): void {
    if (!effect.startLocal || !effect.endLocal) return;
    const bridgeTypeSpec: BridgeTypeSpec = {
        id: spellBridgeTypeID(puzzle.id, kind),
        count: 1,
        mustCoverIsland: effect.bridgeType === 'strut',
        colour: effect.bridgeType === 'strut' ? '#8b8b8b' : '#8b4513',
    };
    const bridge = puzzle.addRuntimeBridge(effect.startLocal, effect.endLocal, bridgeTypeSpec);
    if (effect.bridgeType === 'strut') {
        bridge.type = createBridgeType({
            id: bridge.type.id,
            colour: bridge.type.colour,
            length: bridge.type.length,
            width: bridge.type.width,
            style: bridge.type.style,
            mustCoverIsland: true,
        });
    }
}

function applyOpenEffect(puzzle: BridgePuzzle, effect: OpenSpellEffect): void {
    if (!effect.openedLocalTiles || effect.openedLocalTiles.length === 0) return;
    puzzle.markTilesOpened(effect.openedLocalTiles);
}

/**
 * Apply a spell's permanent model mutation to a puzzle.
 * Idempotent when underlying puzzle mutation APIs are idempotent.
 */
export function applySpellPermanentEffect(
    puzzle: BridgePuzzle,
    spell: PuzzleSpellDefinition,
): void {
    if (spell.kind === 'island') {
        applyIslandEffect(puzzle, spell.kind, spell.effect as IslandSpellEffect);
        return;
    }
    if (spell.kind === 'bridge') {
        applyBridgeEffect(puzzle, spell.kind, spell.effect as BridgeSpellEffect);
        return;
    }
    if (spell.kind === 'open') {
        applyOpenEffect(puzzle, spell.effect as OpenSpellEffect);
    }
}
