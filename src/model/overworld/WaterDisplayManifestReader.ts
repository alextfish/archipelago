import type { Direction } from '@model/puzzle/FlowTypes';
import type { TiledTileLayerResult } from '@model/overworld/TiledLayerUtils';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';

export interface WaterDisplayManifestTile {
    readonly tileX: number;
    readonly tileY: number;
    readonly key: string;
    readonly logicLayerName: string;
    readonly targetWaterLayerName: string;
    readonly logicOutgoing: Direction[];
    readonly visualGID?: number;
    readonly visualOutgoing: Direction[];
    readonly visualHasFlowDirections: boolean;
    readonly fallbackWaterGID?: number;
}

export interface WaterDisplayManifest {
    readonly entries: Map<string, WaterDisplayManifestTile>;
}

/**
 * Builds a per-tile manifest combining logical `*/waterflow` and visual `*/water` layers.
 */
export class WaterDisplayManifestReader {
    static build(tiledMapData: any): WaterDisplayManifest {
        const entries = new Map<string, WaterDisplayManifestTile>();
        if (!tiledMapData?.layers || !tiledMapData?.tilesets) return { entries };

        const mapWidth: number = tiledMapData.width ?? 0;
        const waterLayers = TiledLayerUtils.findTileLayersByName(tiledMapData.layers, 'water');
        const waterflowLayers = TiledLayerUtils.findTileLayersByName(tiledMapData.layers, 'waterflow');
        const waterGIDs = this.getWaterTilesetGIDs(tiledMapData.tilesets);

        const waterLayerByGroup = new Map<string, TiledTileLayerResult>();
        for (const layer of waterLayers) {
            waterLayerByGroup.set(this.parentPath(layer.fullPath), layer);
        }

        for (const logicLayer of waterflowLayers) {
            const groupPath = this.parentPath(logicLayer.fullPath);
            const visualLayer = waterLayerByGroup.get(groupPath);
            const visualData: number[] = visualLayer?.data?.data ?? visualLayer?.data ?? [];
            const logicData: number[] = logicLayer.data?.data ?? logicLayer.data ?? [];
            const targetWaterLayerName = visualLayer?.fullPath ?? `${groupPath}/water`.replace(/^\//, '');

            for (let i = 0; i < logicData.length; i++) {
                const logicGID = logicData[i] ?? 0;
                if (logicGID <= 0) continue;

                const tileX = i % mapWidth;
                const tileY = Math.floor(i / mapWidth);
                const key = `${tileX},${tileY}`;
                const visualGID = visualData[i] ?? 0;

                const logicProps = TiledLayerUtils.getTileProperties(tiledMapData.tilesets, logicGID);
                const logicOutgoing = TiledLayerUtils.flowDirectionsFromProperties(logicProps);

                const visualProps = visualGID > 0
                    ? TiledLayerUtils.getTileProperties(tiledMapData.tilesets, visualGID)
                    : {};
                const visualOutgoing = TiledLayerUtils.flowDirectionsFromProperties(visualProps);
                const visualHasFlowDirections = visualOutgoing.length > 0;
                const fallbackWaterGID = visualGID > 0 ? undefined : this.pickStableFallbackWaterGID(
                    tileX,
                    tileY,
                    groupPath,
                    waterGIDs
                );

                entries.set(key, {
                    tileX,
                    tileY,
                    key,
                    logicLayerName: logicLayer.fullPath,
                    targetWaterLayerName,
                    logicOutgoing,
                    visualGID: visualGID > 0 ? visualGID : undefined,
                    visualOutgoing,
                    visualHasFlowDirections,
                    fallbackWaterGID
                });
            }
        }

        return { entries };
    }

    private static pickStableFallbackWaterGID(
        tileX: number,
        tileY: number,
        groupPath: string,
        waterGIDs: number[]
    ): number | undefined {
        if (waterGIDs.length === 0) return undefined;
        const seed = this.hash(`${groupPath}:${tileX},${tileY}`);
        return waterGIDs[seed % waterGIDs.length];
    }

    private static getWaterTilesetGIDs(tilesets: any[]): number[] {
        const waterTileset = (tilesets ?? []).find((ts: any) =>
            typeof ts?.image === 'string' && ts.image.endsWith('tilesets/water.png')
        );
        if (!waterTileset) return [];

        const firstgid: number = waterTileset.firstgid ?? 0;
        const tilecount: number = waterTileset.tilecount ?? 0;
        const gids: number[] = [];
        for (let i = 0; i < tilecount; i++) {
            gids.push(firstgid + i);
        }
        return gids;
    }

    private static parentPath(fullPath: string): string {
        const idx = fullPath.lastIndexOf('/');
        return idx >= 0 ? fullPath.substring(0, idx) : '';
    }

    private static hash(input: string): number {
        let h = 2166136261;
        for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
}
