import Phaser from 'phaser';
import { NPC } from '@model/conversation/NPC';
import type { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import type { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';
import type { GridToWorldMapper } from '@view/GridToWorldMapper';
import type { Interactable } from '@view/InteractionCursor';
import { getNPCSpriteKey, getNPCIdleAnimationKey } from '@view/NPCSpriteHelper';
import { attachTestMarker, isTestMode } from '@helpers/TestMarkers';

/**
 * Manages constraint NPC sprites in the overworld.
 *
 * Constraint NPCs are the on-map "puzzle adviser" characters that represent
 * per-island or per-cell puzzle constraints.  They are spawned from puzzle
 * display items rather than from a Tiled NPC object layer.
 *
 * Responsibilities:
 * - Loading constraint NPCs from puzzle definitions at map creation time
 * - Creating Phaser sprites (base + optional count / compass overlays)
 * - Hiding and showing constraint NPCs when the player enters / exits a puzzle
 * - Flipping disguise textures to the "revealed" variant when a puzzle is solved
 *
 * The coordinate math uses the injected `gridMapper` (pixel ↔ tile conversion),
 * which is the same {@link GridToWorldMapper} used by the rest of the scene.
 * No separate coordinate helper class is needed; the conversion is a simple
 * `worldToGrid(puzzleBounds.x, puzzleBounds.y)` call followed by arithmetic on
 * the puzzle-relative island/cell position.
 *
 * View layer — depends on a Phaser Scene for sprite creation.
 */
export class ConstraintNPCManager {
    private readonly scene: Phaser.Scene;
    private readonly puzzleManager: OverworldPuzzleManager;
    private readonly gridMapper: GridToWorldMapper;
    private readonly gameState: OverworldGameState;
    private readonly npcAppearanceRegistry: NPCAppearanceRegistry;
    private readonly tiledMapData: any;
    private readonly addNPC: (npc: NPC) => void;
    private readonly hasNPC: (npcId: string) => boolean;
    private readonly addInteractable: (interactable: Interactable) => void;

    /** Sprite registry shared with NPCSpriteController (added by ConstraintNPCManager). */
    private readonly constraintNPCSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
    /** Count-overlay sprites keyed by NPC ID. */
    private readonly constraintNumberSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
    /** Compass-direction overlay sprites keyed by NPC ID. */
    private readonly constraintCompassSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
    /**
     * Disguise sprite keys for constraint NPCs that change appearance when the
     * associated puzzle is solved.  Keyed by NPC ID.
     */
    private readonly constraintDisguiseKeys: Map<string, { normalKey: string; solvedKey: string }> = new Map();

    constructor(
        scene: Phaser.Scene,
        puzzleManager: OverworldPuzzleManager,
        gridMapper: GridToWorldMapper,
        gameState: OverworldGameState,
        npcAppearanceRegistry: NPCAppearanceRegistry,
        tiledMapData: any,
        addNPC: (npc: NPC) => void,
        hasNPC: (npcId: string) => boolean,
        addInteractable: (interactable: Interactable) => void,
    ) {
        this.scene = scene;
        this.puzzleManager = puzzleManager;
        this.gridMapper = gridMapper;
        this.gameState = gameState;
        this.npcAppearanceRegistry = npcAppearanceRegistry;
        this.tiledMapData = tiledMapData;
        this.addNPC = addNPC;
        this.hasNPC = hasNPC;
        this.addInteractable = addInteractable;
    }

    /**
     * Load all constraint NPCs from overworld puzzle definitions.
     * For each personified constraint, creates a sprite and registers the NPC
     * as an interactable.
     */
    loadConstraintNPCs(): void {
        console.log('Loading constraint NPCs from overworld puzzles...');

        const tileW: number = this.tiledMapData?.tilewidth ?? 32;
        const tileH: number = this.tiledMapData?.tileheight ?? 32;

        const puzzles = this.puzzleManager.getAllPuzzles();
        let constraintNPCCount = 0;

        for (const [puzzleId, puzzle] of puzzles) {
            if (!puzzle.constraints || puzzle.constraints.length === 0) continue;

            for (const constraint of puzzle.constraints) {
                if (!constraint.personified) continue;

                const displayItems = constraint.getDisplayItems(puzzle);

                for (const item of displayItems) {
                    const puzzleDefinition = this.puzzleManager.getPuzzleDefinitionById(puzzleId);
                    if (!puzzleDefinition) {
                        console.warn(`Could not find puzzle definition for ${puzzleId}`);
                        continue;
                    }

                    // Puzzle bounds are in pixels — convert to tile coordinates first.
                    const { x: puzzleTileX, y: puzzleTileY } = this.gridMapper.worldToGrid(
                        puzzleDefinition.bounds.x,
                        puzzleDefinition.bounds.y
                    );

                    let overworldTileX: number;
                    let overworldTileY: number;
                    let elementLabel: string;

                    if (item.position) {
                        overworldTileX = puzzleTileX + item.position.x;
                        overworldTileY = puzzleTileY + item.position.y;
                        elementLabel = item.elementID;
                    } else {
                        const island = puzzle.islands.find(i => i.id === item.elementID);
                        if (!island) {
                            console.warn(`Could not find island ${item.elementID} in puzzle ${puzzleId}`);
                            continue;
                        }
                        overworldTileX = puzzleTileX + island.x;
                        overworldTileY = puzzleTileY + island.y;
                        elementLabel = island.id;
                    }

                    const npcId = `constraint-${puzzleId}-${constraint.constructor.name}-${elementLabel}`;

                    if (this.hasNPC(npcId)) continue;

                    const conversationFile = item.conversationFile ?? constraint.conversationFile;
                    const conversationFileSolved = item.conversationFileSolved ?? constraint.conversationFileSolved;
                    const appearanceId = item.disguiseSpriteKey ?? getNPCSpriteKey(item.constraintType);

                    const npc = new NPC(
                        npcId,
                        elementLabel,
                        overworldTileX,
                        overworldTileY,
                        'grass',
                        appearanceId,
                        conversationFile,
                        conversationFileSolved,
                        undefined,
                        item.conversationVariables,
                        item.animate ?? false
                    );

                    this.addNPC(npc);

                    this.addInteractable({
                        type: 'npc',
                        tileX: overworldTileX,
                        tileY: overworldTileY,
                        data: { npc }
                    });

                    const { x: worldX, y: worldY } = this.gridMapper.gridToWorld(overworldTileX, overworldTileY + 1);
                    const sprite = this.scene.add.sprite(worldX, worldY, appearanceId);
                    sprite.setOrigin(0, 1);
                    sprite.setDepth(worldY);
                    this.constraintNPCSprites.set(npc.id, sprite);

                    if (item.disguiseSpriteKey && item.disguiseSpriteSolvedKey) {
                        this.constraintDisguiseKeys.set(npc.id, {
                            normalKey: item.disguiseSpriteKey,
                            solvedKey: item.disguiseSpriteSolvedKey,
                        });
                    }

                    if (item.requiredCount !== undefined && item.requiredCount >= 1 && item.requiredCount <= 8) {
                        const numberSprite = this.scene.add.sprite(
                            worldX + tileW / 2,
                            worldY - tileH / 2,
                            'counts overlay',
                            item.requiredCount - 1
                        );
                        numberSprite.setOrigin(0.5, 0.5);
                        numberSprite.setDepth(worldY + 1);
                        this.constraintNumberSprites.set(npc.id, numberSprite);
                    }

                    if (item.compassFrame !== undefined) {
                        const compassSprite = this.scene.add.sprite(
                            worldX + tileW / 2,
                            worldY - tileH / 2,
                            'compass overlay',
                            item.compassFrame
                        );
                        compassSprite.setOrigin(0.5, 0.5);
                        compassSprite.setDepth(worldY + 2);
                        this.constraintCompassSprites.set(npc.id, compassSprite);
                    }

                    if (isTestMode()) {
                        attachTestMarker(this.scene, sprite, {
                            id: `npc-${npc.id}`,
                            testId: `npc-${npc.id}`,
                            width: tileW,
                            height: tileH,
                            showBorder: true
                        });
                        console.log(`[TEST] Added test marker for constraint NPC: ${npc.id} at tile (${overworldTileX}, ${overworldTileY}), world (${worldX}, ${worldY})`);
                    }

                    if (npc.animate) {
                        const animKey = getNPCIdleAnimationKey(appearanceId, this.npcAppearanceRegistry);
                        if (animKey) sprite.play(animKey);
                    }

                    constraintNPCCount++;
                    console.log(`Loaded constraint NPC: ${npcId} at (${overworldTileX}, ${overworldTileY}), appearance: ${appearanceId}, conversation: ${conversationFile || 'none'}`);
                }
            }
        }

        console.log(`✓ Created ${constraintNPCCount} constraint NPCs from overworld puzzles`);
    }

    /**
     * Hide constraint NPCs (and their count/compass overlays) for a specific
     * puzzle.  Called when entering puzzle mode so EmbeddedPuzzleRenderer's NPCs
     * are visible instead.
     */
    hideConstraintNPCsForPuzzle(puzzleId: string): void {
        const prefix = `constraint-${puzzleId}-`;
        this.setConstraintNPCsVisible(prefix, false, false);
        console.log(`Hidden constraint NPCs for puzzle: ${puzzleId}`);
    }

    /**
     * Show constraint NPCs (and their count/compass overlays) for a specific
     * puzzle.  Called when exiting puzzle mode to restore overworld NPCs.
     * Flips disguise textures to their "revealed" variant if the puzzle is solved.
     */
    showConstraintNPCsForPuzzle(puzzleId: string): void {
        const prefix = `constraint-${puzzleId}-`;
        const isSolved = this.gameState.isPuzzleCompleted(puzzleId);
        this.setConstraintNPCsVisible(prefix, true, isSolved);
        console.log(`Shown constraint NPCs for puzzle: ${puzzleId}`);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private setConstraintNPCsVisible(prefix: string, visible: boolean, applyDisguise: boolean): void {
        for (const [npcId, sprite] of this.constraintNPCSprites) {
            if (!npcId.startsWith(prefix)) continue;
            sprite.setVisible(visible);
            if (applyDisguise) {
                const disguise = this.constraintDisguiseKeys.get(npcId);
                if (disguise) {
                    sprite.setTexture(disguise.solvedKey);
                }
            } else if (!visible) {
                // no texture change needed when hiding
            }
        }

        for (const [npcId, numberSprite] of this.constraintNumberSprites) {
            if (npcId.startsWith(prefix)) numberSprite.setVisible(visible);
        }

        for (const [npcId, compassSprite] of this.constraintCompassSprites) {
            if (npcId.startsWith(prefix)) compassSprite.setVisible(visible);
        }
    }
}
