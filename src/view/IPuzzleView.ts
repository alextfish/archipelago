import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { BridgeType } from '@model/puzzle/BridgeType';
import type { Point } from '@model/puzzle/Point';

/**
 * Interface for puzzle view implementations that can render puzzles
 * in different contexts (dedicated scene vs embedded in overworld)
 */
export interface IPuzzleView {
    /**
     * Initialize the view with a puzzle
     */
    init(puzzle: BridgePuzzle): void;

    /**
     * Update the view to match the current puzzle state
     */
    updateFromPuzzle(puzzle: BridgePuzzle): void;

    /**
     * Show a preview of a bridge being placed
     */
    showPreview(start: Point, end: Point, bridgeType: BridgeType): void;

    /**
     * Hide any active bridge preview
     */
    hidePreview(): void;

    /**
     * Clean up and destroy the view
     */
    destroy(): void;

    /**
     * Convert screen coordinates to grid coordinates
     */
    screenToGrid(screenX: number, screenY: number): Point;

    /**
     * Convert grid coordinates to world coordinates
     */
    gridToWorld(gridX: number, gridY: number): Point;
}