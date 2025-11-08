import Phaser from 'phaser';
import { PuzzleSidebar } from '../ui/PuzzleSidebar';
import type { BridgeType } from '@model/puzzle/BridgeType';

export class PuzzleHUDScene extends Phaser.Scene {
    private sidebar: PuzzleSidebar | null = null;
    private counts: Record<string, number> = {};
    private types: BridgeType[] = [];

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

        this.events.on('setSelectedType', (typeId: string | null) => {
            if (typeId) this.sidebar?.setSelectedType(typeId);
        });

        this.events.on('adjustForCameraZoom', (zoom: number) => {
            this.sidebar?.adjustForCameraZoom(zoom);
        });
        // Notify other scenes that the HUD is ready to receive events
        this.scene.get('BridgePuzzleScene').events.emit('hudReady');
    }
}
