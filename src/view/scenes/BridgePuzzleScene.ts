import Phaser from 'phaser';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { PuzzleController } from '@controller/PuzzleController';
import type { PuzzleHost } from '@controller/PuzzleHost';
import { Environment } from '@helpers/Environment';
import { emitTestEvent } from '@helpers/TestEvents';
import { PuzzleHUDManager } from '@view/ui/PuzzleHUDManager';
import type { IslandMapScene } from '@view/scenes/IslandMapScene';

export class BridgePuzzleScene extends Phaser.Scene {
    private puzzle: BridgePuzzle | null = null;
    private controller: PuzzleController | null = null;
    private puzzleData: any = null;
    private seriesMode: boolean = false;
    /** Key of the scene that launched this puzzle in series mode. */
    private callerSceneKey: string = 'OverworldScene';

    constructor() {
        super({ key: 'BridgePuzzleScene' });
    }

    init(data?: { puzzleData?: any; seriesMode?: boolean; callerSceneKey?: string }) {
        if (data) {
            this.puzzleData = data.puzzleData || null;
            this.seriesMode = data.seriesMode || false;
            this.callerSceneKey = data.callerSceneKey ?? 'OverworldScene';
        }
    }

    preload() {
        // Load tilesheet used by PhaserPuzzleRenderer (32x32 frames)
        this.load.spritesheet('sprout-tiles', 'resources/tilesets/SproutLandsGrassIslands.png', {
            frameWidth: 32,
            frameHeight: 32
        });
    }

    async create() {
        let puzzleData;

        // Use passed puzzle data if available (series mode), otherwise fetch default
        if (this.puzzleData) {
            puzzleData = this.puzzleData;
            console.log('BridgePuzzleScene: Using provided puzzle data (series mode)');
        } else {
            // Fetch puzzle data from public directory
            const response = await fetch('data/puzzles/simple4IslandPuzzle.json');
            puzzleData = await response.json();
            console.log('BridgePuzzleScene: Loaded default puzzle data');
        }

        try {
            // Instantiate BridgePuzzle from spec
            console.log('[BridgePuzzleScene] About to create BridgePuzzle from data:', puzzleData);
            this.puzzle = new BridgePuzzle(puzzleData);
            console.log('[BridgePuzzleScene] BridgePuzzle created successfully, id:', this.puzzle.id);

            // Emit test event for automation (especially for series mode)
            if (this.seriesMode) {
                console.log(`[BridgePuzzleScene] Emitting puzzle_entered event for puzzle: ${this.puzzle.id}`);
                emitTestEvent('puzzle_entered', { puzzleId: this.puzzle.id, seriesMode: true });
                console.log('[BridgePuzzleScene] puzzle_entered event emitted');
            }
        } catch (error) {
            console.error('[BridgePuzzleScene] Error creating BridgePuzzle:', error);
            throw error;
        }

        // Launch the IslandMapScene and pass it the puzzle
        console.log('BridgePuzzleScene: Launching IslandMapScene');

        // Set up the ready event listener BEFORE launching the scene
        this.events.once('islandMapReady', () => {
            console.log('BridgePuzzleScene: Received islandMapReady event, sending puzzle', this.puzzle);
            const mapScene = this.scene.get('IslandMapScene');
            mapScene.events.emit('setPuzzle', this.puzzle);
        });

        this.scene.launch('IslandMapScene');

        // Create controller (scene acts as PuzzleHost)
        const host: PuzzleHost = this.createPuzzleHost();
        // Create a renderer proxy that forwards calls to the IslandMapScene
        const rendererProxy = this.createRendererProxy();
        this.controller = new PuzzleController(this.puzzle, rendererProxy, host);

        // Show HUD using PuzzleHUDManager for proper setup (background, etc.)
        PuzzleHUDManager.getInstance().enterPuzzle(this, this.controller, 'bridge');

        // Emit bridge types and counts for HUD
        const bridgeTypes = this.puzzle.getAvailableBridgeTypes();
        const counts = this.puzzle.availableCounts();
        this.events.emit('setTypes', bridgeTypes);
        console.log('Sent bridge types to HUD:', bridgeTypes);
        this.events.emit('updateCounts', counts);
        if (this.controller?.currentBridgeType) {
            this.events.emit('setSelectedType', this.controller.currentBridgeType.id);
        }

        // Listen for HUD events (user actions)
        const hud = this.scene.get('PuzzleHUDScene');
        hud.events.on('typeSelected', (typeId: string) => {
            const type = this.puzzle?.inventory.bridges.find(b => b.type.id === typeId)?.type;
            if (type) {
                this.controller?.selectBridgeType(type);
                // Notify HUD to update visual selection
                this.events.emit('setSelectedType', typeId);
            }
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

        // Listen for island clicks from IslandMapScene
        this.events.on('island-clicked', (worldX: number, worldY: number, gridX: number, gridY: number) => {
            console.log(`BridgePuzzleScene: Received island click at grid (${gridX}, ${gridY}), world (${worldX.toFixed(2)}, ${worldY.toFixed(2)})`);
            this.controller?.onPointerDown(worldX, worldY, gridX, gridY);
        });

        // Listen for island pointer move from IslandMapScene (for smooth bridge preview over islands)
        this.events.on('island-pointermove', (worldX: number, worldY: number, gridX: number, gridY: number) => {
            this.controller?.onPointerMove(worldX, worldY, gridX, gridY);
        });

        // Listen for island pointer up from IslandMapScene (for bridge completion over islands)
        this.events.on('island-pointerup', (worldX: number, worldY: number, gridX: number, gridY: number) => {
            this.controller?.onPointerUp(worldX, worldY, gridX, gridY);
        });

        // Enter puzzle and initialise renderer
        this.controller.enterPuzzle();

        // Ask the IslandMapScene to adjust its camera to fit islands
        // Set up camera adjustment listener along with the puzzle data listener
        this.events.once('islandMapReadyForCamera', () => {
            console.log('BridgePuzzleScene: IslandMapScene ready for camera adjustment');
            const mapScene = this.scene.get('IslandMapScene');
            mapScene.events.emit('adjustCameraZoom');
        });

        // Set up input handlers and debug functionality
        this.setupInputHandlers();
    }

    private findIslandAt(gridX: number, gridY: number) {
        if (!this.puzzle) return null;
        return this.puzzle.islands.find(isl => isl.x === gridX && isl.y === gridY);
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

            // Update camera info from IslandMapScene (not from this scene)
            const mapScene = this.scene.get('IslandMapScene');
            if (mapScene?.cameras?.main) {
                const cam = mapScene.cameras.main;
                hud.events.emit('updateCameraInfo',
                    cam.scrollX,
                    cam.scrollY,
                    cam.zoom,
                    cam.width,
                    cam.height
                );
            }
        }
    }

    private createRendererProxy() {
        const mapScene = this.scene.get('IslandMapScene') as IslandMapScene;

        // Delegate grid-to-world mapping to IslandMapScene's own GridToWorldMapper so
        // the cell size and any offset are never duplicated here.
        const gridMapperProxy = {
            gridToWorld: (gridX: number, gridY: number) => {
                return mapScene.getGridMapper()?.gridToWorld(gridX, gridY)
                    ?? { x: gridX * 32, y: gridY * 32 };
            },
            worldToGrid: (worldX: number, worldY: number) => {
                return mapScene.getGridMapper()?.worldToGrid(worldX, worldY)
                    ?? { x: Math.floor(worldX / 32), y: Math.floor(worldY / 32) };
            },
            getCellSize: () => mapScene.getGridMapper()?.getCellSize() ?? 32
        };

        return {
            gridMapper: gridMapperProxy,
            init: (puzzle: BridgePuzzle) => {
                mapScene.events.emit('initRenderer', puzzle);
            },
            updateFromPuzzle: (puzzle: BridgePuzzle) => {
                mapScene.events.emit('updateFromPuzzle', puzzle);
            },
            previewBridge: (bridge: any, opts: any) => {
                mapScene.events.emit('previewBridge', bridge, opts);
            },
            hidePreview: () => {
                mapScene.events.emit('hidePreview');
            },
            setPlacing: (isPlacing: boolean) => {
                mapScene.events.emit('setPlacing', isPlacing);
            },
            setAvailableBridgeTypes: (types: any[]) => {
                mapScene.events.emit('setAvailableBridgeTypes', types);
            },
            setSelectedBridgeType: (type: any) => {
                mapScene.events.emit('setSelectedBridgeType', type);
            },
            highlightViolations: (ids: string[]) => {
                mapScene.events.emit('highlightViolations', ids);
            },
            flashInvalidPlacement: (start: { x: number; y: number }, end: { x: number; y: number }) => {
                mapScene.events.emit('flashInvalidPlacement', start, end);
            },
            clearHighlights: () => {
                mapScene.events.emit('clearHighlights');
            },
            showConstraintFeedback: (items: any[], puzzle: any) => {
                mapScene.events.emit('showConstraintFeedback', items, puzzle);
            },
            hideConstraintFeedback: () => {
                mapScene.events.emit('hideConstraintFeedback');
            },
            update: (dt: number) => {
                mapScene.events.emit('updateRenderer', dt);
            },
            destroy: () => {
                mapScene.events.emit('destroyRenderer');
            }
        };
    }

    private setupInputHandlers() {
        // Handle mouse clicks - forward to IslandMapScene for coordinate conversion and processing
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            console.log(`BridgePuzzleScene: Pointer down at (${pointer.x}, ${pointer.y})`);
            const mapScene = this.scene.get('IslandMapScene');

            // Ask IslandMapScene to convert screen coordinates to world coordinates
            mapScene.events.emit('screenToWorld', pointer.x, pointer.y, (worldPos: { x: number; y: number }) => {
                console.log(`BridgePuzzleScene: Screen (${pointer.x}, ${pointer.y}) -> World (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`);

                // Then ask for grid coordinates
                mapScene.events.emit('worldToGrid', worldPos.x, worldPos.y, (gridPos: { x: number; y: number }) => {
                    console.log(`BridgePuzzleScene: World (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}) -> Grid (${gridPos.x}, ${gridPos.y})`);

                    // Check for island click
                    const island = this.findIslandAt(gridPos.x, gridPos.y);
                    if (island) {
                        console.log(`BridgePuzzleScene: Clicked on island at (${gridPos.x}, ${gridPos.y})`);
                        this.controller?.onPointerDown(worldPos.x, worldPos.y, gridPos.x, gridPos.y);
                        return;
                    }

                    // Check for bridge click
                    if (this.puzzle) {
                        const bridges = this.puzzle.bridgesAt(gridPos.x, gridPos.y);
                        if (bridges.length > 0) {
                            console.log(`BridgePuzzleScene: Clicked on bridge ${bridges[0].id}`);
                            this.events.emit('bridge-clicked', bridges[0].id);
                            return;
                        }
                    }

                    console.log(`BridgePuzzleScene: Clicked on empty space at grid (${gridPos.x}, ${gridPos.y})`);
                });
            });
        });

        // Handle pointer move for bridge preview during drag
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            const mapScene = this.scene.get('IslandMapScene');

            // Convert screen coordinates to world coordinates for move events
            mapScene.events.emit('screenToWorld', pointer.x, pointer.y, (worldPos: { x: number; y: number }) => {
                mapScene.events.emit('worldToGrid', worldPos.x, worldPos.y, (gridPos: { x: number; y: number }) => {
                    this.controller?.onPointerMove(worldPos.x, worldPos.y, gridPos.x, gridPos.y);
                });
            });
        });

        // Handle pointer up to complete bridge placement
        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            const mapScene = this.scene.get('IslandMapScene');

            // Convert screen coordinates to world coordinates for up events
            mapScene.events.emit('screenToWorld', pointer.x, pointer.y, (worldPos: { x: number; y: number }) => {
                mapScene.events.emit('worldToGrid', worldPos.x, worldPos.y, (gridPos: { x: number; y: number }) => {
                    this.controller?.onPointerUp(worldPos.x, worldPos.y, gridPos.x, gridPos.y);
                });
            });
        });

        // F1 key for debug zoom out (only in debug mode)
        if (Environment.isDebug()) {
            this.input.keyboard?.on('keydown-F1', () => {
                const mapScene = this.scene.get('IslandMapScene');
                mapScene.events.emit('debugZoomOut');
            });
        }

        // ESC key to cancel placement
        this.input.keyboard?.on('keydown-ESC', () => {
            this.controller?.cancelPlacement();
        });

        // Z key for undo
        this.input.keyboard?.on('keydown-Z', () => {
            this.controller?.undo();
        });

        // Y key for redo
        this.input.keyboard?.on('keydown-Y', () => {
            this.controller?.redo();
        });
    }

    private createPuzzleHost(): PuzzleHost {
        return {
            loadPuzzle: (_puzzleID: string) => {
                // Already loaded in create()
            },
            onPuzzleSolved: () => {
                try { console.log('[PuzzleHost] onPuzzleSolved called (forwarding to HUD)'); } catch (e) { }
                // Forward solved notification to show "Puzzle Solved!" overlay
                this.events.emit('puzzleSolved');
                // Delay exit to allow message to be visible for 1.5 seconds
                setTimeout(() => {
                    console.log('[BridgePuzzleScene] Auto-exiting puzzle after delay');
                    this.controller?.exitPuzzle(true);
                }, 1500);
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
        try { console.log('[BridgePuzzleScene] onPuzzleSolved() called — HUD will display solved overlay'); } catch (e) { }
    }

    onPuzzleExited(success: boolean): void {
        console.log(`Puzzle exited: ${success ? 'solved' : 'unsolved'}`);

        // If in series mode and puzzle was solved, notify the caller scene
        if (this.seriesMode && success && this.puzzle) {
            console.log(`[BridgePuzzleScene] Series puzzle ${this.puzzle.id} completed, notifying ${this.callerSceneKey}`);
            const callerScene = this.scene.get(this.callerSceneKey);
            if (callerScene) {
                // Emit event that the caller scene can listen for
                callerScene.events.emit('seriesPuzzleCompleted', {
                    puzzleId: this.puzzle.id,
                    success: true
                });
            }
        }

        // Hide HUD using PuzzleHUDManager
        PuzzleHUDManager.getInstance().exitPuzzle();

        // Stop IslandMapScene
        this.scene.stop('IslandMapScene');

        // Stop this scene
        this.scene.stop();
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