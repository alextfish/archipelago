import Phaser from 'phaser';
import { PuzzleController } from './PuzzleController';
import type { IPuzzleView } from '@view/IPuzzleView';
import { Environment } from '@helpers/Environment';

/**
 * Handles input for puzzle solving that can work in any Phaser scene context
 * Provides unified input handling for both dedicated puzzle scenes and embedded overworld puzzles
 */
export class PuzzleInputHandler {
    private scene: Phaser.Scene;
    private controller: PuzzleController;
    private view: IPuzzleView;

    constructor(
        scene: Phaser.Scene,
        controller: PuzzleController,
        view: IPuzzleView
    ) {
        this.scene = scene;
        this.controller = controller;
        this.view = view;
    }

    /**
     * Set up all input handlers for puzzle interaction
     */
    setupInputHandlers(): void {
        this.setupPointerInput();
        this.setupKeyboardInput();
    }

    /**
     * Clean up input handlers
     */
    destroy(): void {
        // Remove all listeners we set up
        this.scene.input.off('pointerdown');
        this.scene.input.off('pointermove');
        this.scene.input.off('pointerup');

        if (this.scene.input.keyboard) {
            this.scene.input.keyboard.off('keydown-ESC');
            this.scene.input.keyboard.off('keydown-Z');
            this.scene.input.keyboard.off('keydown-Y');

            if (Environment.isDebug()) {
                this.scene.input.keyboard.off('keydown-F1');
            }
        }
    }

    private setupPointerInput(): void {
        // Handle mouse clicks
        this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const gridPos = this.view.screenToGrid(pointer.x, pointer.y);
            const worldPos = this.view.gridToWorld(gridPos.x, gridPos.y);

            console.log(`PuzzleInputHandler: Pointer down at screen (${pointer.x}, ${pointer.y}) -> grid (${gridPos.x}, ${gridPos.y}) -> world (${worldPos.x}, ${worldPos.y})`);

            this.controller.onPointerDown(worldPos.x, worldPos.y, gridPos.x, gridPos.y);
        });

        // Handle pointer move for bridge preview during drag
        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            const gridPos = this.view.screenToGrid(pointer.x, pointer.y);

            // Get actual world position without grid snapping for smooth previews
            const camera = this.scene.cameras.main;
            const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);

            this.controller.onPointerMove(worldPoint.x, worldPoint.y, gridPos.x, gridPos.y);
        });

        // Handle pointer up to complete bridge placement
        this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            const gridPos = this.view.screenToGrid(pointer.x, pointer.y);
            const worldPos = this.view.gridToWorld(gridPos.x, gridPos.y);

            this.controller.onPointerUp(worldPos.x, worldPos.y, gridPos.x, gridPos.y);
        });
    }

    private setupKeyboardInput(): void {
        if (!this.scene.input.keyboard) return;

        // ESC key to cancel placement
        this.scene.input.keyboard.on('keydown-ESC', () => {
            this.controller.cancelPlacement();
        });

        // Z key for undo
        this.scene.input.keyboard.on('keydown-Z', () => {
            this.controller.undo();
        });

        // Y key for redo
        this.scene.input.keyboard.on('keydown-Y', () => {
            this.controller.redo();
        });

        // F1 key for debug zoom out (only in debug mode)
        if (Environment.isDebug()) {
            this.scene.input.keyboard.on('keydown-F1', () => {
                // Emit debug event that can be handled by the specific view implementation
                this.scene.events.emit('debugZoomOut');
            });
        }
    }
}