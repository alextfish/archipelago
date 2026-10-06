const GENERATED_PADDING_PROPERTY = 'generatedWaterPadding';
const GENERATED_PADDING_SIZE_PROPERTY = 'generatedWaterPaddingSize';
const GENERATED_LAYER_NAME = 'generated/water';
const EXCLUDE_FROM_FLOW_PROPERTY = 'excludeFromFlow';
const EXCLUDE_FROM_PUZZLE_WATER_PROPERTY = 'excludeFromPuzzleWater';

export interface OverworldWaterPaddingOptions {
    paddingTiles?: number;
    waterTileIDs?: readonly number[];
    layerName?: string;
}

/**
 * Runtime-only map augmentation for overworld padding water.
 *
 * This runs immediately after loading map JSON from disk and is idempotent:
 * a map already marked as padded will be returned unchanged.
 */
export class OverworldWaterPaddingGenerator {
    static readonly DEFAULT_PADDING_TILES = 20;
    static readonly DEFAULT_WATER_TILE_IDS: readonly number[] = [33, 34, 47, 59];

    static apply(mapData: any, options: OverworldWaterPaddingOptions = {}): boolean {
        if (!mapData || !Array.isArray(mapData.layers)) {
            return false;
        }

        const paddingTiles = options.paddingTiles ?? this.DEFAULT_PADDING_TILES;
        const waterTileIDs = options.waterTileIDs ?? this.DEFAULT_WATER_TILE_IDS;
        const layerName = options.layerName ?? GENERATED_LAYER_NAME;

        if (paddingTiles <= 0 || waterTileIDs.length === 0) {
            return false;
        }

        if (this.isAlreadyPadded(mapData, layerName)) {
            return false;
        }

        const originalWidth = Number(mapData.width) || 0;
        const originalHeight = Number(mapData.height) || 0;
        if (originalWidth <= 0 || originalHeight <= 0) {
            return false;
        }

        const mapTileWidth = Number(mapData.tilewidth) || 32;
        const mapTileHeight = Number(mapData.tileheight) || 32;

        const newWidth = originalWidth + paddingTiles * 2;
        const newHeight = originalHeight + paddingTiles * 2;

        this.padExistingLayers(
            mapData.layers,
            originalWidth,
            originalHeight,
            newWidth,
            newHeight,
            paddingTiles,
            mapTileWidth,
            mapTileHeight,
        );

        mapData.width = newWidth;
        mapData.height = newHeight;

        const waterPaddingLayer = this.buildWaterPaddingLayer(
            newWidth,
            newHeight,
            originalWidth,
            originalHeight,
            paddingTiles,
            waterTileIDs,
            layerName,
            this.nextLayerID(mapData),
        );
        mapData.layers.push(waterPaddingLayer);

        this.setOrCreateMapProperty(mapData, GENERATED_PADDING_PROPERTY, true, 'bool');
        this.setOrCreateMapProperty(mapData, GENERATED_PADDING_SIZE_PROPERTY, paddingTiles, 'int');

        return true;
    }

    private static isAlreadyPadded(mapData: any, layerName: string): boolean {
        const markedOnMap = this.getMapProperty(mapData, GENERATED_PADDING_PROPERTY);
        if (markedOnMap === true) {
            return true;
        }

        const matchingLayer = this.findLayerByName(mapData.layers, layerName);
        if (!matchingLayer) {
            return false;
        }

        const markedOnLayer = this.getLayerProperty(matchingLayer, GENERATED_PADDING_PROPERTY);
        return markedOnLayer === true;
    }

    private static padExistingLayers(
        layers: any[],
        originalWidth: number,
        originalHeight: number,
        newWidth: number,
        newHeight: number,
        paddingTiles: number,
        mapTileWidth: number,
        mapTileHeight: number,
    ): void {
        const offsetX = paddingTiles * mapTileWidth;
        const offsetY = paddingTiles * mapTileHeight;

        for (const layer of layers) {
            if (layer.type === 'group' && Array.isArray(layer.layers)) {
                this.padExistingLayers(
                    layer.layers,
                    originalWidth,
                    originalHeight,
                    newWidth,
                    newHeight,
                    paddingTiles,
                    mapTileWidth,
                    mapTileHeight,
                );
                continue;
            }

            if (layer.type === 'tilelayer') {
                const sourceData = Array.isArray(layer.data)
                    ? layer.data as number[]
                    : Array.isArray(layer?.data?.data)
                        ? layer.data.data as number[]
                        : [];

                const paddedData = new Array<number>(newWidth * newHeight).fill(0);
                for (let y = 0; y < originalHeight; y++) {
                    for (let x = 0; x < originalWidth; x++) {
                        const sourceIndex = y * originalWidth + x;
                        const targetX = x + paddingTiles;
                        const targetY = y + paddingTiles;
                        const targetIndex = targetY * newWidth + targetX;
                        paddedData[targetIndex] = sourceData[sourceIndex] ?? 0;
                    }
                }

                if (Array.isArray(layer.data)) {
                    layer.data = paddedData;
                } else if (layer?.data && typeof layer.data === 'object') {
                    layer.data.data = paddedData;
                } else {
                    layer.data = paddedData;
                }

                layer.width = newWidth;
                layer.height = newHeight;
                continue;
            }

            if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
                for (const obj of layer.objects) {
                    if (typeof obj.x === 'number') obj.x += offsetX;
                    if (typeof obj.y === 'number') obj.y += offsetY;
                }
                continue;
            }

            if (layer.type === 'imagelayer') {
                if (typeof layer.x === 'number') layer.x += offsetX;
                if (typeof layer.y === 'number') layer.y += offsetY;
            }
        }
    }

    private static buildWaterPaddingLayer(
        mapWidth: number,
        mapHeight: number,
        originalWidth: number,
        originalHeight: number,
        paddingTiles: number,
        waterTileIDs: readonly number[],
        layerName: string,
        layerID: number,
    ): any {
        const data = new Array<number>(mapWidth * mapHeight).fill(0);
        const originalMaxX = paddingTiles + originalWidth;
        const originalMaxY = paddingTiles + originalHeight;

        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const insideOriginalX = x >= paddingTiles && x < originalMaxX;
                const insideOriginalY = y >= paddingTiles && y < originalMaxY;
                if (insideOriginalX && insideOriginalY) {
                    continue;
                }

                const randomIndex = Math.floor(Math.random() * waterTileIDs.length);
                const gid = waterTileIDs[randomIndex] ?? waterTileIDs[0];
                data[y * mapWidth + x] = gid;
            }
        }

        return {
            id: layerID,
            name: layerName,
            type: 'tilelayer',
            width: mapWidth,
            height: mapHeight,
            visible: true,
            opacity: 1,
            x: 0,
            y: 0,
            data,
            properties: [
                { name: 'autoRender', type: 'bool', value: true },
                { name: GENERATED_PADDING_PROPERTY, type: 'bool', value: true },
                { name: GENERATED_PADDING_SIZE_PROPERTY, type: 'int', value: paddingTiles },
                { name: EXCLUDE_FROM_FLOW_PROPERTY, type: 'bool', value: true },
                { name: EXCLUDE_FROM_PUZZLE_WATER_PROPERTY, type: 'bool', value: true },
            ],
        };
    }

    private static nextLayerID(mapData: any): number {
        const nextID = Number(mapData?.nextlayerid);
        if (Number.isFinite(nextID) && nextID > 0) {
            mapData.nextlayerid = nextID + 1;
            return nextID;
        }

        let maxID = 0;
        const scan = (layers: any[]): void => {
            for (const layer of layers) {
                if (typeof layer.id === 'number' && layer.id > maxID) {
                    maxID = layer.id;
                }
                if (layer.type === 'group' && Array.isArray(layer.layers)) {
                    scan(layer.layers);
                }
            }
        };

        scan(mapData.layers ?? []);
        return maxID + 1;
    }

    private static getMapProperty(mapData: any, propertyName: string): unknown {
        if (!Array.isArray(mapData?.properties)) {
            return undefined;
        }
        const prop = mapData.properties.find((p: any) => p?.name === propertyName);
        return prop?.value;
    }

    private static setOrCreateMapProperty(
        mapData: any,
        propertyName: string,
        value: boolean | number,
        type: 'bool' | 'int',
    ): void {
        if (!Array.isArray(mapData.properties)) {
            mapData.properties = [];
        }

        const existing = mapData.properties.find((p: any) => p?.name === propertyName);
        if (existing) {
            existing.type = type;
            existing.value = value;
            return;
        }

        mapData.properties.push({ name: propertyName, type, value });
    }

    private static getLayerProperty(layer: any, propertyName: string): unknown {
        if (!Array.isArray(layer?.properties)) {
            return undefined;
        }
        const prop = layer.properties.find((p: any) => p?.name === propertyName);
        return prop?.value;
    }

    private static findLayerByName(layers: any[], layerName: string): any | undefined {
        for (const layer of layers) {
            if (layer?.name === layerName) {
                return layer;
            }
            if (layer?.type === 'group' && Array.isArray(layer.layers)) {
                const nested = this.findLayerByName(layer.layers, layerName);
                if (nested) {
                    return nested;
                }
            }
        }
        return undefined;
    }
}
