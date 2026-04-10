import Phaser from 'phaser';
import type { IPuzzleView } from './IPuzzleView';
import type { PuzzleRenderer } from './PuzzleRenderer';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { BridgeType } from '@model/puzzle/BridgeType';
import type { Point } from '@model/puzzle/Point';
import { GridToWorldMapper } from './GridToWorldMapper';
import type { ActiveGlyphTracker } from '@model/translation/ActiveGlyphTracker';
import { BasePuzzleRenderer } from './BasePuzzleRenderer';

/**
 * Puzzle renderer that works embedded within the overworld scene.
 * Draws puzzle elements on top of the existing overworld map using a
 * Phaser Container so that depth, visibility, and alpha are managed
 * as a group.
 *
 * Differences from PhaserPuzzleRenderer:
 * - Uses a 32px cell size and an offset derived from puzzleBounds.
 * - Does NOT create island tile sprites (the overworld already shows biome art).
 * - Nests every created GameObject in puzzleContainer via onGameObjectCreated().
 * - Uses camera.getWorldPoint() for screenToGrid (camera is already scrolled to
 *   the overworld position).
 */
export class EmbeddedPuzzleRenderer extends BasePuzzleRenderer implements IPuzzleView, PuzzleRenderer {
    protected puzzleBounds: Phaser.Geom.Rectangle;
    protected puzzleContainer: Phaser.GameObjects.Container;

    constructor(
        scene: Phaser.Scene,
        puzzleBounds: Phaser.Geom.Rectangle,
        textureKey = 'sprout-tiles',
        languageTilesetKey = 'language',
        npcSpriteKey = 'Ruby',
    ) {
        const gridMapper = new GridToWorldMapper(32, {
            offsetX: puzzleBounds.x,
            offsetY: puzzleBounds.y,
        });
        super(scene, gridMapper, textureKey, languageTilesetKey, npcSpriteKey);

        this.puzzleBounds = puzzleBounds;

        this.puzzleContainer = scene.add.container(0, 0);
        this.puzzleContainer.setDepth(100);
    }

    // -------------------------------------------------------------------------
    // Hook: nest every created object inside puzzleContainer
    // -------------------------------------------------------------------------

    protected override onGameObjectCreated(go: Phaser.GameObjects.GameObject): void {
        this.puzzleContainer.add(go);
    }

    // -------------------------------------------------------------------------
    // Glyph tracker (translation-mode overlay, overworld-only)
    // -------------------------------------------------------------------------

    setGlyphTracker(tracker: ActiveGlyphTracker): void {
        this.glyphTracker = tracker;
        if (this.feedbackDisplay) {
            this.feedbackDisplay.setGlyphTracker(tracker);
        }
    }

    // -------------------------------------------------------------------------
    // init — no island sprite; overworld biome art already visible beneath
    // -------------------------------------------------------------------------

    init(puzzle: BridgePuzzle): void {
        console.log(`EmbeddedPuzzleRenderer: Initializing puzzle ${puzzle.id} at bounds (${this.puzzleBounds.x}, ${this.puzzleBounds.y})`);
        // Reset all graphics before initialising so that calling init() a second
        // time on the same renderer starts cleanly.
        this.destroy();

        for (const island of puzzle.islands) {
            this.createConstraintNPCForIsland(island);
        }
    }

    // -------------------------------------------------------------------------
    // screenToGrid — uses Phaser's camera.getWorldPoint to account for zoom
    // -------------------------------------------------------------------------

    screenToGrid(screenX: number, screenY: number): Point {
        const camera = this.scene.cameras.main;
        const worldPoint = camera.getWorldPoint(screenX, screenY);
        const gridPos = this.gridMapper.worldToGrid(worldPoint.x, worldPoint.y);
        return { x: gridPos.x, y: gridPos.y };
    }

    // -------------------------------------------------------------------------
    // clearHighlights — extends base to also clear any tints set by
    // highlightIslands() / flashBridges() (overworld-specific methods).
    // -------------------------------------------------------------------------

    override clearHighlights(): void {
        super.clearHighlights();

        for (const npcSprite of this.constraintNPCs.values()) {
            npcSprite.clearTint();
        }
        for (const container of this.bridgeGraphics.values()) {
            container.list.forEach((child) => {
                if ('clearTint' in child && typeof (child as { clearTint(): void }).clearTint === 'function') {
                    (child as { clearTint(): void }).clearTint();
                }
            });
        }
    }

    // -------------------------------------------------------------------------
    // destroy — extends base to also tear down and recreate puzzleContainer
    // -------------------------------------------------------------------------

    override destroy(): void {
        super.destroy();

        if (this.puzzleContainer) {
            this.puzzleContainer.destroy();
            this.puzzleContainer = this.scene.add.container(0, 0);
            this.puzzleContainer.setDepth(100);
            this.puzzleContainer.setVisible(true);
        }
    }

    // -------------------------------------------------------------------------
    // Overworld-specific convenience methods (not in PuzzleRenderer interface)
    // -------------------------------------------------------------------------

    /**
     * Tint island NPC sprites with the given colour.
     * Used for hover / selection feedback in overworld puzzles.
     */
    highlightIslands(islandIDs: string[], colour: number = 0x00ff00): void {
        for (const islandID of islandIDs) {
            const npcSprite = this.constraintNPCs.get(islandID);
            if (npcSprite) {
                npcSprite.setTint(colour);
            }
        }
    }

    /**
     * Briefly flash the specified bridge containers with a tint.
     */
    flashBridges(bridgeIDs: string[], colour: number = 0xff0000, duration: number = 500): void {
        for (const bridgeID of bridgeIDs) {
            const container = this.bridgeGraphics.get(bridgeID);
            if (container) {
                container.list.forEach((child) => {
                    if ('setTint' in child && typeof (child as { setTint(c: number): void }).setTint === 'function') {
                        (child as { setTint(c: number): void }).setTint(colour);
                    }
                });

                this.scene.time.delayedCall(duration, () => {
                    container.list.forEach((child) => {
                        if ('clearTint' in child && typeof (child as { clearTint(): void }).clearTint === 'function') {
                            (child as { clearTint(): void }).clearTint();
                        }
                    });
                });
            }
        }
    }

    /**
     * Not used in overworld embedded context; available bridge counts are
     * managed by an external UI overlay.
     */
    setAvailableBridgeCounts(_counts: Map<string, number>): void {
        // no-op in embedded context
    }

    // -------------------------------------------------------------------------
    // gridToWorld — also exposed as part of IPuzzleView; inherited from base
    // Redeclared here to satisfy the interface explicitly.
    // -------------------------------------------------------------------------

    override gridToWorld(gridX: number, gridY: number): Point {
        return super.gridToWorld(gridX, gridY);
    }

    // -------------------------------------------------------------------------
    // showPreview / hidePreview typed for BridgeType (IPuzzleView)
    // -------------------------------------------------------------------------

    override showPreview(start: Point, end: Point, bridgeType: BridgeType): void {
        super.showPreview(start, end, bridgeType);
    }

    override hidePreview(): void {
        super.hidePreview();
    }
}
