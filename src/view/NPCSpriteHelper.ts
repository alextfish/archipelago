import Phaser from 'phaser';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { StrutBridge } from '@model/puzzle/StrutBridge';
import type { GridToWorldMapper } from './GridToWorldMapper';

/**
 * Returns the base sprite key (texture atlas key) to use for the NPC that
 * represents a given constraint type.
 *
 * Add new entries here when new constraint types need their own character.
 */
export function getNPCSpriteKey(constraintType: string | undefined): string {
    switch (constraintType) {
        case 'IslandBridgeCountConstraint':
            return 'Ruby';
        case 'BridgeMustCoverIslandConstraint':
            return 'sailorNS';
        default:
            return 'sailorNS';
    }
}

/**
 * Shared logic for managing StrutBridge NPC sprites in a puzzle renderer.
 *
 * Iterates over all bridges in the puzzle; for each StrutBridge:
 * - When placed: computes the strut location, creates the sprite via `createSprite`
 *   on first encounter (then stores it), repositions it, and makes it visible.
 * - When not placed: hides the sprite if one exists.
 *
 * @param puzzle          The current puzzle state.
 * @param strutBridgeNPCs Renderer-owned map of bridge ID → NPC sprite (mutated in-place).
 * @param gridMapper      Converts grid coordinates to world coordinates.
 * @param createSprite    Renderer-specific factory; called once per StrutBridge to
 *                        create the Phaser sprite at the given world position.
 */
export function updateStrutBridgeNPCSprites(
    puzzle: BridgePuzzle,
    strutBridgeNPCs: Map<string, Phaser.GameObjects.Sprite>,
    gridMapper: GridToWorldMapper,
    createSprite: (worldPos: { x: number; y: number }) => Phaser.GameObjects.Sprite,
): void {
    for (const bridge of puzzle.bridges) {
        if (!(bridge instanceof StrutBridge)) continue;

        if (bridge.start && bridge.end) {
            const strutLoc = bridge.getStrutLocation(puzzle);
            if (!strutLoc) continue;
            const worldPos = gridMapper.gridToWorld(strutLoc.x, strutLoc.y);

            let npc = strutBridgeNPCs.get(bridge.id);
            if (!npc) {
                npc = createSprite(worldPos);
                strutBridgeNPCs.set(bridge.id, npc);
            } else {
                npc.setPosition(worldPos.x, worldPos.y);
            }
            npc.setVisible(true);
        } else {
            const npc = strutBridgeNPCs.get(bridge.id);
            if (npc) {
                npc.setVisible(false);
            }
        }
    }
}
