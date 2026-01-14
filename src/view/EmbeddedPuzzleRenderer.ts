import Phaser from 'phaser';
import type { IPuzzleView } from './IPuzzleView';
import type { PuzzleRenderer } from './PuzzleRenderer';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { BridgeType } from '@model/puzzle/BridgeType';
import type { Point } from '@model/puzzle/Point';
import type { Bridge } from '@model/puzzle/Bridge';
import { GridToWorldMapper } from './GridToWorldMapper';
import { orientationForDelta } from './PuzzleRenderer';

/**
 * Puzzle renderer that works embedded within the overworld scene
 * Uses overworld coordinates and draws puzzle elements on top of the existing map
 */
export class EmbeddedPuzzleRenderer implements IPuzzleView, PuzzleRenderer {
    private scene: Phaser.Scene;
    private gridMapper: GridToWorldMapper;
    private textureKey: string;
    private puzzleBounds: Phaser.Geom.Rectangle;

    // Graphics objects for embedded rendering
    private islandGraphics: Map<string, Phaser.GameObjects.Sprite> = new Map();
    private bridgeGraphics: Map<string, Phaser.GameObjects.Container> = new Map();
    private previewGraphics: Phaser.GameObjects.Container | null = null;
    private puzzleContainer: Phaser.GameObjects.Container;

    // Sprite frame indices (matching PhaserPuzzleRenderer)
    readonly FRAME_ISLAND = 36;
    readonly H_BRIDGE_LEFT = 55;
    readonly H_BRIDGE_CENTRE = 56;
    readonly H_BRIDGE_RIGHT = 57;
    readonly V_BRIDGE_BOTTOM = 58;
    readonly V_BRIDGE_MIDDLE = 59;
    readonly V_BRIDGE_TOP = 60;
    readonly H_BRIDGE_SINGLE = 62;
    readonly V_BRIDGE_SINGLE = 63;
    readonly DOUBLE_BRIDGE_OFFSET = 11;
    readonly PREVIEW_ALPHA = 0.8;
    readonly INVALID_TINT = 0xff0000;

    constructor(
        scene: Phaser.Scene,
        puzzleBounds: Phaser.Geom.Rectangle,
        textureKey = 'sprout-tiles'
    ) {
        this.scene = scene;
        this.puzzleBounds = puzzleBounds;
        this.textureKey = textureKey;

        // Create grid mapper with puzzle bounds offset
        this.gridMapper = new GridToWorldMapper(32, {
            offsetX: puzzleBounds.x,
            offsetY: puzzleBounds.y
        });

        // Create container for all puzzle graphics
        this.puzzleContainer = scene.add.container(0, 0);
        this.puzzleContainer.setDepth(100); // Above overworld graphics
    }

    init(puzzle: BridgePuzzle): void {
        console.log(`EmbeddedPuzzleRenderer: Initializing puzzle ${puzzle.id} at bounds (${this.puzzleBounds.x}, ${this.puzzleBounds.y})`);

        // Clear any existing graphics
        this.destroy();

        // Create island graphics
        for (const island of puzzle.islands) {
            this.createIsland(island);
        }
    }

    updateFromPuzzle(puzzle: BridgePuzzle): void {
        console.log(`EmbeddedPuzzleRenderer.updateFromPuzzle: ${puzzle.placedBridges.length} placed bridges`);

        // Clear existing bridge graphics
        this.destroyBridges();

        // Recreate only placed bridges (bridges with start and end coordinates)
        const placedBridges = puzzle.placedBridges;
        if (placedBridges.length > 0) {
            for (const bridge of placedBridges) {
                console.log(`EmbeddedPuzzleRenderer: Creating bridge ${bridge.id} from (${bridge.start?.x},${bridge.start?.y}) to (${bridge.end?.x},${bridge.end?.y})`);
                this.createBridge(bridge);
            }
        }
    }

    showPreview(start: Point, end: Point, bridgeType: BridgeType): void {
        console.log(`EmbeddedPuzzleRenderer.showPreview: start(${start.x},${start.y}) end(${end.x},${end.y}) type=${bridgeType.id}`);
        this.hidePreview();

        const tempBridge: Bridge = {
            id: 'preview',
            start,
            end,
            type: bridgeType
        };

        this.previewGraphics = this.createBridgeContainer(tempBridge);
        this.previewGraphics.setAlpha(this.PREVIEW_ALPHA);
        this.puzzleContainer.add(this.previewGraphics);
        console.log(`EmbeddedPuzzleRenderer.showPreview: Preview container created with ${this.previewGraphics.list.length} sprites, depth=${this.previewGraphics.depth}`);
    }

    hidePreview(): void {
        if (this.previewGraphics) {
            this.previewGraphics.destroy();
            this.previewGraphics = null;
        }
    }

    screenToGrid(screenX: number, screenY: number): Point {
        // Convert screen coordinates to world coordinates using Phaser's built-in method
        const camera = this.scene.cameras.main;
        const worldPoint = camera.getWorldPoint(screenX, screenY);

        // Convert to puzzle grid coordinates
        const gridPos = this.gridMapper.worldToGrid(worldPoint.x, worldPoint.y);
        //console.log(`EmbeddedPuzzleRenderer.screenToGrid: screen(${screenX}, ${screenY}) camera(scrollX=${camera.scrollX}, scrollY=${camera.scrollY}, zoom=${camera.zoom}) -> world(${worldPoint.x}, ${worldPoint.y}) -> grid(${gridPos.x}, ${gridPos.y})`);
        return { x: gridPos.x, y: gridPos.y };
    }

    gridToWorld(gridX: number, gridY: number): Point {
        const worldPos = this.gridMapper.gridToWorld(gridX, gridY);
        return { x: worldPos.x, y: worldPos.y };
    }

    destroy(): void {
        // Destroy all island graphics
        for (const sprite of this.islandGraphics.values()) {
            sprite.destroy();
        }
        this.islandGraphics.clear();

        // Destroy all bridge graphics
        this.destroyBridges();

        // Destroy preview
        this.hidePreview();

        // Destroy container and recreate it
        if (this.puzzleContainer) {
            this.puzzleContainer.destroy();
            this.puzzleContainer = this.scene.add.container(0, 0);
            this.puzzleContainer.setDepth(100);
            this.puzzleContainer.setVisible(true);
        }
    }

    private createIsland(island: any): void {
        const worldPos = this.gridMapper.gridToWorld(island.x, island.y);

        const sprite = this.scene.add.sprite(worldPos.x, worldPos.y, this.textureKey, this.FRAME_ISLAND);
        sprite.setOrigin(0, 0);
        sprite.setDepth(101); // Above overworld, below bridges

        this.puzzleContainer.add(sprite);
        this.islandGraphics.set(island.id, sprite);
    }

    private createBridge(bridge: Bridge): void {
        console.log(`EmbeddedPuzzleRenderer.createBridge: Creating bridge ${bridge.id}`);
        const container = this.createBridgeContainer(bridge);
        console.log(`EmbeddedPuzzleRenderer.createBridge: Container created with ${container.list.length} sprites`);
        this.puzzleContainer.add(container);
        this.bridgeGraphics.set(bridge.id, container);
        console.log(`EmbeddedPuzzleRenderer.createBridge: Bridge added to puzzle container, total bridges: ${this.bridgeGraphics.size}`);
        console.log(`  puzzleContainer visible=${this.puzzleContainer.visible} alpha=${this.puzzleContainer.alpha} depth=${this.puzzleContainer.depth} childCount=${this.puzzleContainer.list.length}`);
    }

    private createBridgeContainer(bridge: Bridge): Phaser.GameObjects.Container {
        const container = this.scene.add.container();
        container.setDepth(102); // Above islands

        if (!bridge.start || !bridge.end) {
            console.warn(`EmbeddedPuzzleRenderer: Bridge ${bridge.id} missing start or end coordinates`);
            return container;
        }

        const startWorld = this.gridMapper.gridToWorld(bridge.start.x, bridge.start.y);
        const endWorld = this.gridMapper.gridToWorld(bridge.end.x, bridge.end.y);

        const cam = this.scene.cameras.main;
        const viewportTL = { x: cam.scrollX, y: cam.scrollY };
        const viewportBR = { x: cam.scrollX + cam.width / cam.zoom, y: cam.scrollY + cam.height / cam.zoom };

        console.log(`EmbeddedPuzzleRenderer: Bridge ${bridge.id} grid(${bridge.start.x},${bridge.start.y})->(${bridge.end.x},${bridge.end.y}) mapped to world(${startWorld.x},${startWorld.y})->(${endWorld.x},${endWorld.y})`);
        console.log(`  Puzzle bounds offset: (${this.puzzleBounds.x}, ${this.puzzleBounds.y})`);
        console.log(`  Viewport: TL(${viewportTL.x.toFixed(0)},${viewportTL.y.toFixed(0)}) BR(${viewportBR.x.toFixed(0)},${viewportBR.y.toFixed(0)}) zoom=${cam.zoom.toFixed(2)}`);
        console.log(`  Container position: (${container.x}, ${container.y})`);

        // Determine bridge orientation
        const orientation = orientationForDelta(bridge.start, bridge.end);

        if (orientation === 'horizontal') {
            this.createHorizontalBridge(container, bridge, startWorld, endWorld);
        } else {
            this.createVerticalBridge(container, bridge, startWorld, endWorld);
        }

        // Log sprite details after creation
        console.log(`  Container has ${container.list.length} sprites after creation`);
        if (container.list.length > 0) {
            const firstSprite = container.list[0] as Phaser.GameObjects.Sprite;
            console.log(`  First sprite: pos(${firstSprite.x},${firstSprite.y}) origin(${firstSprite.originX},${firstSprite.originY}) visible=${firstSprite.visible} alpha=${firstSprite.alpha} depth=${firstSprite.depth}`);
            console.log(`  First sprite texture: ${firstSprite.texture.key} frame=${firstSprite.frame.name}`);
        }

        return container;
    }

    private createHorizontalBridge(
        container: Phaser.GameObjects.Container,
        bridge: Bridge,
        startWorld: { x: number; y: number },
        endWorld: { x: number; y: number }
    ): void {
        if (!bridge.start || !bridge.end) {
            return;
        }

        const length = Math.abs(bridge.end.x - bridge.start.x) + 1;
        const leftmost = Math.min(startWorld.x, endWorld.x);

        for (let i = 0; i < length; i++) {
            const x = leftmost + i * 32;
            const y = startWorld.y;

            let frameIndex: number;
            if (length === 1) {
                frameIndex = this.H_BRIDGE_SINGLE;
            } else if (i === 0) {
                frameIndex = this.H_BRIDGE_LEFT;
            } else if (i === length - 1) {
                frameIndex = this.H_BRIDGE_RIGHT;
            } else {
                frameIndex = this.H_BRIDGE_CENTRE;
            }

            // Add double bridge offset if needed
            if (bridge.type.id === 'double') {
                frameIndex += this.DOUBLE_BRIDGE_OFFSET;
            }

            const sprite = this.scene.add.sprite(x, y, this.textureKey, frameIndex);
            sprite.setOrigin(0, 0);
            container.add(sprite);
        }
    }

    private createVerticalBridge(
        container: Phaser.GameObjects.Container,
        bridge: Bridge,
        startWorld: { x: number; y: number },
        endWorld: { x: number; y: number }
    ): void {
        if (!bridge.start || !bridge.end) {
            return;
        }

        const length = Math.abs(bridge.end.y - bridge.start.y) + 1;
        const topmost = Math.min(startWorld.y, endWorld.y);

        for (let i = 0; i < length; i++) {
            const x = startWorld.x;
            const y = topmost + i * 32;

            let frameIndex: number;
            if (length === 1) {
                frameIndex = this.V_BRIDGE_SINGLE;
            } else if (i === 0) {
                frameIndex = this.V_BRIDGE_TOP;
            } else if (i === length - 1) {
                frameIndex = this.V_BRIDGE_BOTTOM;
            } else {
                frameIndex = this.V_BRIDGE_MIDDLE;
            }

            // Add double bridge offset if needed
            if (bridge.type.id === 'double') {
                frameIndex += this.DOUBLE_BRIDGE_OFFSET;
            }

            const sprite = this.scene.add.sprite(x, y, this.textureKey, frameIndex);
            sprite.setOrigin(0, 0);
            container.add(sprite);
        }
    }

    private destroyBridges(): void {
        for (const container of this.bridgeGraphics.values()) {
            container.destroy();
        }
        this.bridgeGraphics.clear();
    }

    // === PuzzleRenderer interface methods ===

    /**
     * Preview a bridge (used by PuzzleController)
     */
    previewBridge(bridge: Bridge, opts?: { isDouble?: boolean; isInvalid?: boolean } | null): void {
        if (!bridge.start || !bridge.end) {
            return;
        }

        this.showPreview(bridge.start, bridge.end, bridge.type);

        // Apply visual effects based on options
        if (this.previewGraphics && opts) {
            if (opts.isInvalid) {
                // Tint all children in the container
                this.previewGraphics.list.forEach((child: any) => {
                    if (child.setTint) {
                        child.setTint(this.INVALID_TINT);
                    }
                });
            }
        }
    }

    /**
     * Set placing mode (disable hit areas during placement)
     */
    setPlacing(isPlacing: boolean): void {
        // For embedded renderer, we don't have interactive hit areas
        // This is handled by the PuzzleInputHandler
        console.log(`EmbeddedPuzzleRenderer: Setting placing mode: ${isPlacing}`);
    }

    /**
     * Set available bridge types (not used in embedded mode)
     */
    setAvailableBridgeTypes(types: BridgeType[]): void {
        // This would be handled by a separate UI overlay in embedded mode
        console.log(`EmbeddedPuzzleRenderer: Available bridge types:`, types.map(t => t.id));
    }

    /**
     * Set selected bridge type (not used in embedded mode) 
     */
    setSelectedBridgeType(type: BridgeType | null): void {
        // This would be handled by a separate UI overlay in embedded mode
        console.log(`EmbeddedPuzzleRenderer: Selected bridge type:`, type?.id || 'none');
    }

    /**
     * Set available bridge counts (not used in embedded mode)
     */
    setAvailableBridgeCounts(counts: Map<string, number>): void {
        // This would be handled by a separate UI overlay in embedded mode
        console.log(`EmbeddedPuzzleRenderer: Available bridge counts:`, counts);
    }

    /**
     * Flash bridges for validation feedback
     */
    flashBridges(bridgeIds: string[], color: number = 0xff0000, duration: number = 500): void {
        console.log(`EmbeddedPuzzleRenderer: Flashing bridges:`, bridgeIds);

        // Simple flash implementation - could be enhanced
        for (const bridgeId of bridgeIds) {
            const container = this.bridgeGraphics.get(bridgeId);
            if (container) {
                // Tint all children in the container
                container.list.forEach((child: any) => {
                    if (child.setTint) {
                        child.setTint(color);
                    }
                });

                this.scene.time.delayedCall(duration, () => {
                    container.list.forEach((child: any) => {
                        if (child.clearTint) {
                            child.clearTint();
                        }
                    });
                });
            }
        }
    }

    /**
     * Highlight islands for interaction feedback
     */
    highlightIslands(islandIds: string[], color: number = 0x00ff00): void {
        console.log(`EmbeddedPuzzleRenderer: Highlighting islands:`, islandIds);

        // Simple highlight implementation
        for (const islandId of islandIds) {
            const sprite = this.islandGraphics.get(islandId);
            if (sprite) {
                sprite.setTint(color);
            }
        }
    }

    /**
     * Clear all highlights
     */
    clearHighlights(): void {
        for (const sprite of this.islandGraphics.values()) {
            sprite.clearTint();
        }
        for (const container of this.bridgeGraphics.values()) {
            container.list.forEach((child: any) => {
                if (child.clearTint) {
                    child.clearTint();
                }
            });
        }
    }

    /**
     * Highlight constraint violations
     */
    highlightViolations(violationData: any): void {
        console.log(`EmbeddedPuzzleRenderer: Highlighting violations:`, violationData);
        // Implementation would depend on violation data structure
    }

    /**
     * Flash invalid placement feedback
     */
    flashInvalidPlacement(start: { x: number; y: number }, end: { x: number; y: number }): void {
        console.log(`EmbeddedPuzzleRenderer: Flashing invalid placement from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`);

        // Create a temporary bridge for preview
        const tempBridge: Bridge = {
            id: 'invalid-preview',
            start,
            end,
            type: { id: 'single' } // Minimal bridge type
        };

        this.previewBridge(tempBridge, { isInvalid: true });

        // Clear after a short delay
        this.scene.time.delayedCall(300, () => {
            this.hidePreview();
        });
    }

    /**
     * Update method for animation frames
     */
    update(_dt: number): void {
        // No per-frame updates needed for basic embedded renderer
    }
}