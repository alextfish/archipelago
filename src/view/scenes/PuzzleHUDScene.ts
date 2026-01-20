import Phaser from 'phaser';
import { PuzzleSidebar } from '../ui/PuzzleSidebar';
import type { BridgeType } from '@model/puzzle/BridgeType';
import type { PuzzleController } from '@controller/PuzzleController';

export class PuzzleHUDScene extends Phaser.Scene {
    private sidebar: PuzzleSidebar | null = null;
    private counts: Record<string, number> = {};
    private types: BridgeType[] = [];
    private solvedOverlay: Phaser.GameObjects.Container | null = null;
    private eventListeners: Array<{ event: string; callback: Function }> = [];

    constructor() {
        super({ key: 'PuzzleHUDScene' });
    }

    create() {
        // Create the sidebar UI and wire its callbacks to scene events so other scenes
        // can listen for user actions.
        const callbacks = {
            onTypeSelected: (typeId: string) => this.events.emit('typeSelected', typeId),
            onExit: () => this.events.emit('exit'),
            onUndo: () => this.events.emit('undo'),
            onRedo: () => this.events.emit('redo'),
        };

        this.sidebar = new PuzzleSidebar(this as Phaser.Scene, callbacks);
        // Initially create with empty types/counts; the puzzle scene will immediately
        // emit 'setTypes' and 'updateCounts' when it's ready.
        this.sidebar.create(this.types, this.counts);

        // Listen for external updates from the puzzle scene
        console.log('PuzzleHUDScene created and listening for events.');
        this.scene.get('BridgePuzzleScene').events.on('setTypes', (types: BridgeType[]) => {
            console.log('HUD received setTypes event with types:', types);
            this.types = types;
            // recreate UI with counts preserved
            this.sidebar?.create(this.types, this.counts);
        });

        this.events.on('updateCounts', (counts: Record<string, number>) => {
            this.counts = counts;
            this.sidebar?.updateCounts(counts);
        });

        this.events.on('setUndoEnabled', (enabled: boolean) => {
            this.sidebar?.setUndoEnabled(enabled);
        });

        this.events.on('setRedoEnabled', (enabled: boolean) => {
            this.sidebar?.setRedoEnabled(enabled);
        });

        this.events.on('setSelectedType', (typeId: string | null) => {
            if (typeId) this.sidebar?.setSelectedType(typeId);
        });

        // UI stays at fixed scale now, so no camera zoom adjustment needed

        this.events.on('updateCameraInfo', (x: number, y: number, zoom: number, width: number, height: number) => {
            this.sidebar?.updateCameraInfo(x, y, zoom, width, height);
        });

        this.events.on('updateIslandInfo', (totalCount: number, visibleCount: number, bounds?: { minX: number; maxX: number; minY: number; maxY: number }) => {
            this.sidebar?.updateIslandInfo(totalCount, visibleCount, bounds);
        });

        // Listen for solved notification and show a persistent HUD overlay
        this.events.on('puzzleSolved', () => {
            try { console.log('[PuzzleHUDScene] puzzleSolved event received - showing HUD overlay'); } catch (e) { }
            if (this.solvedOverlay) return; // already shown
            const centerX = (this.scale?.width ?? 800) / 2;
            const centerY = (this.scale?.height ?? 600) / 2;

            // Background translucent box
            const bg = this.add.rectangle(centerX, centerY, 420, 120, 0x003300, 0.9);
            const text = this.add.text(centerX, centerY, 'Puzzle Solved!', {
                color: '#00ff00',
                fontSize: '36px',
                fontStyle: 'bold'
            }).setOrigin(0.5, 0.5);

            // Keep HUD elements fixed to the viewport
            if ((bg as any).setScrollFactor) (bg as any).setScrollFactor(0);
            if ((text as any).setScrollFactor) (text as any).setScrollFactor(0);

            // High depth so it overlays everything
            bg.setDepth(2000);
            text.setDepth(2001);

            this.solvedOverlay = this.add.container(0, 0, [bg, text]);
            this.solvedOverlay.setDepth(2000);

            // Keep the overlay until the scene is stopped or reloaded. No auto-hide.
        });
        // Notify other scenes that the HUD is ready to receive events
        this.scene.get('BridgePuzzleScene').events.emit('hudReady');
    }

    /**
     * Setup HUD for a specific puzzle type
     * Called by PuzzleHUDManager when entering puzzle mode
     */
    setupForPuzzle(_controller: PuzzleController, puzzleType: 'overworld' | 'bridge'): void {
        console.log(`PuzzleHUDScene: Setting up for ${puzzleType} puzzle`);

        // Clear any existing event listeners
        this.cleanupEventListeners();

        // Get the source scene for events (different for each puzzle type)
        const sourceScene = puzzleType === 'bridge'
            ? this.scene.get('BridgePuzzleScene')
            : this.scene.get('OverworldScene');

        if (!sourceScene) {
            console.error(`PuzzleHUDScene: Could not find source scene for ${puzzleType}`);
            return;
        }

        // Set up event listeners for this puzzle
        this.setupEventListener(sourceScene.events, 'setTypes', (types: BridgeType[]) => {
            console.log('HUD received setTypes event with types:', types);
            this.types = types;
            this.sidebar?.create(this.types, this.counts);
        });

        this.setupEventListener(sourceScene.events, 'updateCounts', (counts: Record<string, number>) => {
            console.log('HUD received updateCounts event with counts:', counts);
            this.counts = counts;
            this.sidebar?.updateCounts(counts);
        });

        this.setupEventListener(sourceScene.events, 'setUndoEnabled', (enabled: boolean) => {
            this.sidebar?.setUndoEnabled(enabled);
        });

        this.setupEventListener(sourceScene.events, 'setRedoEnabled', (enabled: boolean) => {
            this.sidebar?.setRedoEnabled(enabled);
        });

        this.setupEventListener(sourceScene.events, 'setSelectedType', (typeId: string | null) => {
            if (typeId) this.sidebar?.setSelectedType(typeId);
        });

        this.setupEventListener(sourceScene.events, 'updateCameraInfo', (x: number, y: number, zoom: number, width: number, height: number) => {
            this.sidebar?.updateCameraInfo(x, y, zoom, width, height);
        });

        this.setupEventListener(sourceScene.events, 'updateIslandInfo', (totalCount: number, visibleCount: number, bounds?: { minX: number; maxX: number; minY: number; maxY: number }) => {
            this.sidebar?.updateIslandInfo(totalCount, visibleCount, bounds);
        });

        this.setupEventListener(sourceScene.events, 'puzzleSolved', () => {
            this.showSolvedOverlay();
        });

        // Add puzzle-type-specific UI if needed
        if (puzzleType === 'overworld') {
            this.addOverworldSpecificUI();
        } else {
            this.addBridgePuzzleSpecificUI();
        }

        console.log(`PuzzleHUDScene: Setup complete for ${puzzleType} puzzle`);
    }

    /**
     * Helper to setup and track event listeners
     */
    private setupEventListener(emitter: Phaser.Events.EventEmitter, event: string, callback: Function): void {
        emitter.on(event, callback, this);
        this.eventListeners.push({ event, callback });
    }

    /**
     * Add overworld-specific UI elements
     */
    private addOverworldSpecificUI(): void {
        // Could add "Return to Exploration" hint or other overworld-specific UI
        // For now, keep it simple
    }

    /**
     * Add bridge puzzle-specific UI elements
     */
    private addBridgePuzzleSpecificUI(): void {
        // Could add "Return to Overworld" button or other bridge-specific UI
        // For now, keep it simple
    }

    /**
     * Show the puzzle solved overlay
     */
    private showSolvedOverlay(): void {
        console.log('[PuzzleHUDScene] Showing solved overlay');

        if (this.solvedOverlay) return; // already shown

        const centerX = (this.scale?.width ?? 800) / 2;
        const centerY = (this.scale?.height ?? 600) / 2;

        // Background translucent box
        const bg = this.add.rectangle(centerX, centerY, 420, 120, 0x003300, 0.9);
        const text = this.add.text(centerX, centerY, 'Puzzle Solved!', {
            color: '#00ff00',
            fontSize: '36px',
            fontStyle: 'bold'
        }).setOrigin(0.5, 0.5);

        // Keep HUD elements fixed to the viewport
        if ((bg as any).setScrollFactor) (bg as any).setScrollFactor(0);
        if ((text as any).setScrollFactor) (text as any).setScrollFactor(0);

        // High depth so it overlays everything
        bg.setDepth(2000);
        text.setDepth(2001);

        this.solvedOverlay = this.add.container(0, 0, [bg, text]);
        this.solvedOverlay.setDepth(2000);
    }

    /**
     * Clean up event listeners
     */
    private cleanupEventListeners(): void {
        // Remove all tracked event listeners
        for (const listener of this.eventListeners) {
            this.events.off(listener.event, listener.callback as any, this);
        }
        this.eventListeners = [];
    }

    /**
     * Clean up HUD state when exiting puzzle
     * Called by PuzzleHUDManager
     */
    cleanup(): void {
        console.log('PuzzleHUDScene: Cleaning up');

        // Remove solved overlay if it exists
        if (this.solvedOverlay) {
            this.solvedOverlay.destroy();
            this.solvedOverlay = null;
        }

        // Clean up event listeners
        this.cleanupEventListeners();

        // Reset state
        this.counts = {};
        this.types = [];

        // Reset sidebar if it exists
        if (this.sidebar) {
            // Reset selection (PuzzleSidebar doesn't support null, so we just don't call it)
            // The sidebar will be recreated when a new puzzle starts
        }

        console.log('PuzzleHUDScene: Cleanup complete');
    }

    /**
     * Set visibility of the HUD scene
     */
    setVisible(visible: boolean): void {
        console.log(`PuzzleHUDScene: Setting visibility to ${visible}`);
        this.scene.setVisible(visible);

        // Sidebar visibility is controlled by the scene visibility
        // No need to explicitly control it
    }
}
