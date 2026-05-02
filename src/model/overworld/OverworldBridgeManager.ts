import Phaser from 'phaser';
import type { Bridge } from '@model/puzzle/Bridge';
import type { OverworldGameState } from './OverworldGameState';
import { BridgeSpriteFrames } from '@view/BridgeSpriteFrameRegistry';
import { CollisionType } from './CollisionManager';

/**
 * Tracks which directions have bridges at a tile
 */
interface TileConnections {
    north: boolean;
    east: boolean;
    south: boolean;
    west: boolean;
}

/**
 * Manages rendering of completed puzzle bridges to the overworld tilemap.
 * Handles baking bridges to the bridges layer and updating collision.
 */
export class OverworldBridgeManager {
    private static readonly BRIDGES_LAYER_NAME = 'bridges';
    private static readonly BRIDGE_TILESET_IMAGE = 'SproutLandsGrassIslands.png';

    private bridgeTilesetFirstGid: number = 0;

    // Tile positions placed by bakePuzzleBridges, keyed by puzzleId.
    // Used to reliably clear exactly the baked tiles on puzzle re-entry.
    private bakedTilePositions: Map<string, Array<{ tileX: number; tileY: number }>> = new Map();

    constructor(
        private bridgesLayer: Phaser.Tilemaps.TilemapLayer,
        private tiledMapData: any,
        private collisionManager: any // OverworldScene that has setCollisionAt method
    ) {
        // Find the bridge tileset by searching for the image filename
        this.bridgeTilesetFirstGid = this.findBridgeTilesetFirstGid();
        if (this.bridgeTilesetFirstGid > 0) {
            // fine
        } else {
            console.error(`OverworldBridgeManager: Could not find tileset with image ${OverworldBridgeManager.BRIDGE_TILESET_IMAGE}`);
        }
    }

    /**
     * Find the firstgid of the bridge tileset by searching for its image filename
     */
    private findBridgeTilesetFirstGid(): number {
        // Search through all tilesets in the tiledMapData
        if (!this.tiledMapData?.tilesets) {
            console.warn('OverworldBridgeManager: No tilesets found in tiledMapData');
            return 0;
        }

        for (const tilesetData of this.tiledMapData.tilesets) {
            // Check if the tileset's image ends with our bridge tileset filename
            if (tilesetData.image && tilesetData.image.endsWith(OverworldBridgeManager.BRIDGE_TILESET_IMAGE)) {
                console.log(`OverworldBridgeManager: Found bridge tileset '${tilesetData.name}' with image ${tilesetData.image}`);
                return tilesetData.firstgid;
            }
        }

        return 0;
    }

    /**
     * Render completed puzzle bridges to the bridges layer
     * and update collision array to make them walkable.
     * 
     * Uses junction tiles when multiple bridges meet at the same tile.
     *
     * Single bridges (only one bridge between a pair of islands) receive narrow-passage
     * collision on their body tiles (the squares strictly between the two island endpoints):
     * - Vertical single bridges → NARROW_NS (passable north/south only)
     * - Horizontal single bridges → NARROW_EW (passable east/west only)
     * When multiple bridges span the same island pair every tile (including body tiles) is
     * given full WALKABLE collision, as with the original behaviour.
     * Island endpoint tiles are always given full WALKABLE collision regardless.
     */
    bakePuzzleBridges(puzzleId: string, puzzleBounds: Phaser.Geom.Rectangle, bridges: Bridge[]): void {
        console.log(`OverworldBridgeManager: Baking ${bridges.length} bridges for puzzle ${puzzleId}`);
        console.log(`  Puzzle bounds: (${puzzleBounds.x}, ${puzzleBounds.y}) size ${puzzleBounds.width}x${puzzleBounds.height}`);
        console.log(`  Bridges layer exists: ${!!this.bridgesLayer}, visible: ${this.bridgesLayer?.visible}`);

        if (!this.bridgesLayer) {
            console.error('OverworldBridgeManager: No bridges layer available!');
            return;
        }

        // Check layer properties
        const layerData = this.bridgesLayer.layer;
        console.log(`  Layer dimensions: ${layerData.width}x${layerData.height}`);
        console.log(`  Layer has data array: ${!!layerData.data}, length: ${layerData.data?.length}`);
        if (layerData.data && layerData.data.length > 0) {
            console.log(`  First row exists: ${!!layerData.data[0]}, length: ${layerData.data[0]?.length}`);
        }

        // Count how many bridges span each island pair so we know whether to use
        // full WALKABLE or narrow-passage collision on body tiles.
        const bridgeCountPerPair = this.countBridgesPerIslandPair(bridges);

        // Phase 1: Collect all bridge segments and their connections at each tile
        const tileConnectionsMap = new Map<string, TileConnections>();

        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) {
                console.warn(`OverworldBridgeManager: Bridge ${bridge.id} missing start or end`);
                continue;
            }

            // Add connections for this bridge
            this.collectBridgeConnections(bridge, puzzleBounds, tileConnectionsMap);
        }

        console.log(`  Collected connections for ${tileConnectionsMap.size} unique tiles`);

        // Phase 2: Place appropriate tiles based on collected connections
        let tilesPlaced = 0;
        for (const [tileKey, connections] of tileConnectionsMap.entries()) {
            const parts = tileKey.split(',');
            if (parts.length !== 2) {
                console.warn(`OverworldBridgeManager: Invalid tile key format: ${tileKey}`);
                continue;
            }
            const [tileX, tileY] = parts.map(Number);
            if (isNaN(tileX) || isNaN(tileY)) {
                console.warn(`OverworldBridgeManager: Invalid tile coordinates from key ${tileKey}: (${tileX}, ${tileY})`);
                continue;
            }

            // Determine which sprite frame to use based on connections
            const tileIndex = this.getTileIndexForConnections(connections);

            // Convert texture frame index to tilemap GID
            const gid = this.bridgeTilesetFirstGid + tileIndex;

            // Add bridge visual to bridges layer
            const tile = this.bridgesLayer.putTileAt(gid, tileX, tileY);
            if (tile) {
                tilesPlaced++;
                // Record position so we can clear exactly these tiles on re-entry
                if (!this.bakedTilePositions.has(puzzleId)) {
                    this.bakedTilePositions.set(puzzleId, []);
                }
                this.bakedTilePositions.get(puzzleId)!.push({ tileX, tileY });
            }

            // Determine appropriate collision type for this tile.
            const collisionType = this.getBakedTileCollisionType(
                tileX, tileY, connections, puzzleBounds, bridges, bridgeCountPerPair
            );
            this.collisionManager.setCollisionAt(tileX, tileY, collisionType);
        }

        console.log(`OverworldBridgeManager: Baked ${bridges.length} bridges (${tilesPlaced} tiles placed) for puzzle ${puzzleId}`);
    }

    /**
     * Collect bridge connections at each tile position
     */
    private collectBridgeConnections(
        bridge: Bridge,
        puzzleBounds: Phaser.Geom.Rectangle,
        tileConnectionsMap: Map<string, TileConnections>
    ): void {
        if (!bridge.start || !bridge.end) return;

        const tileWidth = this.tiledMapData.tilewidth;
        const tileHeight = this.tiledMapData.tileheight;

        // Determine if horizontal or vertical
        const isHorizontal = bridge.start.y === bridge.end.y;

        if (isHorizontal) {
            // Horizontal bridge
            const y = bridge.start.y;
            const startX = Math.min(bridge.start.x, bridge.end.x);
            const endX = Math.max(bridge.start.x, bridge.end.x);

            for (let gridX = startX; gridX <= endX; gridX++) {
                const worldX = puzzleBounds.x + gridX * 32;
                const worldY = puzzleBounds.y + y * 32;
                const tileX = Math.floor(worldX / tileWidth);
                const tileY = Math.floor(worldY / tileHeight);
                const tileKey = `${tileX},${tileY}`;

                if (!tileConnectionsMap.has(tileKey)) {
                    tileConnectionsMap.set(tileKey, { north: false, east: false, south: false, west: false });
                }

                const connections = tileConnectionsMap.get(tileKey)!;

                // Mark connections based on position in bridge
                if (gridX > startX) connections.west = true;  // Has segment to the west
                if (gridX < endX) connections.east = true;    // Has segment to the east
            }
        } else {
            // Vertical bridge
            const x = bridge.start.x;
            const startY = Math.min(bridge.start.y, bridge.end.y);
            const endY = Math.max(bridge.start.y, bridge.end.y);

            for (let gridY = startY; gridY <= endY; gridY++) {
                const worldX = puzzleBounds.x + x * 32;
                const worldY = puzzleBounds.y + gridY * 32;
                const tileX = Math.floor(worldX / tileWidth);
                const tileY = Math.floor(worldY / tileHeight);
                const tileKey = `${tileX},${tileY}`;

                if (!tileConnectionsMap.has(tileKey)) {
                    tileConnectionsMap.set(tileKey, { north: false, east: false, south: false, west: false });
                }

                const connections = tileConnectionsMap.get(tileKey)!;

                // Mark connections based on position in bridge
                if (gridY > startY) connections.north = true;  // Has segment to the north
                if (gridY < endY) connections.south = true;    // Has segment to the south
            }
        }
    }

    /**
     * Build a normalised island-pair key for a bridge, independent of direction.
     * Two bridges between the same pair of islands will produce the same key.
     */
    private islandPairKey(bridge: Bridge): string {
        if (!bridge.start || !bridge.end) return '';
        const ax = bridge.start.x, ay = bridge.start.y;
        const bx = bridge.end.x, by = bridge.end.y;
        // Normalise so the lexically smaller endpoint always comes first.
        if (ay < by || (ay === by && ax < bx)) {
            return `${ax},${ay}-${bx},${by}`;
        }
        return `${bx},${by}-${ax},${ay}`;
    }

    /**
     * Return a map from normalised island-pair key to the number of bridges that
     * span that pair.  Only bridges with both start and end positions are counted.
     */
    private countBridgesPerIslandPair(bridges: Bridge[]): Map<string, number> {
        const counts = new Map<string, number>();
        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) continue;
            const key = this.islandPairKey(bridge);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return counts;
    }

    /**
     * Return the collision type to assign to a baked bridge tile.
     *
     * - Island endpoint tiles (the first and last tile of a bridge) always receive
     *   full WALKABLE collision regardless of bridge multiplicity.
     * - Body tiles of a bridge with multiple spans between the same island pair
     *   also receive full WALKABLE collision.
     * - Body tiles of a single-span bridge receive NARROW_NS (vertical) or
     *   NARROW_EW (horizontal), so the player can only walk along the bridge axis.
     */
    private getBakedTileCollisionType(
        tileX: number,
        tileY: number,
        _connections: TileConnections,
        puzzleBounds: Phaser.Geom.Rectangle,
        bridges: Bridge[],
        bridgeCountPerPair: Map<string, number>
    ): CollisionType {
        const tileWidth = this.tiledMapData.tilewidth as number;
        const tileHeight = this.tiledMapData.tileheight as number;

        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) continue;

            const isHorizontal = bridge.start.y === bridge.end.y;
            const startX = Math.min(bridge.start.x, bridge.end.x);
            const endX = Math.max(bridge.start.x, bridge.end.x);
            const startY = Math.min(bridge.start.y, bridge.end.y);
            const endY = Math.max(bridge.start.y, bridge.end.y);

            // Compute the world tile X/Y for the start and end of this bridge.
            let bridgeTileStartX: number, bridgeTileStartY: number;
            let bridgeTileEndX: number, bridgeTileEndY: number;
            if (isHorizontal) {
                bridgeTileStartX = Math.floor((puzzleBounds.x + startX * 32) / tileWidth);
                bridgeTileEndX = Math.floor((puzzleBounds.x + endX * 32) / tileWidth);
                bridgeTileStartY = bridgeTileEndY = Math.floor((puzzleBounds.y + startY * 32) / tileHeight);
            } else {
                bridgeTileStartY = Math.floor((puzzleBounds.y + startY * 32) / tileHeight);
                bridgeTileEndY = Math.floor((puzzleBounds.y + endY * 32) / tileHeight);
                bridgeTileStartX = bridgeTileEndX = Math.floor((puzzleBounds.x + startX * 32) / tileWidth);
            }

            // Check whether this tile belongs to the current bridge's span.
            const onBridge = isHorizontal
                ? (tileY === bridgeTileStartY && tileX >= bridgeTileStartX && tileX <= bridgeTileEndX)
                : (tileX === bridgeTileStartX && tileY >= bridgeTileStartY && tileY <= bridgeTileEndY);

            if (!onBridge) continue;

            // Island endpoint tiles always get full walkability.
            const isEndpoint = isHorizontal
                ? (tileX === bridgeTileStartX || tileX === bridgeTileEndX)
                : (tileY === bridgeTileStartY || tileY === bridgeTileEndY);

            if (isEndpoint) return CollisionType.WALKABLE;

            // Body tile: narrow passage for single-span bridges, walkable for multi-span.
            const pairKey = this.islandPairKey(bridge);
            const pairCount = bridgeCountPerPair.get(pairKey) ?? 1;
            if (pairCount > 1) return CollisionType.WALKABLE;
            return isHorizontal ? CollisionType.NARROW_EW : CollisionType.NARROW_NS;
        }

        // Tile not matched to any specific bridge (e.g. junction) — use full walkable.
        return CollisionType.WALKABLE;
    }

    /**
     * Determine the appropriate tile index based on which directions have connections
     */
    private getTileIndexForConnections(connections: TileConnections): number {
        const { north, east, south, west } = connections;
        const count = [north, east, south, west].filter(Boolean).length;

        // Four-way junction
        if (count === 4) {
            return BridgeSpriteFrames.BRIDGE_JUNCTION_N_E_W_S;
        }

        // Three-way junctions
        if (count === 3) {
            if (!north) return BridgeSpriteFrames.BRIDGE_JUNCTION_E_W_S;
            if (!east) return BridgeSpriteFrames.BRIDGE_JUNCTION_N_W_S;
            if (!south) return BridgeSpriteFrames.BRIDGE_JUNCTION_E_W_N;
            if (!west) return BridgeSpriteFrames.BRIDGE_JUNCTION_N_E_S;
        }

        // Corner (two perpendicular connections)
        if (count === 2) {
            if (north && east) return BridgeSpriteFrames.BRIDGE_CORNER_N_E;
            if (north && west) return BridgeSpriteFrames.BRIDGE_CORNER_N_W;
            if (south && east) return BridgeSpriteFrames.BRIDGE_CORNER_E_S;
            if (south && west) return BridgeSpriteFrames.BRIDGE_CORNER_W_S;

            // Straight bridge segment (two opposite connections)
            if (north && south) return BridgeSpriteFrames.V_BRIDGE_MIDDLE;
            if (east && west) return BridgeSpriteFrames.H_BRIDGE_CENTRE;
        }

        // Single connection (endpoint)
        if (count === 1) {
            // For vertical bridges: if north connection, this is the bottom end; if south connection, this is the top end
            if (north) return BridgeSpriteFrames.V_BRIDGE_BOTTOM;
            if (south) return BridgeSpriteFrames.V_BRIDGE_TOP;
            if (east) return BridgeSpriteFrames.H_BRIDGE_LEFT;
            if (west) return BridgeSpriteFrames.H_BRIDGE_RIGHT;
        }

        // No connections (shouldn't happen, but default to single tile)
        return BridgeSpriteFrames.H_BRIDGE_SINGLE;
    }

    /**
     * Remove exactly the tiles that were baked for this puzzle and reset their collision.
     * Called when re-entering a previously-solved puzzle so no baked tiles linger
     * underneath the dynamic puzzle renderer.
     */
    clearBakedTiles(puzzleId: string): void {
        const positions = this.bakedTilePositions.get(puzzleId);
        if (!positions || positions.length === 0) {
            console.log(`OverworldBridgeManager: No baked tile positions recorded for puzzle ${puzzleId}`);
            return;
        }

        console.log(`OverworldBridgeManager: Clearing ${positions.length} baked tiles for puzzle ${puzzleId}`);

        for (const { tileX, tileY } of positions) {
            this.bridgesLayer.removeTileAt(tileX, tileY);
        }

        this.bakedTilePositions.delete(puzzleId);
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

        // Remove any bridge tiles from the visual layer.
        // Collision restoration is handled separately by CollisionManager (restoreOriginalCollision
        // and applyFlowWaterCollision) so that the puzzle entry/exit snapshot mechanism stays
        // consistent and flow-tile walkability is correctly managed.
        for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
            for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
                this.bridgesLayer.removeTileAt(tileX, tileY);
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
     * Get the bridges layer name constant
     */
    static getBridgesLayerName(): string {
        return OverworldBridgeManager.BRIDGES_LAYER_NAME;
    }
}
