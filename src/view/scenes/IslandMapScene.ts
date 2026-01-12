import Phaser from 'phaser';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { GridToWorldMapper } from '../GridToWorldMapper';
import { PhaserPuzzleRenderer } from '../PhaserPuzzleRenderer';

export class IslandMapScene extends Phaser.Scene {
    private puzzle: BridgePuzzle | null = null;
    private gridMapper: GridToWorldMapper | null = null;
    private puzzleRenderer: PhaserPuzzleRenderer | null = null;
    public isDebugZoomed: boolean = false;

    constructor() {
        super({ key: 'IslandMapScene' });
        console.log('IslandMapScene: constructor called');
    }

    preload() {
        console.log('IslandMapScene: preload() called');
        // Load tilesheet used by PhaserPuzzleRenderer (32x32 frames)
        this.load.spritesheet('sprout-tiles', 'resources/tilesets/SproutLandsGrassIslands.png', {
            frameWidth: 32,
            frameHeight: 32
        });
        console.log('IslandMapScene: preload() finished');
    }

    create() {
        console.log('IslandMapScene: create() called');

        // Wait for puzzle data from BridgePuzzleScene
        console.log('IslandMapScene: Setting up setPuzzle event listener');
        this.events.on('setPuzzle', (puzzle: BridgePuzzle) => {
            console.log('IslandMapScene: Received puzzle', puzzle);
            this.puzzle = puzzle;
            this.initializeRenderer();
        });

        console.log('IslandMapScene: Event listeners set up');        // Listen for renderer method calls forwarded from BridgePuzzleScene
        this.events.on('updateFromPuzzle', () => {
            if (this.puzzleRenderer && this.puzzle) {
                this.puzzleRenderer.updateFromPuzzle(this.puzzle);
            }
        });

        this.events.on('previewBridge', (bridge: any, opts: any) => {
            this.puzzleRenderer?.previewBridge(bridge, opts);
        });

        this.events.on('setPlacing', (isPlacing: boolean) => {
            this.puzzleRenderer?.setPlacing(isPlacing);
        });

        this.events.on('highlightViolations', (ids: string[]) => {
            this.puzzleRenderer?.highlightViolations(ids);
        });

        this.events.on('flashInvalidPlacement', (start: { x: number; y: number }, end: { x: number; y: number }) => {
            this.puzzleRenderer?.flashInvalidPlacement(start, end);
        });

        this.events.on('clearHighlights', () => {
            this.puzzleRenderer?.clearHighlights();
        });

        // Additional renderer proxy events
        this.events.on('initRenderer', (puzzle: BridgePuzzle) => {
            this.puzzleRenderer?.init(puzzle);
        });

        this.events.on('setAvailableBridgeTypes', (types: any[]) => {
            this.puzzleRenderer?.setAvailableBridgeTypes(types);
        });

        this.events.on('setSelectedBridgeType', (type: any) => {
            this.puzzleRenderer?.setSelectedBridgeType(type);
        });

        this.events.on('updateRenderer', (dt: number) => {
            this.puzzleRenderer?.update(dt);
        });

        this.events.on('destroyRenderer', () => {
            this.puzzleRenderer?.destroy();
        });

        // Listen for coordinate conversion requests
        this.events.on('worldToGrid', (worldX: number, worldY: number, callback: (result: { x: number; y: number }) => void) => {
            if (this.gridMapper) {
                const result = this.gridMapper.worldToGrid(worldX, worldY);
                callback(result);
            }
        });

        this.events.on('gridToWorld', (gridX: number, gridY: number, callback: (result: { x: number; y: number }) => void) => {
            if (this.gridMapper) {
                const result = this.gridMapper.gridToWorld(gridX, gridY);
                callback(result);
            }
        });

        // Listen for screen-to-world coordinate conversion (accounting for camera)
        this.events.on('screenToWorld', (screenX: number, screenY: number, callback: (result: { x: number; y: number }) => void) => {
            const worldPoint = this.cameras.main.getWorldPoint(screenX, screenY);
            callback({ x: worldPoint.x, y: worldPoint.y });
        });

        // Listen for camera zoom adjustments
        this.events.on('adjustCameraZoom', () => {
            console.log('IslandMapScene: Received adjustCameraZoom event');
            this.adjustCameraForIslands();
        });

        // Listen for debug zoom out (only works in debug mode)
        this.events.on('debugZoomOut', () => {
            this.debugZoomOut();
        });

        // Forward island clicks from renderer to BridgePuzzleScene
        this.events.on('island-clicked', (worldX: number, worldY: number, gridX: number, gridY: number) => {
            console.log(`IslandMapScene: Forwarding island click at grid (${gridX}, ${gridY}) to BridgePuzzleScene`);
            const bridgeScene = this.scene.get('BridgePuzzleScene');
            bridgeScene.events.emit('island-clicked', worldX, worldY, gridX, gridY);
        });

        // Forward island pointer move events from renderer to BridgePuzzleScene
        this.events.on('island-pointermove', (worldX: number, worldY: number, gridX: number, gridY: number) => {
            const bridgeScene = this.scene.get('BridgePuzzleScene');
            bridgeScene.events.emit('island-pointermove', worldX, worldY, gridX, gridY);
        });

        // Forward island pointer up events from renderer to BridgePuzzleScene
        this.events.on('island-pointerup', (worldX: number, worldY: number, gridX: number, gridY: number) => {
            const bridgeScene = this.scene.get('BridgePuzzleScene');
            bridgeScene.events.emit('island-pointerup', worldX, worldY, gridX, gridY);
        });

        // Emit ready events to signal that IslandMapScene is fully initialized
        console.log('IslandMapScene: Emitting islandMapReady events to BridgePuzzleScene');
        const bridgeScene = this.scene.get('BridgePuzzleScene');
        bridgeScene.events.emit('islandMapReady');
        bridgeScene.events.emit('islandMapReadyForCamera');
    }

    private initializeRenderer() {
        if (!this.puzzle) return;

        console.log('IslandMapScene: Initializing renderer');
        // Create coordinate mapper with 32px cell size (sprites are 32x32)
        this.gridMapper = new GridToWorldMapper(32);

        // Create renderer (pass the texture key used in preload)
        this.puzzleRenderer = new PhaserPuzzleRenderer(this, this.gridMapper, 'sprout-tiles');

        // Initialize renderer with puzzle
        console.log('IslandMapScene: Calling renderer.init and updateFromPuzzle');
        this.puzzleRenderer.init(this.puzzle);
        this.puzzleRenderer.updateFromPuzzle(this.puzzle);
        console.log('IslandMapScene: Renderer initialized, island count:', this.puzzle.islands.length);

        // DEBUG: Log detailed island position information
        console.log('=== ISLAND POSITION DEBUG ===');
        this.puzzle.islands.forEach((island, index) => {
            const gridPos = { x: island.x, y: island.y };
            const worldPos = this.gridMapper!.gridToWorld(gridPos.x, gridPos.y);
            console.log(`Island ${index} (${island.id}):`);
            console.log(`  Grid position: (${gridPos.x}, ${gridPos.y})`);
            console.log(`  World position: (${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)})`);
            console.log(`  Island data:`, island);
        });
        console.log('=== END ISLAND DEBUG ===');

        // Set up camera to fit islands optimally
        console.log('IslandMapScene: Setting up camera');
        this.adjustCameraForIslands();

        // DEBUG: Log camera state after adjustment
        setTimeout(() => {
            const cam = this.cameras.main;
            console.log('=== CAMERA DEBUG (after setup) ===');
            console.log(`Camera scroll: (${cam.scrollX}, ${cam.scrollY})`);
            console.log(`Camera zoom: ${cam.zoom}`);
            console.log(`Camera size: ${cam.width} x ${cam.height}`);
            console.log(`Camera center would be: (${cam.scrollX + cam.width / 2}, ${cam.scrollY + cam.height / 2})`);
            console.log('=== END CAMERA DEBUG ===');
        }, 100);
    }

    private adjustCameraForIslands() {
        if (!this.gridMapper || !this.puzzle) return;

        // Temporarily use full screen to test if islands appear
        const availWidth = this.scale.width;
        const availHeight = this.scale.height;
        console.log(`Using full screen: ${availWidth} x ${availHeight}`);

        const xs = this.puzzle.islands.map(i => i.x);
        const ys = this.puzzle.islands.map(i => i.y);
        const minGX = Math.min(...xs);
        const maxGX = Math.max(...xs);
        const minGY = Math.min(...ys);
        const maxGY = Math.max(...ys);

        const cell = this.gridMapper.getCellSize();
        const worldWidth = (maxGX - minGX + 1) * cell;
        const worldHeight = (maxGY - minGY + 1) * cell;
        console.log(`Island grid bounds: (${minGX},${minGY}) to (${maxGX},${maxGY})`);
        console.log(`Island world size: ${worldWidth} x ${worldHeight}px`);

        // Zoom to fit islands inside available area. Use the smaller zoom so both axes fit.
        const zoomX = availWidth / worldWidth;
        const zoomY = availHeight / worldHeight;
        const padFactor = 0.66;
        const zoom = Math.min(zoomX, zoomY) * padFactor;
        console.log(`Setting camera zoom to ${zoom.toFixed(2)}`);

        if (isFinite(zoom) && zoom > 0) {
            this.cameras.main.setZoom(zoom);

            // Compute world centre of islands
            const centreGridX = (minGX + maxGX) / 2;
            const centreGridY = (minGY + maxGY) / 2;
            const worldCentre = this.gridMapper.gridToWorld(centreGridX, centreGridY);

            // Position the camera so the islands centre maps to the centre of the available area.
            const availCentreX = availWidth / 2;
            const availCentreY = availHeight / 2;

            // Centre the camera on the world centre first
            this.cameras.main.centerOn(worldCentre.x, worldCentre.y);

            // Screen centre (full viewport)
            const fullCentreX = (this.scale?.width ?? 800) / 2;
            const fullCentreY = (this.scale?.height ?? 600) / 2;

            // Compute how many screen pixels we need to nudge
            const dxScreen = availCentreX - fullCentreX;
            const dyScreen = availCentreY - fullCentreY;

            // Convert screen delta to world delta (account for zoom)
            const worldDeltaX = dxScreen / zoom;
            const worldDeltaY = dyScreen / zoom;

            // Adjust scroll so the world centre maps to the available-area centre
            this.cameras.main.scrollX -= worldDeltaX;
            this.cameras.main.scrollY -= worldDeltaY;
            console.log(`Camera centered and nudged by world delta (${worldDeltaX.toFixed(2)}, ${worldDeltaY.toFixed(2)})`);
        }
    }

    private debugZoomOut() {
        console.log('IslandMapScene: Debug zoom out triggered');

        if (!this.isDebugZoomed) {
            console.log('Zooming out to show entire puzzle area');
            this.isDebugZoomed = true;
            // Set zoom to a very low level to see everything
            this.cameras.main.setZoom(0.1);

            // Center on origin
            this.cameras.main.centerOn(0, 0);

            console.log(`Camera zoom set to 0.1, centered at (0,0)`);
            console.log(`Camera bounds: scroll=(${this.cameras.main.scrollX}, ${this.cameras.main.scrollY}), zoom=${this.cameras.main.zoom}`);
        } else {
            console.log('Restoring camera to fit islands');
            this.isDebugZoomed = false;
            this.adjustCameraForIslands();
        }
    }

    update(_time: number, dt: number) {
        if (this.puzzleRenderer) {
            this.puzzleRenderer.update(dt);
        }
    }

    // Helper methods for finding game objects at coordinates
    findIslandAt(gridX: number, gridY: number) {
        if (!this.puzzle) return null;
        return this.puzzle.islands.find(isl => isl.x === gridX && isl.y === gridY);
    }

    findBridgeAt(worldX: number, worldY: number) {
        if (!this.puzzle || !this.gridMapper) return null;

        const gridPos = this.gridMapper.worldToGrid(worldX, worldY);
        const bridges = this.puzzle.bridgesAt(gridPos.x, gridPos.y);

        // Return the first bridge found (or null if none)
        return bridges.length > 0 ? bridges[0] : null;
    }

    // Cleanup when scene is stopped
    destroy() {
        this.puzzleRenderer?.destroy();
    }
}