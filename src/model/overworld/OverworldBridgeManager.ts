import Phaser from 'phaser';
import type { Bridge } from '@model/puzzle/Bridge';
import type { OverworldGameState } from './OverworldGameState';

/**
 * Manages rendering of completed puzzle bridges to the overworld tilemap.
 * Handles baking bridges to the bridges layer and updating collision.
 */
export class OverworldBridgeManager {
    private static readonly BRIDGES_LAYER_NAME = 'bridges';

    // Tile indices matching EmbeddedPuzzleRenderer (these are TEXTURE frame indices)
    private readonly H_BRIDGE_LEFT = 55;
    private readonly H_BRIDGE_CENTRE = 56;
    private readonly H_BRIDGE_RIGHT = 57;
    private readonly V_BRIDGE_BOTTOM = 58;
    private readonly V_BRIDGE_MIDDLE = 59;
    private readonly V_BRIDGE_TOP = 60;
    private readonly H_BRIDGE_SINGLE = 62;
    private readonly V_BRIDGE_SINGLE = 63;
    private readonly DOUBLE_BRIDGE_OFFSET = 11;

    private tilesetFirstGid: number = 0;

    constructor(
        private map: Phaser.Tilemaps.Tilemap,
        private bridgesLayer: Phaser.Tilemaps.TilemapLayer,
        private collisionArray: boolean[][],
        private tiledMapData: any
    ) {
        // Find the firstgid of the SproutLandsGrassIslands tileset
        const tileset = this.map.getTileset('SproutLandsGrassIslands');
        if (tileset) {
            this.tilesetFirstGid = tileset.firstgid;
            console.log(`OverworldBridgeManager: SproutLandsGrassIslands tileset firstgid = ${this.tilesetFirstGid}`);
        } else {
            console.error('OverworldBridgeManager: Could not find SproutLandsGrassIslands tileset!');
        }
    }

    /**
     * Render completed puzzle bridges to the bridges layer
     * and update collision array to make them walkable
     */
    bakePuzzleBridges(puzzleId: string, puzzleBounds: Phaser.Geom.Rectangle, bridges: Bridge[]): void {
        console.log(`OverworldBridgeManager: Baking ${bridges.length} bridges for puzzle ${puzzleId}`);
        console.log(`  Puzzle bounds: (${puzzleBounds.x}, ${puzzleBounds.y}) size ${puzzleBounds.width}x${puzzleBounds.height}`);
        console.log(`  Bridges layer exists: ${!!this.bridgesLayer}, visible: ${this.bridgesLayer?.visible}`);

        if (!this.bridgesLayer) {
            console.error('OverworldBridgeManager: No bridges layer available!');
            return;
        }

        let tilesPlaced = 0;
        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) {
                console.warn(`OverworldBridgeManager: Bridge ${bridge.id} missing start or end`);
                continue;
            }

            const tiles = this.getBridgeTileData(bridge, puzzleBounds);
            console.log(`  Bridge ${bridge.id}: ${tiles.length} tiles to place`);

            for (const { tileX, tileY, tileIndex } of tiles) {
                // Convert texture frame index to tilemap GID
                // Tilemap uses GIDs which are: firstgid + frame_index
                const gid = this.tilesetFirstGid + tileIndex;

                // Add bridge visual to bridges layer
                const tile = this.bridgesLayer.putTileAt(gid, tileX, tileY);
                console.log(`    Placed tile frame=${tileIndex} -> GID=${gid} at (${tileX}, ${tileY}), result: ${tile ? 'success' : 'FAILED'}`);
                if (tile) {
                    tilesPlaced++;
                }

                // Make walkable by updating collision array
                if (tileY >= 0 && tileY < this.collisionArray.length &&
                    tileX >= 0 && tileX < this.collisionArray[tileY].length) {
                    this.collisionArray[tileY][tileX] = false;
                }
            }
        }

        console.log(`OverworldBridgeManager: Baked ${bridges.length} bridges (${tilesPlaced} tiles placed) for puzzle ${puzzleId}`);
    }

    /**
     * Clear all bridge tiles from a puzzle region and restore original collision.
     * Used when entering a puzzle (completed or incomplete) for editing.
     */
    blankPuzzleRegion(puzzleId: string, puzzleBounds: Phaser.Geom.Rectangle): void {
        console.log(`OverworldBridgeManager: Blanking region for puzzle ${puzzleId}`);

        const tileWidth = this.tiledMapData.tilewidth;
        const tileHeight = this.tiledMapData.tileheight;

        // Calculate tilemap bounds for this puzzle
        const minTileX = Math.floor(puzzleBounds.x / tileWidth);
        const minTileY = Math.floor(puzzleBounds.y / tileHeight);
        const maxTileX = Math.floor((puzzleBounds.x + puzzleBounds.width) / tileWidth);
        const maxTileY = Math.floor((puzzleBounds.y + puzzleBounds.height) / tileHeight);

        console.log(`  Clearing tiles from (${minTileX},${minTileY}) to (${maxTileX},${maxTileY})`);

        // Get the immutable collision layer to restore original values
        const collisionLayer = this.map.getLayer('collision');
        if (!collisionLayer) {
            console.error('OverworldBridgeManager: No collision layer found in tilemap!');
            return;
        }

        // Clear bridge tiles and restore collision
        for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
            for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
                // Remove bridge tile
                this.bridgesLayer.removeTileAt(tileX, tileY);

                // Restore original collision from Tiled map's collision layer
                const collisionTile = collisionLayer.tilemapLayer.getTileAt(tileX, tileY);
                const hasCollision = collisionTile !== null;

                if (tileY >= 0 && tileY < this.collisionArray.length &&
                    tileX >= 0 && tileX < this.collisionArray[tileY].length) {
                    this.collisionArray[tileY][tileX] = hasCollision;
                }
            }
        }

        console.log(`OverworldBridgeManager: Blanked region for puzzle ${puzzleId}`);
    }

    /**
     * Restore bridges for all completed puzzles (called on game load)
     * Takes a function to get puzzle bounds by ID
     */
    restoreCompletedPuzzles(
        gameState: OverworldGameState,
        getPuzzleBounds: (puzzleId: string) => Phaser.Geom.Rectangle | null
    ): void {
        const completedPuzzleIds = gameState.getCompletedPuzzles();
        console.log(`OverworldBridgeManager: Restoring ${completedPuzzleIds.length} completed puzzles`);

        for (const puzzleId of completedPuzzleIds) {
            const puzzleBounds = getPuzzleBounds(puzzleId);
            if (!puzzleBounds) {
                console.warn(`OverworldBridgeManager: Completed puzzle ${puzzleId} not found`);
                continue;
            }

            const progress = gameState.loadOverworldPuzzleProgress(puzzleId);
            if (!progress || !progress.bridges) {
                console.warn(`OverworldBridgeManager: No saved bridges for completed puzzle ${puzzleId}`);
                continue;
            }

            this.bakePuzzleBridges(puzzleId, puzzleBounds, progress.bridges);
        }

        console.log(`OverworldBridgeManager: Restored all completed puzzle bridges`);
    }

    /**
     * Calculate which tilemap tiles a bridge occupies and what tile index to use for each
     */
    private getBridgeTileData(
        bridge: Bridge,
        puzzleBounds: Phaser.Geom.Rectangle
    ): Array<{ tileX: number; tileY: number; tileIndex: number }> {
        const result: Array<{ tileX: number; tileY: number; tileIndex: number }> = [];

        if (!bridge.start || !bridge.end) {
            return result;
        }

        const tileWidth = this.tiledMapData.tilewidth;
        const tileHeight = this.tiledMapData.tileheight;

        // Determine if horizontal or vertical
        const isHorizontal = bridge.start.y === bridge.end.y;
        const isDouble = bridge.type.id === 'double';
        const doubleOffset = isDouble ? this.DOUBLE_BRIDGE_OFFSET : 0;

        if (isHorizontal) {
            // Horizontal bridge
            const y = bridge.start.y;
            const startX = Math.min(bridge.start.x, bridge.end.x);
            const endX = Math.max(bridge.start.x, bridge.end.x);
            const length = endX - startX + 1;

            for (let i = 0; i < length; i++) {
                const gridX = startX + i;

                // Convert puzzle grid coords to world coords to tilemap coords
                const worldX = puzzleBounds.x + gridX * 32;
                const worldY = puzzleBounds.y + y * 32;
                const tileX = Math.floor(worldX / tileWidth);
                const tileY = Math.floor(worldY / tileHeight);

                // Determine which tile index to use
                let tileIndex: number;
                if (length === 1) {
                    tileIndex = this.H_BRIDGE_SINGLE;
                } else if (i === 0) {
                    tileIndex = this.H_BRIDGE_LEFT;
                } else if (i === length - 1) {
                    tileIndex = this.H_BRIDGE_RIGHT;
                } else {
                    tileIndex = this.H_BRIDGE_CENTRE;
                }
                tileIndex += doubleOffset;

                result.push({ tileX, tileY, tileIndex });
            }
        } else {
            // Vertical bridge
            const x = bridge.start.x;
            const startY = Math.min(bridge.start.y, bridge.end.y);
            const endY = Math.max(bridge.start.y, bridge.end.y);
            const length = endY - startY + 1;

            for (let i = 0; i < length; i++) {
                const gridY = startY + i;

                // Convert puzzle grid coords to world coords to tilemap coords
                const worldX = puzzleBounds.x + x * 32;
                const worldY = puzzleBounds.y + gridY * 32;
                const tileX = Math.floor(worldX / tileWidth);
                const tileY = Math.floor(worldY / tileHeight);

                // Determine which tile index to use
                let tileIndex: number;
                if (length === 1) {
                    tileIndex = this.V_BRIDGE_SINGLE;
                } else if (i === 0) {
                    tileIndex = this.V_BRIDGE_TOP;
                } else if (i === length - 1) {
                    tileIndex = this.V_BRIDGE_BOTTOM;
                } else {
                    tileIndex = this.V_BRIDGE_MIDDLE;
                }
                tileIndex += doubleOffset;

                result.push({ tileX, tileY, tileIndex });
            }
        }

        return result;
    }

    /**
     * Get the bridges layer name constant
     */
    static getBridgesLayerName(): string {
        return OverworldBridgeManager.BRIDGES_LAYER_NAME;
    }
}
