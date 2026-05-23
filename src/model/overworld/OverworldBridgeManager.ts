import Phaser from 'phaser';
import type { Bridge } from '@model/puzzle/Bridge';
import type { OverworldGameState } from './OverworldGameState';
import { BridgeSpriteFrames } from '@view/BridgeSpriteFrameRegistry';
import { buildBridgeStripLayout } from '@view/BridgeStripLayout';
import { CollisionType } from './CollisionManager';

type EndpointDirection = 'up' | 'left' | 'right' | 'down';
type EndpointLevel = 0 | 1 | 2;
type EndpointCombination = Record<EndpointDirection, EndpointLevel>;

/**
 * Manages rendering of completed puzzle bridges to the overworld tilemap.
 * Handles baking bridges to the bridges layer and updating collision.
 */
export class OverworldBridgeManager {
    private static readonly BRIDGES_LAYER_NAME = 'bridges';
    private static readonly BRIDGE_TEXTURE_KEY = 'sprout-tiles';
    private static readonly BRIDGE_DEPTH_SORT_SCALE = 0.0001;
    private static readonly ENDPOINT_COMPOSITE_TEXTURE_PREFIX = 'bridge-endpoint-composite';
    private static readonly ENDPOINT_LAYER_ORDER: ReadonlyArray<EndpointDirection> = ['up', 'left', 'right', 'down'];
    private static readonly BRIDGE_TILESET_IMAGE = 'SproutLandsGrassIslands.png';

    private bridgeTilesetFirstGid: number = 0;

    // Baked tile states keyed by puzzleId, then tile key.
    // Used to reliably clear exactly the baked tiles on puzzle re-entry and
    // restore the collision that existed before baking.
    private bakedTiles: Map<string, Map<string, {
        tileX: number;
        tileY: number;
        originalCollisionType: CollisionType;
    }>> = new Map();
    // Endpoint overlay sprites created for each baked puzzle, keyed by puzzleId.
    private bakedEndpointSprites: Map<string, Phaser.GameObjects.Image[]> = new Map();
    // Cached flattened bridge images keyed by puzzleId.
    private bakedBridgeSprites: Map<string, Phaser.GameObjects.Image[]> = new Map();
    // Cache from bridge visual key to generated texture key.
    private bakedBridgeTextureCache: Map<string, string> = new Map();

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
            console.error(`OverworldBridgeManager: Could not find bridge tileset image ${OverworldBridgeManager.BRIDGE_TILESET_IMAGE}`);
        }
    }

    /**
     * Find the firstgid of the bridge tileset by searching for the SproutLands bridge tileset image filename.
     */
    private findBridgeTilesetFirstGid(): number {
        // Search through all tilesets in the tiledMapData
        if (!this.tiledMapData?.tilesets) {
            console.warn('OverworldBridgeManager: No tilesets found in tiledMapData');
            return 0;
        }

        for (const tilesetData of this.tiledMapData.tilesets) {
            if (tilesetData.image?.endsWith(OverworldBridgeManager.BRIDGE_TILESET_IMAGE)) {
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
        const useSpritePrototype = this.hasBakedSpriteStripSupport();

        // Ensure the baked tile-tracking map exists for this puzzle.
        if (!this.bakedTiles.has(puzzleId)) {
            this.bakedTiles.set(puzzleId, new Map());
        }
        this.destroyBridgeSprites(puzzleId);
        this.destroyEndpointSprites(puzzleId);

        if (useSpritePrototype) {
            this.createBridgeStripSprites(puzzleId, puzzleBounds, bridges);
        }

        const endpointCombinations = this.buildEndpointCombinationMap(bridges, puzzleBounds, bridgeCountPerPair);
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
                    const currentCollisionType = this.rememberBakedTileCollision(puzzleId, tileX, tileY);

                    if (!useSpritePrototype) {
                        const gid = this.bridgeTilesetFirstGid + tileIndex;
                        const tile = this.bridgesLayer.putTileAt(gid, tileX, tileY);
                        if (tile) {
                            tilesPlaced++;
                        }
                    }

                    const tileKey = `${tileX},${tileY}`;
                    const collisionType = tileCollisionMap.get(tileKey) ?? CollisionType.WALKABLE;
                    if (currentCollisionType !== CollisionType.ALWAYS_HIGH) {
                        this.collisionManager.setCollisionAt(tileX, tileY, collisionType);
                    }
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
                    const currentCollisionType = this.rememberBakedTileCollision(puzzleId, tileX, tileY);

                    if (!useSpritePrototype) {
                        const gid = this.bridgeTilesetFirstGid + tileIndex;
                        const tile = this.bridgesLayer.putTileAt(gid, tileX, tileY);
                        if (tile) {
                            tilesPlaced++;
                        }
                    }

                    const tileKey = `${tileX},${tileY}`;
                    const collisionType = tileCollisionMap.get(tileKey) ?? CollisionType.WALKABLE;
                    if (currentCollisionType !== CollisionType.ALWAYS_HIGH) {
                        this.collisionManager.setCollisionAt(tileX, tileY, collisionType);
                    }
                }
            }
        }

        if (!useSpritePrototype) {
            this.createEndpointCompositeSprites(puzzleId, endpointCombinations);
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

    private rememberBakedTileCollision(puzzleId: string, tileX: number, tileY: number): CollisionType {
        let bakedTilesForPuzzle = this.bakedTiles.get(puzzleId);
        if (!bakedTilesForPuzzle) {
            bakedTilesForPuzzle = new Map();
            this.bakedTiles.set(puzzleId, bakedTilesForPuzzle);
        }

        const tileKey = `${tileX},${tileY}`;
        const existingState = bakedTilesForPuzzle.get(tileKey);
        if (existingState) {
            return existingState.originalCollisionType;
        }

        const originalCollisionType = this.collisionManager.getCollisionAt(tileX, tileY);
        bakedTilesForPuzzle.set(tileKey, {
            tileX,
            tileY,
            originalCollisionType,
        });
        return originalCollisionType;
    }

    /**
     * Remove exactly the tiles that were baked for this puzzle and reset their collision.
     * Called when re-entering a previously-solved puzzle so no baked tiles linger
     * underneath the dynamic puzzle renderer.
     */
    clearBakedTiles(puzzleId: string): void {
        const bakedTilesForPuzzle = this.bakedTiles.get(puzzleId);
        if (!bakedTilesForPuzzle || bakedTilesForPuzzle.size === 0) {
            console.log(`OverworldBridgeManager: No baked tile positions recorded for puzzle ${puzzleId}`);
            this.destroyBridgeSprites(puzzleId);
            this.destroyEndpointSprites(puzzleId);
            return;
        }

        console.log(`OverworldBridgeManager: Clearing ${bakedTilesForPuzzle.size} baked tiles for puzzle ${puzzleId}`);

        for (const { tileX, tileY, originalCollisionType } of bakedTilesForPuzzle.values()) {
            this.bridgesLayer.removeTileAt(tileX, tileY);
            this.collisionManager.setCollisionAt(tileX, tileY, originalCollisionType);
        }

        this.bakedTiles.delete(puzzleId);
        this.destroyBridgeSprites(puzzleId);
        this.destroyEndpointSprites(puzzleId);
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

        this.destroyBridgeSprites(puzzleId);
        this.destroyEndpointSprites(puzzleId);

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

    private createBridgeStripSprites(
        puzzleId: string,
        puzzleBounds: Phaser.Geom.Rectangle,
        bridges: Bridge[]
    ): void {
        const scene = this.bridgesLayer.scene;
        if (!scene?.add) {
            return;
        }

        const tileWidth = this.tiledMapData.tilewidth as number;
        const tileHeight = this.tiledMapData.tileheight as number;
        const sprites: Phaser.GameObjects.Image[] = [];
        const bridgeGroups = this.groupBridgesForRendering(bridges);

        for (const bridgeGroup of bridgeGroups.values()) {
            const layout = buildBridgeStripLayout({
                start: bridgeGroup.start,
                end: bridgeGroup.end,
                cellSize: tileWidth,
                isDouble: bridgeGroup.bridges.length >= 2,
                useEdges: true,
                gridToWorld: (gridX: number, gridY: number) => ({
                    x: puzzleBounds.x + gridX * tileWidth,
                    y: puzzleBounds.y + gridY * tileHeight,
                }),
            });
            const textureKey = this.getOrCreateBridgeStripTexture(bridgeGroup.typeKey, layout, tileWidth);
            if (!textureKey) {
                continue;
            }

            const sprite = scene.add.image(layout.centreX, layout.centreY, textureKey);
            sprite.setDepth(this.bridgesLayer.depth + layout.depthY * OverworldBridgeManager.BRIDGE_DEPTH_SORT_SCALE);
            sprites.push(sprite);
        }

        this.bakedBridgeSprites.set(puzzleId, sprites);
    }

    private groupBridgesForRendering(bridges: Bridge[]): Map<string, { key: string; typeKey: string; start: { x: number; y: number }; end: { x: number; y: number }; bridges: Bridge[] }> {
        const groups = new Map<string, { key: string; typeKey: string; start: { x: number; y: number }; end: { x: number; y: number }; bridges: Bridge[] }>();

        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) continue;
            const ordered = this.normaliseBridgeEndpoints(bridge.start, bridge.end);
            const key = `${ordered.start.x},${ordered.start.y}:${ordered.end.x},${ordered.end.y}`;
            const existing = groups.get(key);
            if (existing) {
                existing.bridges.push(bridge);
            } else {
                groups.set(key, {
                    key,
                    typeKey: this.bridgeTypeKey(bridge),
                    start: ordered.start,
                    end: ordered.end,
                    bridges: [bridge],
                });
            }
        }

        return groups;
    }

    private normaliseBridgeEndpoints(
        start: { x: number; y: number },
        end: { x: number; y: number }
    ): { start: { x: number; y: number }; end: { x: number; y: number } } {
        const isHorizontal = start.y === end.y;
        if (isHorizontal) {
            if (start.x <= end.x) {
                return { start, end };
            }
            return { start: end, end: start };
        }

        if (start.y >= end.y) {
            return { start, end };
        }
        return { start: end, end: start };
    }

    private bridgeTypeKey(bridge: Bridge): string {
        return bridge.type.id;
    }

    private bridgeStripCacheKey(typeKey: string, layout: ReturnType<typeof buildBridgeStripLayout>, cellSize: number): string {
        return [
            typeKey,
            layout.orientation,
            `segments=${layout.segmentCount}`,
            `double=${layout.isDouble ? 1 : 0}`,
            `cell=${cellSize}`,
        ].join('|');
    }

    private getOrCreateBridgeStripTexture(
        typeKey: string,
        layout: ReturnType<typeof buildBridgeStripLayout>,
        cellSize: number
    ): string | null {
        const scene = this.bridgesLayer.scene;
        if (!scene?.textures) {
            return null;
        }

        const cacheKey = this.bridgeStripCacheKey(typeKey, layout, cellSize);
        const existingTextureKey = this.bakedBridgeTextureCache.get(cacheKey);
        if (existingTextureKey && scene.textures.exists(existingTextureKey)) {
            return existingTextureKey;
        }

        const textureKey = `bridge-strip-${this.encodeCacheKey(cacheKey)}`;
        if (scene.textures.exists(textureKey)) {
            this.bakedBridgeTextureCache.set(cacheKey, textureKey);
            return textureKey;
        }

        const canvasTexture = scene.textures.createCanvas(textureKey, layout.width, layout.height);
        if (!canvasTexture) {
            return null;
        }

        const sourceTexture = scene.textures.get(OverworldBridgeManager.BRIDGE_TEXTURE_KEY);
        const context = canvasTexture.context;
        context.clearRect(0, 0, layout.width, layout.height);

        for (const segment of layout.segments) {
            const frame = sourceTexture.get(segment.frame);
            if (!frame?.source?.image) continue;

            const rotatedX = segment.x * Math.cos(layout.angle) - segment.y * Math.sin(layout.angle);
            const rotatedY = segment.x * Math.sin(layout.angle) + segment.y * Math.cos(layout.angle);
            const drawX = layout.width / 2 + rotatedX - cellSize / 2;
            const drawY = layout.height / 2 + rotatedY - cellSize / 2;

            if (segment.rotation !== 0) {
                context.save();
                context.translate(drawX + cellSize / 2, drawY + cellSize / 2);
                context.rotate(layout.angle + segment.rotation);
                context.drawImage(
                    frame.source.image as CanvasImageSource,
                    frame.cutX,
                    frame.cutY,
                    frame.cutWidth,
                    frame.cutHeight,
                    -cellSize / 2,
                    -cellSize / 2,
                    cellSize,
                    cellSize
                );
                context.restore();
                continue;
            }

            context.drawImage(
                frame.source.image as CanvasImageSource,
                frame.cutX,
                frame.cutY,
                frame.cutWidth,
                frame.cutHeight,
                drawX,
                drawY,
                cellSize,
                cellSize
            );
        }

        canvasTexture.refresh();
        this.bakedBridgeTextureCache.set(cacheKey, textureKey);
        return textureKey;
    }

    private encodeCacheKey(cacheKey: string): string {
        return cacheKey.replace(/[^a-zA-Z0-9]+/g, '-');
    }

    private buildEndpointCombinationMap(
        bridges: Bridge[],
        puzzleBounds: Phaser.Geom.Rectangle,
        bridgeCountPerPair: Map<string, number>
    ): Map<string, EndpointCombination> {
        const tileWidth = this.tiledMapData.tilewidth as number;
        const tileHeight = this.tiledMapData.tileheight as number;
        const endpoints = new Map<string, EndpointCombination>();

        const recordEndpoint = (tileX: number, tileY: number, direction: EndpointDirection, endpointLevel: EndpointLevel): void => {
            const key = `${tileX},${tileY}`;
            let combo = endpoints.get(key);
            if (!combo) {
                combo = { up: 0, left: 0, right: 0, down: 0 };
                endpoints.set(key, combo);
            }
            combo[direction] = Math.max(combo[direction], endpointLevel) as EndpointLevel;
        };

        for (const bridge of bridges) {
            if (!bridge.start || !bridge.end) continue;

            const pairKey = this.islandPairKey(bridge);
            const level: EndpointLevel = (bridgeCountPerPair.get(pairKey) ?? 1) > 1 ? 2 : 1;

            const startTileX = Math.floor((puzzleBounds.x + bridge.start.x * tileWidth) / tileWidth);
            const startTileY = Math.floor((puzzleBounds.y + bridge.start.y * tileHeight) / tileHeight);
            const endTileX = Math.floor((puzzleBounds.x + bridge.end.x * tileWidth) / tileWidth);
            const endTileY = Math.floor((puzzleBounds.y + bridge.end.y * tileHeight) / tileHeight);

            const isHorizontal = bridge.start.y === bridge.end.y;
            if (isHorizontal) {
                if (bridge.start.x <= bridge.end.x) {
                    recordEndpoint(startTileX, startTileY, 'right', level);
                    recordEndpoint(endTileX, endTileY, 'left', level);
                } else {
                    recordEndpoint(startTileX, startTileY, 'left', level);
                    recordEndpoint(endTileX, endTileY, 'right', level);
                }
            } else {
                if (bridge.start.y <= bridge.end.y) {
                    recordEndpoint(startTileX, startTileY, 'down', level);
                    recordEndpoint(endTileX, endTileY, 'up', level);
                } else {
                    recordEndpoint(startTileX, startTileY, 'up', level);
                    recordEndpoint(endTileX, endTileY, 'down', level);
                }
            }
        }

        return endpoints;
    }

    private createEndpointCompositeSprites(puzzleId: string, endpointCombinations: Map<string, EndpointCombination>): void {
        const scene = this.bridgesLayer.scene;
        if (!scene || !scene.add || !this.hasEndpointCompositeSupport()) {
            return;
        }

        const tileWidth = this.tiledMapData.tilewidth as number;
        const tileHeight = this.tiledMapData.tileheight as number;
        const sprites: Phaser.GameObjects.Image[] = [];

        for (const [tileKey, combination] of endpointCombinations.entries()) {
            const textureKey = this.getOrCreateEndpointCompositeTexture(combination);
            if (!textureKey) continue;

            const [tileXStr, tileYStr] = tileKey.split(',');
            const tileX = Number(tileXStr);
            const tileY = Number(tileYStr);
            const worldX = tileX * tileWidth + (tileWidth / 2);
            const worldY = tileY * tileHeight + (tileHeight / 2);

            const sprite = scene.add.image(worldX, worldY, textureKey);
            sprite.setDepth(this.bridgesLayer.depth);
            sprites.push(sprite);
        }

        this.bakedEndpointSprites.set(puzzleId, sprites);
    }

    private getOrCreateEndpointCompositeTexture(combination: EndpointCombination): string | null {
        const scene = this.bridgesLayer.scene;
        if (!scene || !this.hasEndpointCompositeSupport()) {
            return null;
        }

        const encoded = this.encodeEndpointCombination(combination);
        const textureKey = `${OverworldBridgeManager.ENDPOINT_COMPOSITE_TEXTURE_PREFIX}-${encoded}`;
        if (scene.textures.exists(textureKey)) {
            return textureKey;
        }

        const tileWidth = this.tiledMapData.tilewidth as number;
        const tileHeight = this.tiledMapData.tileheight as number;
        const canvasTexture = scene.textures.createCanvas(textureKey, tileWidth, tileHeight);
        if (!canvasTexture) {
            return null;
        }

        const sourceTexture = scene.textures.get('sprout-tiles');
        const context = canvasTexture.context;
        context.clearRect(0, 0, tileWidth, tileHeight);

        for (const direction of OverworldBridgeManager.ENDPOINT_LAYER_ORDER) {
            const level = combination[direction];
            if (level === 0) continue;

            const frameIndex = this.endpointFrameForDirection(direction, level);
            const frame = sourceTexture.get(frameIndex);
            if (!frame?.source?.image) continue;

            context.drawImage(
                frame.source.image as CanvasImageSource,
                frame.cutX,
                frame.cutY,
                frame.cutWidth,
                frame.cutHeight,
                0,
                0,
                tileWidth,
                tileHeight
            );
        }

        canvasTexture.refresh();
        return textureKey;
    }

    private endpointFrameForDirection(direction: EndpointDirection, level: EndpointLevel): number {
        let frame: number;
        switch (direction) {
            case 'up':
                frame = BridgeSpriteFrames.V_BRIDGE_BOTTOM;
                break;
            case 'left':
                frame = BridgeSpriteFrames.H_BRIDGE_RIGHT;
                break;
            case 'right':
                frame = BridgeSpriteFrames.H_BRIDGE_LEFT;
                break;
            case 'down':
                frame = BridgeSpriteFrames.V_BRIDGE_TOP;
                break;
            default:
                throw new Error(`Unsupported endpoint direction: ${String(direction)}`);
        }
        return level === 2 ? frame + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET : frame;
    }

    private destroyEndpointSprites(puzzleId: string): void {
        const sprites = this.bakedEndpointSprites.get(puzzleId);
        if (!sprites || sprites.length === 0) return;
        for (const sprite of sprites) {
            if (sprite) {
                sprite.destroy();
            }
        }
        this.bakedEndpointSprites.delete(puzzleId);
    }

    private destroyBridgeSprites(puzzleId: string): void {
        const sprites = this.bakedBridgeSprites.get(puzzleId);
        if (!sprites || sprites.length === 0) return;
        for (const sprite of sprites) {
            if (sprite) {
                sprite.destroy();
            }
        }
        this.bakedBridgeSprites.delete(puzzleId);
    }

    private hasEndpointCompositeSupport(): boolean {
        const scene = this.bridgesLayer.scene;
        return !!scene?.textures?.exists(OverworldBridgeManager.BRIDGE_TEXTURE_KEY);
    }

    private hasBakedSpriteStripSupport(): boolean {
        const scene = this.bridgesLayer.scene;
        return !!scene?.add && !!scene?.textures?.exists(OverworldBridgeManager.BRIDGE_TEXTURE_KEY);
    }

    private encodeEndpointCombination(combination: EndpointCombination): string {
        return `u${combination.up}l${combination.left}r${combination.right}d${combination.down}`;
    }
}
