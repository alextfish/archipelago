import Phaser from 'phaser';
import { PuzzleSidebar } from '../ui/PuzzleSidebar';
import type { BridgeType } from '@model/puzzle/BridgeType';

export class PuzzleHUDScene extends Phaser.Scene {
    private sidebar: PuzzleSidebar | null = null;
    private counts: Record<string, number> = {};
    private types: BridgeType[] = [];
    private solvedOverlay: Phaser.GameObjects.Container | null = null;

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
}
