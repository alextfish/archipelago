import Phaser from 'phaser';
import type { PuzzleRenderer } from './PuzzleRenderer';
import type { IPuzzleView } from './IPuzzleView';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { BridgeType } from '@model/puzzle/BridgeType';
import type { Point } from '@model/puzzle/Point';
import type { Bridge } from '@model/puzzle/Bridge';
import { GridToWorldMapper } from './GridToWorldMapper';
import { orientationForDelta, normalizeRenderOrder } from './PuzzleRenderer';
import { BridgeSpriteFrames, BridgeVisualConstants } from './BridgeSpriteFrameRegistry';
import { ConstraintFeedbackDisplay } from './ConstraintFeedbackDisplay';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';
import type { ConstraintDisplayItem } from '@model/puzzle/constraints/ConstraintDisplayItem';
import { parseNumBridgesConstraint } from '@model/puzzle/Island';
import type { Island } from '@model/puzzle/Island';
import type { ActiveGlyphTracker } from '@model/translation/ActiveGlyphTracker';
import { getNPCSpriteKey, updateStrutBridgeNPCSprites } from './NPCSpriteHelper';

/**
 * Abstract base class for both puzzle renderers.
 *
 * All bridge rendering logic (placed bridges, previews, flash feedback,
 * interactive outlines, constraint NPCs) lives here so that
 * PhaserPuzzleRenderer (standalone puzzle scene) and
 * EmbeddedPuzzleRenderer (overworld overlay) share a single implementation.
 *
 * Subclasses must implement:
 *  - init()        — island sprite creation differs per context
 *  - screenToGrid() — coordinate conversion differs per context
 *
 * Subclasses may override:
 *  - onGameObjectCreated() — EmbeddedPuzzleRenderer uses this to nest every
 *                            created GameObject inside its puzzleContainer.
 */
export abstract class BasePuzzleRenderer implements PuzzleRenderer, IPuzzleView {
    protected scene: Phaser.Scene;
    protected gridMapper: GridToWorldMapper;
    protected textureKey: string;
    protected languageTilesetKey: string;
    protected npcSpriteKey: string;

    // Sprite / game-object registries
    protected islandGraphics: Map<string, Phaser.GameObjects.Sprite> = new Map();
    protected islandLabels: Map<string, Phaser.GameObjects.Text> = new Map();
    protected constraintNPCs: Map<string, Phaser.GameObjects.Sprite> = new Map();
    protected strutBridgeNPCs: Map<string, Phaser.GameObjects.Sprite> = new Map();
    protected constraintNumbers: Map<string, Phaser.GameObjects.Sprite> = new Map();
    protected bridgeGraphics: Map<string, Phaser.GameObjects.Container> = new Map();

    // Interactive hit-zones for placed bridges
    protected bridgeHitZones: Phaser.GameObjects.Zone[] = [];
    protected isPlacing: boolean = false;

    // Transient containers for preview / highlight / flash
    protected previewGraphics: Phaser.GameObjects.Container | null = null;
    protected flashGraphics: Phaser.GameObjects.Container | null = null;
    protected flashTimer: Phaser.Time.TimerEvent | null = null;
    protected highlightGraphics: Phaser.GameObjects.Container | null = null;

    protected feedbackDisplay: ConstraintFeedbackDisplay | null = null;
    protected glyphRegistry: LanguageGlyphRegistry = new LanguageGlyphRegistry();
    protected glyphTracker: ActiveGlyphTracker | null = null;

    constructor(
        scene: Phaser.Scene,
        gridMapper: GridToWorldMapper,
        textureKey: string,
        languageTilesetKey: string,
        npcSpriteKey: string,
    ) {
        this.scene = scene;
        this.gridMapper = gridMapper;
        this.textureKey = textureKey;
        this.languageTilesetKey = languageTilesetKey;
        this.npcSpriteKey = npcSpriteKey;
    }

    // -------------------------------------------------------------------------
    // Abstract interface — must be provided by subclasses
    // -------------------------------------------------------------------------

    /** Create island sprites and NPC constraint indicators for the given puzzle. */
    abstract init(puzzle: BridgePuzzle): void;

    /** Convert screen/viewport coordinates to puzzle grid coordinates. */
    abstract screenToGrid(screenX: number, screenY: number): Point;

    // -------------------------------------------------------------------------
    // Protected hook
    // -------------------------------------------------------------------------

    /**
     * Called immediately after any visual GameObject is created and added to
     * the scene display list.  EmbeddedPuzzleRenderer overrides this to also
     * nest the object inside its puzzleContainer so depth ordering and
     * visibility are managed by the container.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onGameObjectCreated(_go: Phaser.GameObjects.GameObject): void {
        // no-op: PhaserPuzzleRenderer leaves objects directly in scene
    }

    // -------------------------------------------------------------------------
    // Shared protected helpers
    // -------------------------------------------------------------------------

    /**
     * Create a constraint NPC sprite and bridge-count number sprite for an island
     * that carries an IslandBridgeCountConstraint.  Shared by both subclasses'
     * init() implementations.
     */
    protected createConstraintNPCForIsland(island: Island): void {
        const worldPos = this.gridMapper.gridToWorld(island.x, island.y);
        const num = parseNumBridgesConstraint(island);
        if (num !== null && num >= 1 && num <= 8) {
            const scale = this.gridMapper.getCellSize() / 32;

            const npcSprite = this.scene.add.sprite(worldPos.x, worldPos.y, 'Ruby', 0)
                .setOrigin(0, 0)
                .setScale(scale, scale);
            this.constraintNPCs.set(island.id, npcSprite);
            this.onGameObjectCreated(npcSprite);

            const cellSize = this.gridMapper.getCellSize();
            const numberSprite = this.scene.add.sprite(
                worldPos.x + cellSize / 2,
                worldPos.y + cellSize / 2,
                'bridge counts',
                num - 1,
            ).setOrigin(0.5, 0.5).setScale(scale, scale);
            this.constraintNumbers.set(island.id, numberSprite);
            this.onGameObjectCreated(numberSprite);
        }
    }

    // -------------------------------------------------------------------------
    // PuzzleRenderer interface — shared implementations
    // -------------------------------------------------------------------------

    updateFromPuzzle(puzzle: BridgePuzzle): void {
        this.destroyBridges();
        if (this.previewGraphics) {
            this.previewGraphics.destroy();
            this.previewGraphics = null;
        }

        // Group placed bridges by normalised start/end so that two bridges on
        // the same island-pair are rendered as a single container with double
        // bridge frames.
        const bridgeGroups: Map<string, { start: { x: number; y: number }, end: { x: number; y: number }, ids: string[] }> = new Map();
        for (const bridge of puzzle.placedBridges) {
            if (!bridge.start || !bridge.end) continue;
            const ordered = normalizeRenderOrder(bridge.start, bridge.end);
            const key = `${ordered.start.x},${ordered.start.y}:${ordered.end.x},${ordered.end.y}`;
            const existing = bridgeGroups.get(key);
            if (existing) {
                existing.ids.push(bridge.id);
            } else {
                bridgeGroups.set(key, { start: ordered.start, end: ordered.end, ids: [bridge.id] });
            }
        }

        for (const g of bridgeGroups.values()) {
            this.renderTiledBridge({ start: g.start, end: g.end, target: 'placed', useEdges: true, bridgeIds: g.ids });
        }

        this.updateStrutBridgeNPCs(puzzle);
    }

    previewBridge(bridge: Bridge, opts?: { isDouble?: boolean; isInvalid?: boolean } | null): void {
        if (!bridge.start) return;

        const isDouble = !!opts?.isDouble;
        const isInvalid = !!opts?.isInvalid;
        const tint = isInvalid ? BridgeVisualConstants.INVALID_TINT : undefined;

        if (bridge.end) {
            this.renderTiledBridge({
                start: bridge.start,
                end: bridge.end,
                target: 'preview',
                useEdges: true,
                tint,
                bridgeIds: isDouble ? ['preview-a', 'preview-b'] : undefined,
            });
        } else {
            // Half-placed bridge: show a single unfinished tile at the start island
            this.renderTiledBridge({
                start: bridge.start,
                target: 'preview',
                singleUnfinished: true,
                tint,
            });
        }

        // renderTiledBridge sets this.previewGraphics; apply alpha to the whole container
        if (this.previewGraphics) {
            this.previewGraphics.setAlpha(BridgeVisualConstants.PREVIEW_ALPHA);
        }
    }

    hidePreview(): void {
        if (this.previewGraphics) {
            this.previewGraphics.destroy();
            this.previewGraphics = null;
        }
    }

    setPlacing(isPlacing: boolean): void {
        this.isPlacing = !!isPlacing;
        for (const zone of this.bridgeHitZones) {
            try {
                if (this.isPlacing) {
                    zone.disableInteractive();
                } else {
                    const shape = (typeof zone.getData === 'function') ? zone.getData('shape') : undefined;
                    try {
                        if (shape) {
                            zone.setInteractive(shape, Phaser.Geom.Rectangle.Contains);
                        } else {
                            zone.setInteractive();
                        }
                    } catch (_e) {
                        try { (zone as unknown as { setInteractive(): void }).setInteractive(); } catch (_e2) { /* ignore */ }
                    }
                }
            } catch (_e) {
                // ignore zones that have already been destroyed
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setAvailableBridgeTypes(_types: BridgeType[]): void {
        // no-op: renderer does not manage sidebar UI
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setSelectedBridgeType(_type: BridgeType | null): void {
        // no-op
    }

    highlightViolations(ids: string[]): void {
        this.clearHighlights();

        // Create a throwaway container so clearHighlights() has something to
        // destroy as a signal that highlights are active.
        this.highlightGraphics = this.scene.add.container();

        for (const id of ids) {
            const island = this.islandGraphics.get(id);
            if (island) {
                this.scene.tweens.add({
                    targets: island,
                    alpha: 0.5,
                    duration: 100,
                    yoyo: true,
                    repeat: 2,
                });
            }

            const bridge = this.bridgeGraphics.get(id);
            if (bridge) {
                this.scene.tweens.add({
                    targets: bridge,
                    alpha: 0.5,
                    duration: 100,
                    yoyo: true,
                    repeat: 2,
                });
            }
        }
    }

    flashInvalidPlacement(start: { x: number; y: number }, end: { x: number; y: number }): void {
        if (this.flashGraphics) {
            this.flashGraphics.destroy();
            this.flashGraphics = null;
        }
        this.renderTiledBridge({
            start,
            end,
            target: 'flash',
            useEdges: false,
            tint: 0xff0000,
            temporaryDuration: 300,
        });
    }

    clearHighlights(): void {
        if (this.highlightGraphics) {
            this.highlightGraphics.destroy();
            this.highlightGraphics = null;
        }
        if (this.flashGraphics) {
            this.flashGraphics.destroy();
            this.flashGraphics = null;
        }
        if (this.flashTimer) {
            this.scene.time.removeEvent(this.flashTimer);
            this.flashTimer = null;
        }
        if (this.previewGraphics) {
            this.previewGraphics.destroy();
            this.previewGraphics = null;
        }
    }

    showConstraintFeedback(items: ConstraintDisplayItem[], puzzle: BridgePuzzle): void {
        if (!this.feedbackDisplay) {
            this.feedbackDisplay = new ConstraintFeedbackDisplay(
                this.scene,
                this.gridMapper,
                this.glyphRegistry,
                this.languageTilesetKey,
                this.npcSpriteKey,
                this.constraintNPCs,
            );
            if (this.glyphTracker) {
                this.feedbackDisplay.setGlyphTracker(this.glyphTracker);
            }
        }
        this.feedbackDisplay.update(items, puzzle);
    }

    hideConstraintFeedback(): void {
        this.feedbackDisplay?.setVisible(false);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(_dt: number): void {
        // no-op: subclasses override if they need per-frame work
    }

    gridToWorld(gridX: number, gridY: number): Point {
        const worldPos = this.gridMapper.gridToWorld(gridX, gridY);
        return { x: worldPos.x, y: worldPos.y };
    }

    destroy(): void {
        for (const sprite of this.islandGraphics.values()) { sprite.destroy(); }
        this.islandGraphics.clear();

        for (const lbl of this.islandLabels.values()) { lbl.destroy(); }
        this.islandLabels.clear();

        for (const npc of this.constraintNPCs.values()) { npc.destroy(); }
        this.constraintNPCs.clear();

        for (const npc of this.strutBridgeNPCs.values()) { npc.destroy(); }
        this.strutBridgeNPCs.clear();

        for (const num of this.constraintNumbers.values()) { num.destroy(); }
        this.constraintNumbers.clear();

        this.destroyBridges();
        this.hidePreview();

        if (this.highlightGraphics) {
            this.highlightGraphics.destroy();
            this.highlightGraphics = null;
        }
        if (this.flashGraphics) {
            this.flashGraphics.destroy();
            this.flashGraphics = null;
        }
        if (this.flashTimer) {
            this.scene.time.removeEvent(this.flashTimer);
            this.flashTimer = null;
        }
        if (this.feedbackDisplay) {
            this.feedbackDisplay.destroy();
            this.feedbackDisplay = null;
        }
    }

    // -------------------------------------------------------------------------
    // IPuzzleView interface — shared implementations
    // -------------------------------------------------------------------------

    showPreview(start: Point, end: Point, bridgeType: BridgeType): void {
        const tempBridge: Bridge = { id: 'preview', start, end, type: bridgeType };
        this.previewBridge(tempBridge);
    }

    // -------------------------------------------------------------------------
    // Internal shared helpers
    // -------------------------------------------------------------------------

    protected destroyBridges(): void {
        for (const container of this.bridgeGraphics.values()) {
            container.destroy();
        }
        this.bridgeGraphics.clear();
        this.bridgeHitZones = [];
    }

    protected updateStrutBridgeNPCs(puzzle: BridgePuzzle): void {
        const scale = this.gridMapper.getCellSize() / 32;
        updateStrutBridgeNPCSprites(puzzle, this.strutBridgeNPCs, this.gridMapper, (worldPos) => {
            const npc = this.scene.add.sprite(worldPos.x, worldPos.y, getNPCSpriteKey('BridgeMustCoverIslandConstraint'), 0)
                .setScale(scale, scale);
            this.onGameObjectCreated(npc);
            return npc;
        });
    }

    /**
     * Shared helper to render a tiled bridge between two grid positions.
     *
     * Options:
     * - start, end: grid coords.  If end is omitted and singleUnfinished is true,
     *   a single unfinished tile is rendered at start.
     * - target: 'placed' | 'preview' | 'flash' — determines which field stores
     *   the resulting container and how long it lives.
     * - bridgeIds: ids to store in bridgeGraphics when target==='placed'.
     * - useEdges: when true, end tiles use left/right (or top/bottom) frames
     *   instead of the centre frame.
     * - tint: optional hex tint applied to every tile sprite.
     * - temporaryDuration: for flash targets, the container is auto-destroyed
     *   after this many milliseconds.
     * - singleUnfinished: render a single UNFINISHED_BRIDGE tile at start.
     */
    protected renderTiledBridge(opts: {
        start: { x: number; y: number };
        end?: { x: number; y: number };
        target: 'placed' | 'preview' | 'flash';
        bridgeId?: string;
        bridgeIds?: string[];
        useEdges?: boolean;
        alpha?: number;
        tint?: number;
        temporaryDuration?: number;
        singleUnfinished?: boolean;
    }): void {
        const { start, end, target, bridgeId, bridgeIds, useEdges = false, alpha, tint, temporaryDuration, singleUnfinished } = opts;

        // Clear existing containers for preview/flash before creating new ones
        if (target === 'preview' && this.previewGraphics) {
            this.previewGraphics.destroy();
            this.previewGraphics = null;
        }
        if (target === 'flash' && this.flashGraphics) {
            this.flashGraphics.destroy();
            this.flashGraphics = null;
        }

        // Single unfinished tile (half-placed bridge: only start island selected)
        if (!end && singleUnfinished) {
            const startWorld = this.gridMapper.gridToWorld(start.x, start.y);
            const cellSize = this.gridMapper.getCellSize();
            const container = this.scene.add.container(startWorld.x + cellSize / 2, startWorld.y + cellSize / 2);
            const spr = this.scene.add.sprite(0, 0, this.textureKey, BridgeSpriteFrames.UNFINISHED_BRIDGE)
                .setOrigin(0.5, 0.5);
            if (alpha !== undefined) spr.setAlpha(alpha);
            if (tint !== undefined) spr.setTintFill(tint);
            spr.setScale(this.gridMapper.getCellSize() / 32);
            container.add(spr);
            if (target === 'preview') this.previewGraphics = container;
            this.onGameObjectCreated(container);
            return;
        }

        if (!end) return;

        // Normalise direction and compute geometry
        const ordered = normalizeRenderOrder(start, end);
        const startGrid = ordered.start;
        const endGrid = ordered.end;
        const startWorld = this.gridMapper.gridToWorld(startGrid.x, startGrid.y);
        const endWorld = this.gridMapper.gridToWorld(endGrid.x, endGrid.y);
        const worldLength = Math.sqrt((endWorld.x - startWorld.x) ** 2 + (endWorld.y - startWorld.y) ** 2);
        const dxGrid = endGrid.x - startGrid.x;
        const dyGrid = endGrid.y - startGrid.y;
        const gridDist = Math.sqrt(dxGrid * dxGrid + dyGrid * dyGrid);
        const segCount = Math.max(1, Math.ceil(gridDist - 0.01));
        const worldStep = { x: (endWorld.x - startWorld.x) / segCount, y: (endWorld.y - startWorld.y) / segCount };
        const angle = Math.atan2(endWorld.y - startWorld.y, endWorld.x - startWorld.x);
        const spacing = Math.sqrt(worldStep.x * worldStep.x + worldStep.y * worldStep.y);
        const scale = this.gridMapper.getCellSize() / 32;
        const orient = orientationForDelta(startGrid, endGrid);

        // Centre container at the midpoint (cell-centred coordinates)
        const cellSize = this.gridMapper.getCellSize();
        const midX = (startWorld.x + endWorld.x) / 2 + cellSize / 2;
        const midY = (startWorld.y + endWorld.y) / 2 + cellSize / 2;
        const container = this.scene.add.container(midX, midY);
        container.setRotation(angle);

        // Use double-bridge frames when two bridge ids share the same island-pair
        const isDouble = (bridgeIds && bridgeIds.length >= 2) || false;
        const chooseFrame = (i: number) => {
            const base = (() => {
                if (!useEdges) return orient === 'horizontal' ? BridgeSpriteFrames.H_BRIDGE_CENTRE : BridgeSpriteFrames.V_BRIDGE_MIDDLE;
                if (orient === 'horizontal') {
                    if (i === 0 && segCount === 1) return BridgeSpriteFrames.H_BRIDGE_SINGLE;
                    if (i === 0) return BridgeSpriteFrames.H_BRIDGE_LEFT;
                    if (i === segCount - 1) return BridgeSpriteFrames.H_BRIDGE_RIGHT;
                    return BridgeSpriteFrames.H_BRIDGE_CENTRE;
                } else {
                    if (i === 0 && segCount === 1) return BridgeSpriteFrames.V_BRIDGE_SINGLE;
                    if (i === 0) return BridgeSpriteFrames.V_BRIDGE_BOTTOM;
                    if (i === segCount - 1) return BridgeSpriteFrames.V_BRIDGE_TOP;
                    return BridgeSpriteFrames.V_BRIDGE_MIDDLE;
                }
            })();
            return isDouble ? base + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET : base;
        };

        // Place tile sprites along the container's local X axis, centred
        const centreIndexOffset = (segCount - 1) / 2;
        for (let i = 0; i < segCount; i++) {
            const tile = this.scene.add.sprite(0, 0, this.textureKey, chooseFrame(i))
                .setOrigin(0.5, 0.5)
                .setScale(scale, scale);
            if (alpha !== undefined) tile.setAlpha(alpha);
            if (tint !== undefined) tile.setTintFill(tint);
            tile.x = (i - centreIndexOffset) * spacing;
            tile.y = 0;
            if (orient !== 'horizontal') tile.setRotation(Math.PI / 2);
            container.add(tile);
        }

        // For placed bridges: add interactive hit-area and hover outline
        if (target === 'placed') {
            this.addClickableBridgeOutline(worldLength, container, opts);
        }

        // Register and store
        if (target === 'placed') {
            if (bridgeIds && bridgeIds.length > 0) {
                for (const id of bridgeIds) {
                    const prev = this.bridgeGraphics.get(id);
                    if (prev) prev.destroy();
                    this.bridgeGraphics.set(id, container);
                }
            } else if (bridgeId) {
                const prev = this.bridgeGraphics.get(bridgeId);
                if (prev) prev.destroy();
                this.bridgeGraphics.set(bridgeId, container);
            }
        } else if (target === 'preview') {
            this.previewGraphics = container;
        } else if (target === 'flash') {
            this.flashGraphics = container;
            if (temporaryDuration) {
                if (this.flashTimer) this.scene.time.removeEvent(this.flashTimer);
                this.flashTimer = this.scene.time.delayedCall(temporaryDuration, () => {
                    if (this.flashGraphics) {
                        this.flashGraphics.destroy();
                        this.flashGraphics = null;
                    }
                    this.flashTimer = null;
                });
            }
        }

        this.onGameObjectCreated(container);
    }

    private addClickableBridgeOutline(
        worldLength: number,
        container: Phaser.GameObjects.Container,
        opts: {
            start: { x: number; y: number };
            end?: { x: number; y: number };
            bridgeId?: string;
            bridgeIds?: string[];
        },
    ): void {
        const zoneThickness = Math.max(8, this.gridMapper.getCellSize() * 0.75);

        // Shrink length slightly because bridge sprites start/end partway into islands
        worldLength = worldLength - (this.gridMapper.getCellSize() / 2);
        const halfW = worldLength / 2;
        const halfH = zoneThickness / 2;

        // Invisible interactive zone centred on the bridge
        const hitZone = this.scene.add.zone(-halfW, -halfH, worldLength, zoneThickness);
        hitZone.setOrigin(0, 0);
        const interactiveRect = new Phaser.Geom.Rectangle(0, 0, worldLength, zoneThickness);
        if (typeof hitZone.setData === 'function') {
            hitZone.setData('shape', interactiveRect);
        }
        if (!this.isPlacing) {
            try {
                hitZone.setInteractive(interactiveRect, Phaser.Geom.Rectangle.Contains);
            } catch (_e) {
                try { (hitZone as unknown as { setInteractive(): void }).setInteractive(); } catch (_e2) { /* ignore */ }
            }
        }
        container.add(hitZone);
        this.bridgeHitZones.push(hitZone);

        // White outline graphic (hidden by default, shown on hover)
        const outline = this.scene.add.graphics();
        outline.lineStyle(2, 0xffffff, 1);
        outline.strokeRect(-halfW, -halfH, worldLength, zoneThickness);
        outline.setVisible(false);
        container.add(outline);

        hitZone.on('pointerover', () => {
            if (this.isPlacing) return;
            outline.setVisible(true);
        });
        hitZone.on('pointerout', () => {
            if (this.isPlacing) return;
            outline.setVisible(false);
        });
        hitZone.on('pointerdown', () => {
            if (this.isPlacing) return;
            const ids: string[] = (opts as { bridgeIds?: string[] }).bridgeIds ?? (opts.bridgeId ? [opts.bridgeId] : []);
            const emitID = ids.length ? ids[ids.length - 1] : opts.bridgeId;
            this.scene.events.emit('bridge-clicked', emitID);
        });
    }
}
