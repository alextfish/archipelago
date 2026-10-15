import {
    areTilesetTexturesReady,
    getTilesetImageLoadRequests,
    type TilesetImageLoadRequest,
    type TilesetLike,
} from '@view/MapSceneAssetUtils';

interface TiledMapWithTilesets {
    tilesets?: TilesetLike[];
}

export interface PreparedMapSceneData<TMapData extends TiledMapWithTilesets> {
    mapData: TMapData;
    tilesetImageRequests: TilesetImageLoadRequest[];
}

export async function prepareMapSceneData<TMapData extends TiledMapWithTilesets>(
    mapPath: string,
    loadTiledMap: (mapPath: string) => Promise<TMapData>,
    textureExists: (textureKey: string) => boolean,
    options: { skipResourcePrefixedImages?: boolean } = {},
): Promise<PreparedMapSceneData<TMapData>> {
    const mapData = await loadTiledMap(mapPath);
    return {
        mapData,
        tilesetImageRequests: getTilesetImageLoadRequests(
            mapData.tilesets,
            textureExists,
            options,
        ),
    };
}

export function queueMapSceneImageRequests(
    requests: TilesetImageLoadRequest[],
    queueImage: (textureKey: string, imagePath: string) => void,
    isLoaderRunning: () => boolean,
    startLoader: () => void,
): void {
    for (const request of requests) {
        queueImage(request.textureKey, request.imagePath);
    }

    if (requests.length > 0 && !isLoaderRunning()) {
        startLoader();
    }
}

export function areMapSceneTilesetsReady(
    mapData: TiledMapWithTilesets | undefined,
    textureExists: (textureKey: string) => boolean,
): boolean {
    return areTilesetTexturesReady(mapData?.tilesets, textureExists);
}
