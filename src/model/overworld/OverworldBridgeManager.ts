import Phaser from 'phaser';
import type { Bridge } from '@model/puzzle/Bridge';
import type { OverworldGameState } from './OverworldGameState';
import { BridgeSpriteFrames } from '@view/BridgeSpriteFrameRegistry';
import { CollisionType } from './CollisionManager';

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
     * Each bridge is rendered tile-by-tile using the same start/middle/end/single
     * frame logic as the overworld puzzle view, so the baked appearance exactly
     * matches what the player saw while solving the puzzle.  Double-bridge frames
     * (DOUBLE_BRIDGE_OFFSET) are used when two bridges share the same island pair.
     *
     * Single bridges (only one bridge between a pair of islands) receive narrow-passage
     * collision on their body tiles (the squares strictly between the two island endpoints):
     * - Vertical single bridges → NARROW_NS (passable north/south only)
     * - Horizontal single bridges → NARROW_EW (passable east/west only)
     * When multiple bridges span the same island pair every tile (including body tiles) is
     * given full WALKABLE collision.
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
        // double-bridge frames and full WALKABLE or narrow-passage collision on body tiles.
        const bridgeCountPerPair = this.countBridgesPerIslandPair(bridges);
        const tileCollisionMap = this.buildTileCollisionMap(bridges, puzzleBounds, bridgeCountPerPair);

        const tileWidth = this.tiledMapData.tilewidth as number;
        const tileHeight = this.tiledMapData.tileheight as number;

        // Ensure the position-tracking array exists for this puzzle.
        if (!this.bakedTilePositions.has(puzzleId)) {
            this.bakedTilePositions.set(puzzleId, []);
        }
        const bakedPositions = this.bakedTilePositions.get(puzzleId)!;

        let tilesPlaced = 0;

        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) {
                console.warn(`OverworldBridgeManager: Bridge ${bridge.id} missing start or end`);
                continue;
            }

            const isHorizontal = bridge.start.y === bridge.end.y;
            const pairKey = this.islandPairKey(bridge);
            const isDouble = (bridgeCountPerPair.get(pairKey) ?? 1) > 1;

            if (isHorizontal) {
                const gridY = bridge.start.y;
                const startX = Math.min(bridge.start.x, bridge.end.x);
                const endX = Math.max(bridge.start.x, bridge.end.x);
                const segCount = endX - startX + 1;
                const tileY = Math.floor((puzzleBounds.y + gridY * tileHeight) / tileHeight);

                for (let gridX = startX; gridX <= endX; gridX++) {
                    const i = gridX - startX;
                    const tileX = Math.floor((puzzleBounds.x + gridX * tileWidth) / tileWidth);

                    let baseFrame: number;
                    if (segCount === 1) {
                        baseFrame = BridgeSpriteFrames.H_BRIDGE_SINGLE;
                    } else if (i === 0) {
                        baseFrame = BridgeSpriteFrames.H_BRIDGE_LEFT;
                    } else if (i === segCount - 1) {
                        baseFrame = BridgeSpriteFrames.H_BRIDGE_RIGHT;
                    } else {
                        baseFrame = BridgeSpriteFrames.H_BRIDGE_CENTRE;
                    }
                    const tileIndex = isDouble ? baseFrame + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET : baseFrame;
                    const gid = this.bridgeTilesetFirstGid + tileIndex;

                    const tile = this.bridgesLayer.putTileAt(gid, tileX, tileY);
                    if (tile) {
                        tilesPlaced++;
                        bakedPositions.push({ tileX, tileY });
                    }

                    const tileKey = `${tileX},${tileY}`;
                    const collisionType = tileCollisionMap.get(tileKey) ?? CollisionType.WALKABLE;
                    this.collisionManager.setCollisionAt(tileX, tileY, collisionType);
                }
            } else {
                const gridX = bridge.start.x;
                const startY = Math.min(bridge.start.y, bridge.end.y);
                const endY = Math.max(bridge.start.y, bridge.end.y);
                const segCount = endY - startY + 1;
                const tileX = Math.floor((puzzleBounds.x + gridX * tileWidth) / tileWidth);

                for (let gridY = startY; gridY <= endY; gridY++) {
                    const i = gridY - startY;
                    const tileY = Math.floor((puzzleBounds.y + gridY * tileHeight) / tileHeight);

                    let baseFrame: number;
                    if (segCount === 1) {
                        baseFrame = BridgeSpriteFrames.V_BRIDGE_SINGLE;
                    } else if (i === 0) {
                        baseFrame = BridgeSpriteFrames.V_BRIDGE_TOP;
                    } else if (i === segCount - 1) {
                        baseFrame = BridgeSpriteFrames.V_BRIDGE_BOTTOM;
                    } else {
                        baseFrame = BridgeSpriteFrames.V_BRIDGE_MIDDLE;
                    }
                    const tileIndex = isDouble ? baseFrame + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET : baseFrame;
                    const gid = this.bridgeTilesetFirstGid + tileIndex;

                    const tile = this.bridgesLayer.putTileAt(gid, tileX, tileY);
                    if (tile) {
                        tilesPlaced++;
                        bakedPositions.push({ tileX, tileY });
                    }

                    const tileKey = `${tileX},${tileY}`;
                    const collisionType = tileCollisionMap.get(tileKey) ?? CollisionType.WALKABLE;
                    this.collisionManager.setCollisionAt(tileX, tileY, collisionType);
                }
            }
        }

        console.log(`OverworldBridgeManager: Baked ${bridges.length} bridges (${tilesPlaced} tiles placed) for puzzle ${puzzleId}`);
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
     * Build a map from tile key ("tileX,tileY") to CollisionType for every tile
     * covered by the given bridges.
     *
     * The entire map is constructed in a single pass over bridges (O(bridges × span)),
     * rather than per-tile queries over all bridges.
     *
     * Rules, in priority order:
     * - Island endpoint tiles → WALKABLE (always)
     * - Body tiles of a multi-span bridge → WALKABLE
     * - Body tiles of a single-span bridge → NARROW_NS (vertical) or NARROW_EW (horizontal)
     * - WALKABLE is never downgraded: once a tile is set to WALKABLE by any bridge, later
     *   bridges cannot make it narrow (e.g. a junction tile touched by two perpendicular
     *   single-span bridges stays WALKABLE).
     */
    private buildTileCollisionMap(
        bridges: Bridge[],
        puzzleBounds: Phaser.Geom.Rectangle,
        bridgeCountPerPair: Map<string, number>
    ): Map<string, CollisionType> {
        const tileWidth = this.tiledMapData.tilewidth as number;
        const tileHeight = this.tiledMapData.tileheight as number;
        const collisionMap = new Map<string, CollisionType>();

        const setCollision = (key: string, type: CollisionType): void => {
            // WALKABLE wins — never downgrade a tile that is already fully walkable.
            if (collisionMap.get(key) === CollisionType.WALKABLE) return;
            collisionMap.set(key, type);
        };

        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) continue;

            const isHorizontal = bridge.start.y === bridge.end.y;
            const startX = Math.min(bridge.start.x, bridge.end.x);
            const endX = Math.max(bridge.start.x, bridge.end.x);
            const startY = Math.min(bridge.start.y, bridge.end.y);
            const endY = Math.max(bridge.start.y, bridge.end.y);

            const pairKey = this.islandPairKey(bridge);
            const isMultiSpan = (bridgeCountPerPair.get(pairKey) ?? 1) > 1;
            const narrowType = isHorizontal ? CollisionType.NARROW_EW : CollisionType.NARROW_NS;

            if (isHorizontal) {
                const tileY = Math.floor((puzzleBounds.y + startY * tileHeight) / tileHeight);
                for (let gridX = startX; gridX <= endX; gridX++) {
                    const tileX = Math.floor((puzzleBounds.x + gridX * tileWidth) / tileWidth);
                    const key = `${tileX},${tileY}`;
                    const isEndpoint = (gridX === startX || gridX === endX);
                    setCollision(key, isEndpoint || isMultiSpan ? CollisionType.WALKABLE : narrowType);
                }
            } else {
                const tileX = Math.floor((puzzleBounds.x + startX * tileWidth) / tileWidth);
                for (let gridY = startY; gridY <= endY; gridY++) {
                    const tileY = Math.floor((puzzleBounds.y + gridY * tileHeight) / tileHeight);
                    const key = `${tileX},${tileY}`;
                    const isEndpoint = (gridY === startY || gridY === endY);
                    setCollision(key, isEndpoint || isMultiSpan ? CollisionType.WALKABLE : narrowType);
                }
            }
        }

        return collisionMap;
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
