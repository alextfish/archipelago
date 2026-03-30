import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { Bridge } from '@model/puzzle/Bridge';
import type { OverworldScene } from '@view/scenes/OverworldScene';
import type { Door } from '@model/overworld/Door';
import { CollisionType } from '@model/overworld/CollisionTypes';

// Re-export CollisionType so existing callers that import it from this module continue to work.
export { CollisionType } from '@model/overworld/CollisionTypes';

/**
 * Manages **runtime** collision state for the overworld during gameplay.
 *
 * Responsibilities:
 * - Storing and restoring the original collision state when the player enters / exits a puzzle
 * - Applying WALKABLE collision for newly placed bridges; restoring it when bridges are removed
 * - Updating collision for doors when they are locked or unlocked
 *
 * This is a stateful object with a live reference to OverworldScene.
 * It is distinct from CollisionTileClassifier, which is a pure, stateless helper used
 * once at map-load time to read tile properties from Tiled and build the initial
 * collision arrays.
 */
export class CollisionManager {
    private overworldScene: OverworldScene;
    private originalCollision: Map<string, CollisionType> = new Map();
    private puzzleBounds: Phaser.Geom.Rectangle | null = null;
    private tileSize: number = 32;
    private doors: Door[] = [];

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
        for (const [key, originalCollisionType] of this.originalCollision) {
            const [x, y] = key.split(',').map(Number);
            this.overworldScene.setCollisionAt(x, y, originalCollisionType);
        }

        // Clear stored state
        this.originalCollision.clear();
        this.puzzleBounds = null;
    }

    /**
     * Set collision type at a specific tile position.
     * Updates both the collision array and the appropriate collision layers.
     */
    setCollisionAt(tileX: number, tileY: number, collisionType: CollisionType): void {
        this.overworldScene.setCollisionAt(tileX, tileY, collisionType);
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
            const originalCollisionType = this.originalCollision.get(key) || CollisionType.WALKABLE;
            this.overworldScene.setCollisionAt(tileX, tileY, originalCollisionType);
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
                const originalCollisionType = this.overworldScene.getCollisionAt(tileX, tileY);
                this.originalCollision.set(key, originalCollisionType);
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

        // Set walkable for each tile (bridges are always upper layer)
        for (const { tileX, tileY } of bridgeTiles) {
            this.overworldScene.setCollisionAt(tileX, tileY, CollisionType.WALKABLE);
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

    /**
     * Register doors and set their initial collision state
     */
    registerDoors(doors: Door[]): void {
        console.log(`CollisionManager: Registering ${doors.length} doors`);
        this.doors = doors;
        this.updateDoorCollisions();
    }

    /**
     * Update collision for all doors based on their locked state
     */
    updateDoorCollisions(): void {
        console.log(`CollisionManager: Updating collision for ${this.doors.length} doors`);
        for (const door of this.doors) {
            this.updateDoorCollision(door);
        }
    }

    /**
     * Update collision for a specific door
     */
    updateDoorCollision(door: Door): void {
        const locked = door.isLocked();
        // Locked doors are blocked, unlocked doors are walkable
        const collisionType = locked ? CollisionType.BLOCKED : CollisionType.WALKABLE;
        console.log(`CollisionManager: Updating door ${door.id} collision: locked=${locked}, type=${collisionType}`);
        for (const pos of door.getPositions()) {
            this.overworldScene.setCollisionAt(pos.tileX, pos.tileY, collisionType);
            console.log(`  Set collision at (${pos.tileX}, ${pos.tileY}) to ${collisionType}`);
        }
    }

    /**
     * Get all registered doors
     */
    getDoors(): readonly Door[] {
        return this.doors;
    }
}