import { CollisionTileClassifier, type CollisionTileData } from './CollisionTileClassifier';
import { CollisionType } from './CollisionTypes';
import { TiledLayerUtils } from './TiledLayerUtils';

/**
 * Data for a single pontoon tile in the overworld.
 * Exported so that FlowWaterVisualManager (view layer) can own and
 * manipulate the runtime registry.
 */
export interface PontoonTileData {
    tileX: number;
    tileY: number;
    /** Current GID on the pontoons Tiled layer. */
    currentGID: number;
    /** Layer name the tile lives on (e.g. "Forest/pontoons"). */
    layerName: string;
    /** Whether the current tile variant is the high-water (raised) version. */
    isHigh: boolean;
    /** Signed offset to add to currentGID to produce the alternate variant. */
    toggleOffset: number;
}

/** All data produced by a single call to {@link CollisionInitialiser.buildCollisionData}. */
export interface CollisionInitData {
    /** 2-D array [y][x] of CollisionType values. */
    collisionArray: number[][];
    /**
     * Tiles that are permanently BLOCKED by Tiled collision-layer properties.
     * Water propagation must never change these tiles.
     */
    permanentBlockedTiles: Set<string>;
    /** Registry of pontoon tiles, keyed by "tileX,tileY". */
    pontoonTiles: Map<string, PontoonTileData>;
}

/**
 * Pure, stateless helper that builds all collision-related data structures from
 * Tiled map data at scene load time.
 *
 * Responsibilities:
 * - Scanning `ground` / `lowground` visual layers for stairs / lowground tiles
 *   (these carry properties that the dedicated collision layer may not cover)
 * - Scanning `pontoons` layers to register pontoon tiles
 * - Building the 2-D `collisionArray` by combining Phaser collision-layer data
 *   (supplied via a callback) with the visual-layer properties above
 * - Recording the set of tiles that are permanently BLOCKED
 *
 * All Phaser-layer access is abstracted through the `getCollisionLayerTiles`
 * callback so that the core logic is unit-testable without a Phaser environment.
 *
 * No state is held between calls — construct once, call
 * {@link CollisionInitialiser.buildCollisionData} and discard.
 */
export class CollisionInitialiser {
    /**
     * Build all collision data from a Tiled map.
     *
     * @param tiledMapData - Raw Tiled JSON map object.
     * @param mapWidth - Width of the map in tiles.
     * @param mapHeight - Height of the map in tiles.
     * @param getCollisionLayerTiles - Callback that returns, for each (x, y)
     *     position, an array of `CollisionTileData | null` entries — one per
     *     collision layer.  The OverworldScene provides this by calling
     *     `collisionLayer.getTileAt(x, y)` for each layer.
     */
    static buildCollisionData(
        tiledMapData: any,
        mapWidth: number,
        mapHeight: number,
        getCollisionLayerTiles: (x: number, y: number) => Array<CollisionTileData | null>
    ): CollisionInitData {
        const tilesets = tiledMapData?.tilesets ?? [];

        // ── 1. Scan visual layers for stairs / lowground properties ──────────
        const stairsTiles = new Set<number>();   // flat index = y * mapWidth + x
        const lowgroundTiles = new Set<number>();

        const groundLayers = TiledLayerUtils.findTileLayersByName(tiledMapData?.layers ?? [], 'ground');
        for (const layer of groundLayers) {
            const data: number[] = layer.data.data ?? [];
            for (let i = 0; i < data.length; i++) {
                const props = TiledLayerUtils.getTileProperties(tilesets, data[i]);
                if (props['stairs'] === true) stairsTiles.add(i);
            }
        }

        const lowgroundLayers = TiledLayerUtils.findTileLayersByName(tiledMapData?.layers ?? [], 'lowground');
        for (const layer of lowgroundLayers) {
            const data: number[] = layer.data.data ?? [];
            for (let i = 0; i < data.length; i++) {
                const props = TiledLayerUtils.getTileProperties(tilesets, data[i]);
                if (props['lowground'] === true) lowgroundTiles.add(i);
                if (props['stairs'] === true) stairsTiles.add(i);
            }
        }
        console.log(`Visual layer scan: ${stairsTiles.size} stairs tiles, ${lowgroundTiles.size} lowground tiles`);

        // ── 2. Scan pontoons layers ───────────────────────────────────────────
        const pontoonTiles = new Map<string, PontoonTileData>();
        const pontoonLayers = TiledLayerUtils.findTileLayersByName(tiledMapData?.layers ?? [], 'pontoons');
        for (const layer of pontoonLayers) {
            const data: number[] = layer.data.data ?? [];
            for (let i = 0; i < data.length; i++) {
                const gid = data[i];
                if (!gid) continue;
                const props = TiledLayerUtils.getTileProperties(tilesets, gid);
                if (props['isPontoon'] !== true) continue;

                const tileX = i % mapWidth;
                const tileY = Math.floor(i / mapWidth);
                const key = `${tileX},${tileY}`;
                const isHigh = props['isHigh'] === true;
                const toggleOffset = typeof props['toggleOffset'] === 'number'
                    ? props['toggleOffset'] as number
                    : 0;

                pontoonTiles.set(key, { tileX, tileY, currentGID: gid, layerName: layer.fullPath, isHigh, toggleOffset });
            }
        }
        console.log(`Pontoon scan: ${pontoonTiles.size} pontoon tiles registered`);

        // ── 3. Build collision array ──────────────────────────────────────────
        const collisionArray: number[][] = [];

        for (let y = 0; y < mapHeight; y++) {
            collisionArray[y] = [];
            for (let x = 0; x < mapWidth; x++) {
                const layerTiles = getCollisionLayerTiles(x, y);

                // Inject visual-layer stairs / lowground as synthetic tile entries.
                const flatIdx = y * mapWidth + x;
                if (stairsTiles.has(flatIdx)) {
                    layerTiles.push({ properties: { stairs: true } });
                } else if (lowgroundTiles.has(flatIdx)) {
                    layerTiles.push({ properties: { walkable_low: true } });
                }

                const classification = CollisionTileClassifier.classifyTile(layerTiles);
                collisionArray[y][x] = classification.collisionType;
            }
        }

        console.log(`Collision system initialised: ${mapWidth}x${mapHeight}`);

        // ── 4. Debug counts ───────────────────────────────────────────────────
        let blockedCount = 0, walkableCount = 0, walkableLowCount = 0, stairsCount = 0, alwaysHighCount = 0;
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const t = collisionArray[y][x];
                if (t === CollisionType.BLOCKED) blockedCount++;
                else if (t === CollisionType.WALKABLE) walkableCount++;
                else if (t === CollisionType.WALKABLE_LOW) walkableLowCount++;
                else if (t === CollisionType.STAIRS) stairsCount++;
                else if (t === CollisionType.ALWAYS_HIGH) alwaysHighCount++;
            }
        }
        console.log(`Collision tiles: BLOCKED=${blockedCount}, WALKABLE=${walkableCount}, WALKABLE_LOW=${walkableLowCount}, STAIRS=${stairsCount}, ALWAYS_HIGH=${alwaysHighCount}`);

        // ── 5. Record permanently-blocked tiles ───────────────────────────────
        const permanentBlockedTiles = new Set<string>();
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                if (collisionArray[y][x] === CollisionType.BLOCKED) {
                    permanentBlockedTiles.add(`${x},${y}`);
                }
            }
        }

        // ── 6. Post-pass: override pontoon tiles with correct collision type ──
        for (const { tileX, tileY, isHigh } of pontoonTiles.values()) {
            if (tileY >= 0 && tileY < mapHeight && tileX >= 0 && tileX < mapWidth) {
                collisionArray[tileY][tileX] = isHigh ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
            }
        }

        return { collisionArray, permanentBlockedTiles, pontoonTiles };
    }
}
