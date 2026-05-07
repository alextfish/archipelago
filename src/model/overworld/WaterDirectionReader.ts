import type { Direction, GridKey } from '@model/puzzle/FlowTypes';
import { gridKey } from '@model/puzzle/FlowTypes';
import { TiledLayerUtils } from './TiledLayerUtils';

export interface WaterDirectionTile {
  key: GridKey;
  tileX: number;
  tileY: number;
  layerName: string;
  outgoing: Direction[];
  isSource: boolean;
}

/**
 * Reads water-direction tiles from raw Tiled map data.
 * Pure model utility with no Phaser dependency.
 */
export class WaterDirectionReader {
  static readFromTiledMapData(tiledMapData: any): Map<GridKey, WaterDirectionTile> {
    const result = new Map<GridKey, WaterDirectionTile>();
    if (!tiledMapData) return result;

    const layers = TiledLayerUtils.findTileLayersByName(tiledMapData.layers ?? [], 'water');
    const tilesets = tiledMapData.tilesets ?? [];
    const mapWidth: number = tiledMapData.width ?? 0;
    const mapHeight: number = tiledMapData.height ?? 0;

    for (const layer of layers) {
      const data: number[] = layer.data.data ?? [];
      for (let tileY = 0; tileY < mapHeight; tileY++) {
        for (let tileX = 0; tileX < mapWidth; tileX++) {
          const gid = TiledLayerUtils.getGIDAt(data, mapWidth, tileX, tileY);
          if (gid <= 0) continue;

          const props = TiledLayerUtils.getTileProperties(tilesets, gid);
          const outgoing = TiledLayerUtils.flowDirectionsFromProperties(props);
          const isSource = props.source === true;
          if (outgoing.length === 0 && !isSource) continue;

          const key = gridKey(tileX, tileY);
          result.set(key, {
            key,
            tileX,
            tileY,
            layerName: layer.name,
            outgoing,
            isSource
          });
        }
      }
    }

    return result;
  }
}
