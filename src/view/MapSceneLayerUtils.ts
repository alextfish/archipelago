import {
    findMapLayersBySuffix,
    getTilesetTextureKey,
    shouldAutoRenderLayer,
    shouldRenderLayerAbovePlayer,
} from '@view/MapSceneAssetUtils';

interface LayerDataLike {
    name: string;
    properties?: unknown[];
}

interface TilesetDataLike {
    name: string;
}

interface DepthLayerLike {
    setDepth(depth: number): unknown;
}

interface AlphaLayerLike {
    setAlpha(alpha: number): unknown;
}

export interface TilesetLoadResult<TTileset> {
    name: string;
    textureKey: string;
    tileset: TTileset | null;
}

export interface LayerCreationResult<TLayer> {
    createdLayers: TLayer[];
    createdLayerNames: string[];
    failedLayerNames: string[];
}

export function loadMapTilesets<TTileset>(
    tilesetData: TilesetDataLike[] | undefined,
    addTilesetImage: (tilesetName: string, textureKey: string) => TTileset | null,
): TilesetLoadResult<TTileset>[] {
    if (!tilesetData) {
        return [];
    }

    return tilesetData.map((tileset) => {
        const textureKey = getTilesetTextureKey(tileset.name);
        return {
            name: tileset.name,
            textureKey,
            tileset: addTilesetImage(tileset.name, textureKey),
        };
    });
}

export function createVisualLayers<TTileset, TLayer extends DepthLayerLike>(
    layerData: LayerDataLike[],
    createLayer: (layerName: string, tilesets: TTileset[]) => TLayer | null,
    tilesets: TTileset[],
    options: {
        overheadLayerDepth: number;
        skippedLayerNames?: string[];
    },
): LayerCreationResult<TLayer> {
    const createdLayers: TLayer[] = [];
    const createdLayerNames: string[] = [];
    const failedLayerNames: string[] = [];

    for (const layer of layerData) {
        if (!shouldAutoRenderLayer(layer, {
            skippedLayerNames: options.skippedLayerNames,
        })) {
            continue;
        }

        const createdLayer = createLayer(layer.name, tilesets);
        if (!createdLayer) {
            failedLayerNames.push(layer.name);
            continue;
        }

        if (shouldRenderLayerAbovePlayer(layer)) {
            createdLayer.setDepth(options.overheadLayerDepth);
        }

        createdLayers.push(createdLayer);
        createdLayerNames.push(layer.name);
    }

    return {
        createdLayers,
        createdLayerNames,
        failedLayerNames,
    };
}

export function createHiddenLayersBySuffix<TTileset, TLayer extends AlphaLayerLike>(
    layerData: LayerDataLike[],
    createLayer: (layerName: string, tilesets: TTileset[]) => TLayer | null,
    tilesets: TTileset[],
    suffix: string,
): LayerCreationResult<TLayer> {
    const createdLayers: TLayer[] = [];
    const createdLayerNames: string[] = [];
    const failedLayerNames: string[] = [];

    for (const layer of findMapLayersBySuffix(layerData, suffix)) {
        const createdLayer = createLayer(layer.name, tilesets);
        if (!createdLayer) {
            failedLayerNames.push(layer.name);
            continue;
        }

        createdLayer.setAlpha(0);
        createdLayers.push(createdLayer);
        createdLayerNames.push(layer.name);
    }

    return {
        createdLayers,
        createdLayerNames,
        failedLayerNames,
    };
}

export function createOverheadLayersBySuffix<TTileset, TLayer extends DepthLayerLike>(
    layerData: LayerDataLike[],
    createLayer: (layerName: string, tilesets: TTileset[]) => TLayer | null,
    tilesets: TTileset[],
    suffix: string,
    overheadLayerDepth: number,
): LayerCreationResult<TLayer> {
    const createdLayers: TLayer[] = [];
    const createdLayerNames: string[] = [];
    const failedLayerNames: string[] = [];

    for (const layer of findMapLayersBySuffix(layerData, suffix)) {
        const createdLayer = createLayer(layer.name, tilesets);
        if (!createdLayer) {
            failedLayerNames.push(layer.name);
            continue;
        }

        createdLayer.setDepth(overheadLayerDepth);
        createdLayers.push(createdLayer);
        createdLayerNames.push(layer.name);
    }

    return {
        createdLayers,
        createdLayerNames,
        failedLayerNames,
    };
}
