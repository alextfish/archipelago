import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { Bridge } from '@model/puzzle/Bridge';
import type { OverworldScene } from '@view/scenes/OverworldScene';

/**
 * Manages dynamic collision updates for overworld puzzles
 * Converts puzzle bridges to overworld collision tiles and restores original state
 */
export class CollisionManager {
    private overworldScene: OverworldScene;
    private originalCollision: Map<string, boolean> = new Map();
    private puzzleBounds: Phaser.Geom.Rectangle | null = null;
    private tileSize: number = 32;

    constructor(overworldScene: OverworldScene) {
        this.overworldScene = overworldScene;
    }

    /**
     * Update overworld collision based on puzzle bridges
     */
    updateCollisionFromBridges(puzzle: BridgePuzzle, puzzleBounds: Phaser.Geom.Rectangle): void {
        console.log(`CollisionManager: Updating collision for puzzle ${puzzle.id}`);

        this.puzzleBounds = puzzleBounds;
        this.storeOriginalCollision(puzzleBounds);

        // Apply collision for all bridges
        for (const bridge of puzzle.bridges) {
            this.applyBridgeCollision(bridge, puzzleBounds);
        }
    }

    /**
     * Restore original collision state before puzzle entry
     */
    restoreOriginalCollision(): void {
        if (!this.puzzleBounds) {
            console.warn('No puzzle bounds stored for collision restoration');
            return;
        }

        console.log('CollisionManager: Restoring original collision');

        // Restore all stored collision states
        for (const [key, originalCollision] of this.originalCollision) {
            const [x, y] = key.split(',').map(Number);
            this.overworldScene.setCollisionAt(x, y, originalCollision);
        }

        // Clear stored state
        this.originalCollision.clear();
        this.puzzleBounds = null;
    }

    /**
     * Add collision for a single bridge (used when bridge is placed)
     */
    addBridgeCollision(bridge: Bridge, puzzleBounds: Phaser.Geom.Rectangle): void {
        if (!bridge.start || !bridge.end) {
            return;
        }

        console.log(`CollisionManager: Adding collision for bridge ${bridge.id}`);
        this.applyBridgeCollision(bridge, puzzleBounds);
    }

    /**
     * Remove collision for a single bridge (used when bridge is removed)
     */
    removeBridgeCollision(bridge: Bridge, puzzleBounds: Phaser.Geom.Rectangle): void {
        if (!bridge.start || !bridge.end) {
            return;
        }

        console.log(`CollisionManager: Removing collision for bridge ${bridge.id}`);

        // Get all tile positions for this bridge
        const bridgeTiles = this.getBridgeTilePositions(bridge, puzzleBounds);

        // Restore original collision for each tile
        for (const { tileX, tileY } of bridgeTiles) {
            const key = `${tileX},${tileY}`;
            const originalCollision = this.originalCollision.get(key) || false;
            this.overworldScene.setCollisionAt(tileX, tileY, originalCollision);
        }
    }

    private storeOriginalCollision(puzzleBounds: Phaser.Geom.Rectangle): void {
        // Calculate tile range for the puzzle area
        const startTileX = Math.floor(puzzleBounds.x / this.tileSize);
        const startTileY = Math.floor(puzzleBounds.y / this.tileSize);
        const endTileX = startTileX + Math.ceil(puzzleBounds.width / this.tileSize);
        const endTileY = startTileY + Math.ceil(puzzleBounds.height / this.tileSize);

        // Store original collision for all tiles in puzzle area
        for (let tileY = startTileY; tileY < endTileY; tileY++) {
            for (let tileX = startTileX; tileX < endTileX; tileX++) {
                const key = `${tileX},${tileY}`;
                const originalCollision = this.overworldScene.hasCollisionAt(tileX, tileY);
                this.originalCollision.set(key, originalCollision);
            }
        }

        console.log(`CollisionManager: Stored collision for ${this.originalCollision.size} tiles`);
    }

    private applyBridgeCollision(bridge: Bridge, puzzleBounds: Phaser.Geom.Rectangle): void {
        if (!bridge.start || !bridge.end) {
            return;
        }

        // Get all tile positions for this bridge
        const bridgeTiles = this.getBridgeTilePositions(bridge, puzzleBounds);

        // Set collision for each tile
        for (const { tileX, tileY } of bridgeTiles) {
            this.overworldScene.setCollisionAt(tileX, tileY, true);
        }
    }

    private getBridgeTilePositions(
        bridge: Bridge,
        puzzleBounds: Phaser.Geom.Rectangle
    ): Array<{ tileX: number; tileY: number }> {
        if (!bridge.start || !bridge.end) {
            return [];
        }

        const positions: Array<{ tileX: number; tileY: number }> = [];

        // Determine if bridge is horizontal or vertical
        if (bridge.start.y === bridge.end.y) {
            // Horizontal bridge
            const y = bridge.start.y;
            const startX = Math.min(bridge.start.x, bridge.end.x);
            const endX = Math.max(bridge.start.x, bridge.end.x);

            for (let x = startX; x <= endX; x++) {
                const worldX = puzzleBounds.x + x * this.tileSize;
                const worldY = puzzleBounds.y + y * this.tileSize;
                const tileX = Math.floor(worldX / this.tileSize);
                const tileY = Math.floor(worldY / this.tileSize);
                positions.push({ tileX, tileY });
            }
        } else {
            // Vertical bridge
            const x = bridge.start.x;
            const startY = Math.min(bridge.start.y, bridge.end.y);
            const endY = Math.max(bridge.start.y, bridge.end.y);

            for (let y = startY; y <= endY; y++) {
                const worldX = puzzleBounds.x + x * this.tileSize;
                const worldY = puzzleBounds.y + y * this.tileSize;
                const tileX = Math.floor(worldX / this.tileSize);
                const tileY = Math.floor(worldY / this.tileSize);
                positions.push({ tileX, tileY });
            }
        }

        return positions;
    }
}