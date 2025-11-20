import Phaser from 'phaser';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { GridToWorldMapper } from '../GridToWorldMapper';
import { PhaserPuzzleRenderer } from '../PhaserPuzzleRenderer';
import { PuzzleController } from '@controller/PuzzleController';
import type { PuzzleHost } from '@controller/PuzzleHost';
import { getAvailableViewport } from '../ui/viewport';
import puzzleData from '../../data/puzzles/simple4IslandPuzzle.json';

export class BridgePuzzleScene extends Phaser.Scene {
    private puzzle: BridgePuzzle | null = null;
    private gridMapper: GridToWorldMapper | null = null;
    private puzzleRenderer: PhaserPuzzleRenderer | null = null;
    private controller: PuzzleController | null = null;

    constructor() {
        super({ key: 'BridgePuzzleScene' });
    }

    preload() {
        // Load tilesheet used by PhaserPuzzleRenderer (32x32 frames)
        this.load.spritesheet('sprout-tiles', 'resources/tilesets/SproutLandsGrassIslands.png', {
            frameWidth: 32,
            frameHeight: 32
        });
    }

    create() {
        // Instantiate BridgePuzzle from spec
        this.puzzle = new BridgePuzzle(puzzleData);

        // Create coordinate mapper with 32px cell size (sprites are 32x32)
        this.gridMapper = new GridToWorldMapper(32);

        // Create renderer (pass the texture key used in preload)
        this.puzzleRenderer = new PhaserPuzzleRenderer(this, this.gridMapper, 'sprout-tiles');

        // Create controller (scene acts as PuzzleHost)
        const host: PuzzleHost = this.createPuzzleHost();
        this.controller = new PuzzleController(this.puzzle, this.puzzleRenderer, host);
        
        // Launch the HUD scene which owns the sidebar UI. We'll communicate via
        // scene events (clean separation between world and UI).
        this.scene.launch('PuzzleHUDScene');
        const hud = this.scene.get('PuzzleHUDScene');

        // Wait until the HUD scene has finished initialising (it emits 'ready')
        // before sending initial types/counts. This avoids racing where the
        // BridgePuzzleScene emits events before PuzzleHUDScene.create() runs.
        const bridgeTypes = this.puzzle.getAvailableBridgeTypes();
        const counts = this.puzzle.availableCounts();
        this.events.once('hudReady', () => {
            this.events.emit('setTypes', bridgeTypes);
            console.log('Sent bridge types to HUD:', bridgeTypes);
            hud.events.emit('updateCounts', counts);
            if (this.controller?.currentBridgeType) {
                hud.events.emit('setSelectedType', this.controller.currentBridgeType.id);
            }
        });

        // Listen for HUD events (user actions)
        hud.events.on('typeSelected', (typeId: string) => {
          const type = this.puzzle?.inventory.bridges.find(b => b.type.id === typeId)?.type;
          if (type) this.controller?.selectBridgeType(type);
        });
        hud.events.on('exit', () => this.controller?.exitPuzzle(false));
        hud.events.on('undo', () => this.controller?.undo());
        hud.events.on('redo', () => this.controller?.redo());
        
        // Listen for bridge clicks from the renderer and forward to the controller.
        this.events.on('bridge-clicked', (bridgeId: string) => {
            console.log('bridge clicked', bridgeId);
            // Delegate to controller so controller coordinates model/view updates.
            this.controller?.removeBridge(bridgeId);
        });

        // Enter puzzle and initialise renderer
        this.controller.enterPuzzle();
        
        // Adjust camera zoom and scroll so islands fill the available area left of the sidebar.
        // Compute bounds in grid-space and map to world-space using the current GridToWorldMapper.
        if (this.gridMapper && this.puzzle) {
            const vp = getAvailableViewport(this);
            const availWidth = vp.maxX - vp.minX;
            const availHeight = vp.maxY - vp.minY;

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
                // Use centerOn to reliably center world coordinates, then nudge the camera so the
                // world centre maps to the available-area centre (which may not be the full-screen centre
                // because of the sidebar).
                const availCentreX = vp.minX + availWidth / 2;
                const availCentreY = vp.minY + availHeight / 2;

                // Centre the camera on the world centre first (this sets scroll so worldCentre maps to screen centre)
                this.cameras.main.centerOn(worldCentre.x, worldCentre.y);

                // Screen centre (full viewport)
                const fullCentreX = (this.scale?.width ?? 800) / 2;
                const fullCentreY = (this.scale?.height ?? 600) / 2;

                // Compute how many screen pixels we need to nudge (positive means move right/down)
                const dxScreen = availCentreX - fullCentreX;
                const dyScreen = availCentreY - fullCentreY;

                // Convert screen delta to world delta (account for zoom)
                const worldDeltaX = dxScreen / zoom;
                const worldDeltaY = dyScreen / zoom;

                // Adjust scroll so the world centre maps to the available-area centre
                this.cameras.main.scrollX -= worldDeltaX;
                this.cameras.main.scrollY -= worldDeltaY;
                console.log(`Camera centered and nudged by world delta (${worldDeltaX.toFixed(2)}, ${worldDeltaY.toFixed(2)})`);

                // Ensure the HUD scene is informed of camera zoom so it can keep UI stable.
                const hudScene = this.scene.get('PuzzleHUDScene');
                hudScene.events.emit('adjustForCameraZoom', zoom);
            }
        }
        
        // Set up input handlers
        this.setupInputHandlers();
    }

    private setupInputHandlers() {
        // Mouse/Touch input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // pointer.x/y are screen coordinates; translate to camera/world coordinates
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const gridPos = this.gridMapper!.worldToGrid(worldPoint.x, worldPoint.y);
            console.log(`Pointer down at screen (${pointer.x}, ${pointer.y}) => world (${worldPoint.x.toFixed(2)}, ${worldPoint.y.toFixed(2)}) => grid (${gridPos.x}, ${gridPos.y})`);
            
            // Check if clicked on island
            const island = this.findIslandAt(gridPos.x, gridPos.y);
            if (island) {
                // Start a placement (supports click or drag flow)
                if (this.controller) this.controller.onPointerDown(worldPoint.x, worldPoint.y, gridPos.x, gridPos.y);
                return;
            }
            // // Check if clicked on bridge
            // const bridge = this.findBridgeAt(worldPoint.x, worldPoint.y);
            // if (bridge) {
            //     this.controller?.removeBridge(bridge.id);
            //     return;
            // }
        });

        // Forward pointer move events to controller for animated preview
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const gridPos = this.gridMapper!.worldToGrid(worldPoint.x, worldPoint.y);
            if (this.controller) this.controller.onPointerMove(worldPoint.x, worldPoint.y, gridPos.x, gridPos.y);
        });

        // Forward pointer up events to controller (end drag placement)
        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const gridPos = this.gridMapper!.worldToGrid(worldPoint.x, worldPoint.y);
            if (this.controller) this.controller.onPointerUp(worldPoint.x, worldPoint.y, gridPos.x, gridPos.y);
        });
        
        // Keyboard input
        this.input.keyboard?.on('keydown-Q', () => {
            this.controller?.previousBridgeType();
            if (this.controller?.currentBridgeType) {
                const hud = this.scene.get('PuzzleHUDScene');
                hud.events.emit('setSelectedType', this.controller.currentBridgeType.id);
            }
        });
        
        this.input.keyboard?.on('keydown-E', () => {
            this.controller?.nextBridgeType();
            if (this.controller?.currentBridgeType) {
                const hud = this.scene.get('PuzzleHUDScene');
                hud.events.emit('setSelectedType', this.controller.currentBridgeType.id);
            }
        });
        
        this.input.keyboard?.on('keydown-ESC', () => {
            this.controller?.cancelPlacement();
        });

        this.input.keyboard?.on('keydown-Z', () => {
            this.controller?.undo();
        });

        this.input.keyboard?.on('keydown-Y', () => {
            this.controller?.redo();
        });
    }

    private findIslandAt(gridX: number, gridY: number) {
        if (!this.puzzle) return null;
        return this.puzzle.islands.find(isl => isl.x === gridX && isl.y === gridY);
    }

    private findBridgeAt(worldX: number, worldY: number) {
        if (!this.puzzle || !this.gridMapper) return null;
        
        const gridPos = this.gridMapper.worldToGrid(worldX, worldY);
        const bridges = this.puzzle.bridgesAt(gridPos.x, gridPos.y);
        
        // Return the first bridge found (or null if none)
        return bridges.length > 0 ? bridges[0] : null;
    }

    update(_time: number, dt: number) {
        if (this.controller) {
            this.controller.update(dt);
        }
        
        // Update HUD counts
        if (this.puzzle) {
            const counts = this.puzzle.availableCounts();
            const hud = this.scene.get('PuzzleHUDScene');
            hud.events.emit('updateCounts', counts);
            // Update HUD undo/redo button enabled state
            const canUndo = this.controller!.canUndo();
            const canRedo = this.controller!.canRedo();
            hud.events.emit('setUndoEnabled', canUndo);
            hud.events.emit('setRedoEnabled', canRedo);
        }
    }

    private createPuzzleHost(): PuzzleHost {
        return {
            loadPuzzle: (_puzzleID: string) => {
                // Already loaded in create()
            },
            onPuzzleSolved: () => {
                try { console.log('[PuzzleHost] onPuzzleSolved called (forwarding to HUD)'); } catch(e) {}
                // Forward solved notification to the HUD scene so the overlay is drawn in UI space
                const hud = this.scene.get('PuzzleHUDScene');
                hud.events.emit('puzzleSolved');
            },
            onPuzzleExited: (success: boolean) => this.onPuzzleExited(success),
            onNoBridgeTypeAvailable: (typeId: string) => this.onNoBridgeTypeAvailable(typeId),
            setSelectedBridgeType: (typeId: string | null) => {
                // Forward selection to HUD scene so sidebar updates visually
                const hud = this.scene.get('PuzzleHUDScene');
                hud.events.emit('setSelectedType', typeId);
            }
        };
    }

    // PuzzleHost implementation
    onPuzzleSolved(): void {
        // Solved notification is handled by the HUD scene (fixed to viewport).
        try { console.log('[BridgePuzzleScene] onPuzzleSolved() called — HUD will display solved overlay'); } catch(e) {}
    }

    onPuzzleExited(success: boolean): void {
        // Log result (no overworld yet)
        console.log(`Puzzle exited: ${success ? 'solved' : 'unsolved'}`);
    }

    onNoBridgeTypeAvailable(typeId: string): void {
        // Show brief message
        const text = this.add.text(400, 100, `No bridges of type ${typeId} available`, {
            color: '#ff0000',
            fontSize: '16px'
        }).setOrigin(0.5, 0);
        
        this.tweens.add({
            targets: text,
            alpha: 0,
            duration: 1000,
            onComplete: () => {
                text.destroy();
            }
        });
    }
}