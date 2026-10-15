import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';

interface LayerProperty {
    name: string;
    value: unknown;
}

interface LayerLike {
    name: string;
    properties?: unknown[];
}

const EXTERNAL_TILESET_TEXTURE_KEYS: Record<string, string> = {
    beach: 'beachTileset',
    SproutLandsGrassIslands: 'grassTileset',
};

export function getTilesetTextureKey(tilesetName: string): string {
    return EXTERNAL_TILESET_TEXTURE_KEYS[tilesetName] ?? `tileset_${tilesetName}`;
}

export function resolveTilesetImagePath(imagePath: string): string {
    if (imagePath.startsWith('data:') || imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath;
    }

    if (imagePath.startsWith('resources/')) {
        return imagePath;
    }

    if (imagePath.startsWith('../')) {
        return `resources/${imagePath.substring(3)}`;
    }

    if (imagePath.startsWith('tilesets/') || imagePath.startsWith('sprites/')) {
        return `resources/${imagePath}`;
    }

    return `resources/tilesets/${imagePath}`;
}

export function findMapLayersBySuffix<T extends { name: string }>(layers: T[], suffix: string): T[] {
    return layers.filter((layer) => TiledLayerUtils.getLayerSuffix(layer.name) === suffix);
}

export function shouldAutoRenderLayer(
    layerData: LayerLike,
    options: { skippedLayerNames?: string[] } = {},
): boolean {
    const suffix = TiledLayerUtils.getLayerSuffix(layerData.name);
    if (suffix === 'collision' || suffix === 'roofs') {
        return false;
    }

    if (options.skippedLayerNames?.includes(layerData.name)) {
        return false;
    }

    return getBooleanLayerProperty(layerData.properties, 'autoRender');
}

export function shouldRenderLayerAbovePlayer(layerData: Pick<LayerLike, 'properties'>): boolean {
    return getBooleanLayerProperty(layerData.properties, 'renderAbovePlayer');
}

function getBooleanLayerProperty(
    properties: unknown[] | undefined,
    propertyName: string,
): boolean {
    if (!Array.isArray(properties)) {
        return false;
    }

    return properties.some((property) => {
        const candidate = property as Partial<LayerProperty>;
        return candidate.name === propertyName && candidate.value === true;
    });
}
