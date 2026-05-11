import type { Direction } from '@model/puzzle/FlowTypes';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';

export interface WaterVisualDirectionTile {
    readonly tileX: number;
    readonly tileY: number;
    readonly layerName: string;
    readonly visualGID: number;
    readonly outgoing: Direction[];
}

/**
 * Reads flow-direction metadata from visual `*/water` layers.
 */
export class WaterDirectionReader {
    static readVisualWaterDirections(tiledMapData: any): Map<string, WaterVisualDirectionTile> {
        const result = new Map<string, WaterVisualDirectionTile>();
        if (!tiledMapData?.layers || !tiledMapData?.tilesets) return result;

        const mapWidth: number = tiledMapData.width ?? 0;
        const waterLayers = TiledLayerUtils.findTileLayersByName(tiledMapData.layers, 'water');

        for (const layer of waterLayers) {
            const data: number[] = layer.data?.data ?? layer.data ?? [];
            for (let i = 0; i < data.length; i++) {
                const gid = data[i] ?? 0;
                if (gid <= 0) continue;

                const props = TiledLayerUtils.getTileProperties(tiledMapData.tilesets, gid);
                const outgoing = TiledLayerUtils.flowDirectionsFromProperties(props);
                if (outgoing.length === 0) continue;

                const tileX = i % mapWidth;
                const tileY = Math.floor(i / mapWidth);
                result.set(`${tileX},${tileY}`, {
                    tileX,
                    tileY,
                    layerName: layer.fullPath,
                    visualGID: gid,
                    outgoing
                });
            }
        }

        return result;
    }
}
