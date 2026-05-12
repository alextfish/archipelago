import Phaser from 'phaser';
import type { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import { CollisionType } from '@model/overworld/CollisionTypes';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import type { PontoonTileData } from '@model/overworld/CollisionInitialiser';

/**
 * Manages the visual synchronisation of overworld water tiles and pontoon tiles
 * with the current state of the FlowPuzzle model.
 *
 * Responsibilities:
 * - Caching removed water-tile GIDs so they can be restored if water returns
 * - Updating Tiled layer tiles and collision state when a FlowPuzzle's water
 *   changes (both bulk after puzzle exit and per-tile during puzzle solving)
 * - Toggling pontoon tile graphics and collision between high- and low-water
 *   variants
 *
 * View layer — holds a live reference to a Phaser Tilemap and accepts
 * callbacks for collision access on the scene.
 */
export class FlowWaterVisualManager {
    private readonly map: Phaser.Tilemaps.Tilemap;
    private readonly tiledMapData: any;

    /** Pontoon tile registry populated at map-load time by CollisionInitialiser. */
    readonly pontoonTiles: Map<string, PontoonTileData>;

    /**
     * Cache of GIDs removed from the water Tiled layer to make river tiles look
     * dry. Keyed by `"tileX,tileY"`. The entry is deleted when the GID is
     * restored.
     */
    private readonly waterTileGidCache: Map<string, { gid: number; layerName: string }> = new Map();

    private readonly getCollisionAt: (tileX: number, tileY: number) => CollisionType;
    private readonly setCollisionAt: (tileX: number, tileY: number, type: CollisionType) => void;
    private readonly isPermanentlyBlocked: (tileX: number, tileY: number) => boolean;

    constructor(
        map: Phaser.Tilemaps.Tilemap,
        tiledMapData: any,
        pontoonTiles: Map<string, PontoonTileData>,
        getCollisionAt: (tileX: number, tileY: number) => CollisionType,
        setCollisionAt: (tileX: number, tileY: number, type: CollisionType) => void,
        isPermanentlyBlocked: (tileX: number, tileY: number) => boolean,
    ) {
        this.map = map;
        this.tiledMapData = tiledMapData;
        this.pontoonTiles = pontoonTiles;
        this.getCollisionAt = getCollisionAt;
        this.setCollisionAt = setCollisionAt;
        this.isPermanentlyBlocked = isPermanentlyBlocked;
    }

    /**
     * Update the overworld water-tile visuals for a FlowPuzzle after it is
     * exited.
     *
     * Tiles that no longer have water are visually dried up by removing their
     * tile from the Tiled water layer (GID cached for restoration). Tiles that
     * have water again get their original GID restored.
     */
    updateFlowWaterVisuals(puzzle: FlowPuzzle, puzzleBounds: { x: number; y: number }): void {
        if (!this.tiledMapData) return;

        const tileW: number = this.tiledMapData.tilewidth ?? 32;
        const tileH: number = this.tiledMapData.tileheight ?? 32;
        const originTileX = Math.floor(puzzleBounds.x / tileW);
        const originTileY = Math.floor(puzzleBounds.y / tileH);

        for (let ly = 0; ly < puzzle.height; ly++) {
            for (let lx = 0; lx < puzzle.width; lx++) {
                if (!puzzle.getFlowSquare(lx, ly)) continue;
                this.updateSingleFlowTileVisual(originTileX + lx, originTileY + ly, puzzle.tileHasWater(lx, ly));
            }
        }
    }

    /**
     * Update the visual and collision state for a single flow tile.
     *
     * Used both as a bulk update (after puzzle exit) and as a per-tile callback
     * during puzzle solving.
     *
     * @param tileX    World tile X.
     * @param tileY    World tile Y.
     * @param hasWater Whether this tile currently has water.
     */
    updateSingleFlowTileVisual(tileX: number, tileY: number, hasWater: boolean): void {
        const key = `${tileX},${tileY}`;
        const waterLayerData = this.findLayersBySuffix('water');

        if (hasWater) {
            const cached = this.waterTileGidCache.get(key);
            if (cached) {
                const ld = waterLayerData.find(l => l.name === cached.layerName);
                if (ld?.tilemapLayer) {
                    ld.tilemapLayer.putTileAt(cached.gid, tileX, tileY);
                }
                this.waterTileGidCache.delete(key);
            }
        } else {
            if (!this.waterTileGidCache.has(key)) {
                for (const ld of waterLayerData) {
                    const tile = ld.tilemapLayer?.getTileAt(tileX, tileY);
                    if (tile) {
                        this.waterTileGidCache.set(key, { gid: tile.index, layerName: ld.name });
                        ld.tilemapLayer!.removeTileAt(tileX, tileY);
                        break;
                    }
                }
            }
        }

        // Pontoon at this position (if any).
        // Skip pontoons on ALWAYS_HIGH or STAIRS tiles — immune to flow water overrides.
        const pontoon = this.pontoonTiles.get(key);
        const pontoonCollision = pontoon ? this.getCollisionAt(pontoon.tileX, pontoon.tileY) : undefined;
        if (pontoon &&
            pontoonCollision !== CollisionType.ALWAYS_HIGH &&
            pontoonCollision !== CollisionType.STAIRS) {
            const correctCollision = hasWater ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
            this.setCollisionAt(tileX, tileY, correctCollision);
            if (pontoon.isHigh !== hasWater) {
                const newGID = pontoon.currentGID + pontoon.toggleOffset;
                const layerData = this.map.layers.find(l => l.name === pontoon.layerName);
                if (layerData?.tilemapLayer) {
                    layerData.tilemapLayer.putTileAt(newGID, tileX, tileY);
                }
                pontoon.currentGID = newGID;
                pontoon.isHigh = hasWater;
                pontoon.toggleOffset = -pontoon.toggleOffset;
            }
        }
    }

    /**
     * Update pontoon tiles within a FlowPuzzle's bounds to match the current
     * water state.
     *
     * When a pontoon tile has water: show the high-water variant (WALKABLE).
     * When dry: show the low-water variant (WALKABLE_LOW).
     */
    updatePontoonVisuals(puzzle: FlowPuzzle, puzzleBounds: { x: number; y: number }): void {
        if (!this.tiledMapData) return;

        const tileW: number = this.tiledMapData.tilewidth ?? 32;
        const tileH: number = this.tiledMapData.tileheight ?? 32;
        const originTileX = Math.floor(puzzleBounds.x / tileW);
        const originTileY = Math.floor(puzzleBounds.y / tileH);

        for (let ly = 0; ly < puzzle.height; ly++) {
            for (let lx = 0; lx < puzzle.width; lx++) {
                const tileX = originTileX + lx;
                const tileY = originTileY + ly;
                const key = `${tileX},${tileY}`;

                const pontoon = this.pontoonTiles.get(key);
                if (!pontoon) continue;

                const waterHere = puzzle.tileHasWater(lx, ly);
                const shouldBeHigh = waterHere;

                const correctCollisionType = shouldBeHigh ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
                if (!this.isPermanentlyBlocked(tileX, tileY)) {
                    this.setCollisionAt(tileX, tileY, correctCollisionType);
                }

                if (pontoon.isHigh === shouldBeHigh) continue;

                const newGID = pontoon.currentGID + pontoon.toggleOffset;
                const layerData = this.map.layers.find(l => l.name === pontoon.layerName);
                if (layerData?.tilemapLayer) {
                    layerData.tilemapLayer.putTileAt(newGID, tileX, tileY);
                }
                pontoon.currentGID = newGID;
                pontoon.isHigh = shouldBeHigh;
                pontoon.toggleOffset = -pontoon.toggleOffset;
            }
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /** Return all Phaser LayerData objects whose name suffix matches `suffix`. */
    private findLayersBySuffix(suffix: string): Phaser.Tilemaps.LayerData[] {
        return this.map.layers.filter(
            layer => TiledLayerUtils.getLayerSuffix(layer.name) === suffix
        );
    }
}
