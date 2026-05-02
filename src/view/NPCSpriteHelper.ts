import Phaser from 'phaser';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { StrutBridge } from '@model/puzzle/StrutBridge';
import type { GridToWorldMapper } from './GridToWorldMapper';

/** Frame indices for the on-map 32×32 NPC expression spritesheet convention. */
export const NPC_FRAME = {
    NEUTRAL: 0,
    FROWN: 1,
    HAPPY: 2,
} as const;

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
        case 'IslandPassingBridgeCountConstraint':
            return 'Pirate-M';
        case 'IslandVisibilityConstraint':
            return 'Pirate-F';
        case 'BridgeMustCoverIslandConstraint':
            return 'sailorNS';
        case 'MustHaveWaterConstraint':
            return 'Fisherman';
        case 'IslandDirectionalBridgeConstraint':
            return 'Pirate-M';
        case 'EnclosedAreaSizeConstraint':
            return 'Farmer';
        default:
            return 'sailorNS';
    }
}

/**
 * Load all NPC sprites (expressions, faces, and characters) into the Phaser loader.
 * Call this from a scene's preload() method.
 *
 * All on-map 32×32 character sprites use the convention: a single PNG
 * spritesheet with three frames — frame 0 = neutral, frame 1 = frown, frame 2 = happy.
 */
export function loadNPCSprites(loader: Phaser.Loader.LoaderPlugin): void {
    const sheet = (key: string, path: string) =>
        loader.spritesheet(key, path, { frameWidth: 32, frameHeight: 32 });

    // Overworld and constraint NPCs
    sheet('sailorNS', 'resources/sprites/sailorNS.png');
    sheet('sailorEW', 'resources/sprites/sailorEW.png');
    sheet('Ruby', 'resources/sprites/Ruby.png');
    sheet('Fisherman', 'resources/sprites/Evan.png');   // Evan — MustHaveWaterConstraint
    sheet('Farmer', 'resources/sprites/Yan.png');    // Yan — EnclosedAreaSizeConstraint
    sheet('Pirate-M', 'resources/sprites/Pirate-M.png'); // IslandPassingBridgeCountConstraint, IslandDirectionalBridgeConstraint
    sheet('Pirate-F', 'resources/sprites/Pirate-F.png'); // IslandVisibilityConstraint
    sheet('Lyuba', 'resources/sprites/Lyuba.png');

    loader.image('LyubaCleric', 'resources/sprites/LyubaCleric.png');

    // Compass overlay spritesheet — four frames: north (0), east (1), south (2), west (3)
    loader.spritesheet('compass overlay', 'resources/sprites/compass_overlay.png', {
        frameWidth: 32,
        frameHeight: 32
    });

    // Background characters
    loader.image('Mage1', 'resources/sprites/Mage1.png');
    loader.image('Mage2', 'resources/sprites/Mage2.png');
    loader.image('Mage3', 'resources/sprites/Mage3.png');
    loader.image('Mage4', 'resources/sprites/Mage4.png');
    loader.image('Citizen1_Idle', 'resources/sprites/Citizen1_Idle.png');
    loader.image('Citizen2_Idle', 'resources/sprites/Citizen2_Idle.png');
    loader.image('Fighter2_Idle', 'resources/sprites/Fighter2_Idle.png');

    // High-resolution face sprites for conversations (individual images, unaffected by the 3-frame convention)
    loader.image('faces/Lyuba neutral', 'resources/sprites/faces/Lyuba neutral.png');
    loader.image('faces/Lyuba happy', 'resources/sprites/faces/Lyuba happy.png');
    loader.image('faces/Lyuba frown', 'resources/sprites/faces/Lyuba frown.png');
    loader.image('faces/Lyuba cleric neutral', 'resources/sprites/faces/Lyuba cleric neutral.png');
    loader.image('faces/Lyuba cleric happy', 'resources/sprites/faces/Lyuba cleric happy.png');
    loader.image('faces/Lyuba cleric frown', 'resources/sprites/faces/Lyuba cleric frown.png');
    loader.image('faces/Lyuba cleric vhappy', 'resources/sprites/faces/Lyuba cleric vhappy.png');
    loader.image('faces/Lyuba cleric wink', 'resources/sprites/faces/Lyuba cleric wink.png');
    loader.image('faces/Ruby neutral', 'resources/sprites/faces/Ruby neutral.png');
    loader.image('faces/Ruby happy', 'resources/sprites/faces/Ruby happy.png');
    loader.image('faces/Ruby frown', 'resources/sprites/faces/Ruby frown.png');
    loader.image('faces/Ruby happyish', 'resources/sprites/faces/Ruby happyish.png');
    loader.image('faces/Ruby wink', 'resources/sprites/faces/Ruby wink.png');
    loader.image('faces/Evan neutral', 'resources/sprites/faces/Evan_face_neutral.png');
    loader.image('faces/Evan happy', 'resources/sprites/faces/Evan_face_like.png');
    loader.image('faces/Evan frown', 'resources/sprites/faces/Evan_face_dislike.png');
    loader.image('faces/Yan neutral', 'resources/sprites/faces/Yan_face_casual_neutral.png');
    loader.image('faces/Yan happy', 'resources/sprites/faces/Yan_face_casual_happy.png');
    loader.image('faces/Yan frown', 'resources/sprites/faces/Yan_face_casual_dislike.png');
    loader.image('faces/Pirate-F neutral', 'resources/sprites/faces/Pirate-F neutral.png');
}

/**
 * Shared logic for managing StrutBridge NPC sprites in a puzzle renderer.
 *
 * Iterates over all bridges in the puzzle; for each StrutBridge:
 * - When placed: computes the strut location, creates the sprite via `createSprite`
 *   on first encounter (then stores it), applies common setup (origin, depth),
 *   repositions it, and makes it visible.
 * - When not placed: hides the sprite if one exists.
 *
 * @param puzzle          The current puzzle state.
 * @param strutBridgeNPCs Renderer-owned map of bridge ID → NPC sprite (mutated in-place).
 * @param gridMapper      Converts grid coordinates to world coordinates.
 * @param createSprite    Renderer-specific factory; called once per StrutBridge to
 *                        create and register the Phaser sprite at the given world
 *                        position.  Should not set origin or depth — those are applied
 *                        here after creation.
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
                npc.setOrigin(0, 0);
                npc.setDepth(101);
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
