import { TiledLayerUtils } from './TiledLayerUtils';
import { gridKey, directionKeyNSEW } from '@model/puzzle/FlowTypes';
import type { GridKey, Direction } from '@model/puzzle/FlowTypes';

/**
 * Reads flow direction data for overworld water tiles from Tiled map JSON.
 *
 * Scans every tile layer whose name ends with 'water', reads the
 * flowNorth / flowSouth / flowEast / flowWest properties of each tile GID
 * from the tileset data, and returns a map from world-tile position to the
 * canonical NSEW direction key.
 *
 * Only tiles with at least one active flow direction are included; purely
 * decorative water tiles (all flow directions false) are excluded so that
 * the caller does not create visual overlays for non-flowing tiles.
 *
 * Model layer — no Phaser or UI framework imports.
 */
export class WaterDirectionReader {
    /**
     * Extract flow directions for every flowing water tile in the map.
     *
     * @param tiledMapData Raw Tiled JSON map object.
     * @returns Map from world-tile {@link GridKey} to canonical NSEW direction
     *   key (e.g. `"NS"`, `"E"`, `"NSEW"`).  The map is empty when
     *   `tiledMapData` is `null` / `undefined`.
     */
    static readDirections(tiledMapData: any): Map<GridKey, string> {
        const result = new Map<GridKey, string>();
        if (!tiledMapData) return result;

        const mapWidth: number = tiledMapData.width ?? 0;
        const tilesets: any[] = tiledMapData.tilesets ?? [];
        const waterLayers = TiledLayerUtils.findTileLayersByName(
            tiledMapData.layers ?? [],
            'water',
        );

        for (const layer of waterLayers) {
            const tileData: number[] = layer.data.data ?? [];
            for (let i = 0; i < tileData.length; i++) {
                const gid = tileData[i];
                if (!gid || gid === 0) continue;

                const worldX = i % mapWidth;
                const worldY = Math.floor(i / mapWidth);

                const props = TiledLayerUtils.getTileProperties(tilesets, gid);

                const rawDirections: Direction[] = [];
                if (props.flowNorth) rawDirections.push('N');
                if (props.flowSouth) rawDirections.push('S');
                if (props.flowEast) rawDirections.push('E');
                if (props.flowWest) rawDirections.push('W');

                // Skip decorative tiles that carry no flow direction.
                if (rawDirections.length === 0) continue;

                // Later layer overwrites earlier one (matches buildMergedWaterLayer behaviour).
                result.set(gridKey(worldX, worldY), directionKeyNSEW(rawDirections));
            }
        }

        return result;
    }
}
