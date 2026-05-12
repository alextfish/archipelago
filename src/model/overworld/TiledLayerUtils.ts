/**
 * Utilities for working with Tiled map layer data structures.
 * These are pure functions with no Phaser dependency, making them unit-testable.
 */

export interface TiledObjectLayerResult {
    /** The layer's own name (e.g. "npcs") */
    name: string;
    /** Full path including parent group names (e.g. "Beach/npcs") */
    fullPath: string;
    /** The raw Tiled layer data object */
    data: any;
}

export interface TiledTileLayerResult {
    /** The layer's own name (e.g. "water") */
    name: string;
    /** Full path including parent group names (e.g. "River/water") */
    fullPath: string;
    /** The raw Tiled layer data object (type === 'tilelayer') */
    data: any;
}

/** Properties decoded from a single Tiled tile via its tileset definition. */
export interface TiledTileProperties {
    [key: string]: boolean | number | string;
}

export class TiledLayerUtils {
    /**
     * Extract the suffix from a layer name: the part after the last '/'.
     * e.g. "Beach/collision" → "collision", "Forest/npcs" → "npcs", "water" → "water"
     */
    static getLayerSuffix(layerName: string): string {
        const lastSlash = layerName.lastIndexOf('/');
        return lastSlash >= 0 ? layerName.substring(lastSlash + 1) : layerName;
    }

    /**
     * Recursively find all Tiled object layers whose name suffix matches the given string.
     * Searches nested group layers as well as top-level layers.
     *
     * @param layers - Array of raw Tiled layer data to search
     * @param suffix - The suffix to match (e.g. "npcs", "doors")
     * @param parentPath - Name of the enclosing group layer (used in recursion)
     * @returns All matching object layers with their names and full paths
     */
    static findObjectLayersByName(
        layers: any[],
        suffix: string,
        parentPath: string = ''
    ): TiledObjectLayerResult[] {
        const results: TiledObjectLayerResult[] = [];

        for (const layer of layers) {
            const fullPath = parentPath ? `${parentPath}/${layer.name}` : layer.name;

            if (layer.name && TiledLayerUtils.getLayerSuffix(layer.name) === suffix && layer.type === 'objectgroup') {
                results.push({ name: layer.name, fullPath, data: layer });
            }

            if (layer.type === 'group' && layer.layers) {
                // Pass layer.name (not fullPath) to preserve existing path-building behaviour
                // for nested groups
                results.push(...TiledLayerUtils.findObjectLayersByName(layer.layers, suffix, layer.name));
            }
        }

        return results;
    }

    /**
     * Recursively find all Tiled tile layers whose name suffix matches the given string.
     * Searches nested group layers as well as top-level layers.
     *
     * @param layers - Array of raw Tiled layer data to search
     * @param suffix - The suffix to match (e.g. "water", "ground", "lowground")
     * @param parentPath - Name of the enclosing group layer (used in recursion)
     * @returns All matching tile layers with their names and full paths
     */
    static findTileLayersByName(
        layers: any[],
        suffix: string,
        parentPath: string = ''
    ): TiledTileLayerResult[] {
        const results: TiledTileLayerResult[] = [];

        for (const layer of layers) {
            const fullPath = parentPath ? `${parentPath}/${layer.name}` : layer.name;

            if (layer.name && TiledLayerUtils.getLayerSuffix(layer.name) === suffix && layer.type === 'tilelayer') {
                results.push({ name: layer.name, fullPath, data: layer });
            }

            if (layer.type === 'group' && layer.layers) {
                results.push(...TiledLayerUtils.findTileLayersByName(layer.layers, suffix, layer.name));
            }
        }

        return results;
    }

    /**
     * Look up the custom properties of a tile by its global ID (GID) from raw Tiled map data.
     * Returns an empty object if the tile has no custom properties or the GID is 0 (empty tile).
     *
     * @param tilesets - The `tilesets` array from a raw Tiled map JSON
     * @param gid - The global tile ID (as stored in a tile layer's data array)
     */
    static getTileProperties(tilesets: any[], gid: number): TiledTileProperties {
        if (!gid || gid === 0 || !tilesets) return {};

        // Find the tileset that owns this GID: it is the one with the largest firstgid ≤ gid.
        let owningTileset: any = null;
        for (const ts of tilesets) {
            if (ts.firstgid <= gid) {
                if (!owningTileset || ts.firstgid > owningTileset.firstgid) {
                    owningTileset = ts;
                }
            }
        }
        if (!owningTileset || !owningTileset.tiles) return {};

        const localID = gid - owningTileset.firstgid;
        const tileDef = owningTileset.tiles.find((t: any) => t.id === localID);
        if (!tileDef?.properties) return {};

        const result: TiledTileProperties = {};
        for (const prop of tileDef.properties) {
            result[prop.name] = prop.value;
        }
        return result;
    }

    /**
     * Read the GID stored at world tile position (tileX, tileY) in a flat tile layer data array.
     *
     * @param layerData - The `data` array from a Tiled tilelayer (length = mapWidth * mapHeight)
     * @param mapWidth - Width of the map in tiles
     * @param tileX - World tile X coordinate
     * @param tileY - World tile Y coordinate
     * @returns The GID at that position, or 0 if out of bounds / empty
     */
    static getGIDAt(layerData: number[], mapWidth: number, tileX: number, tileY: number): number {
        const idx = tileY * mapWidth + tileX;
        if (idx < 0 || idx >= layerData.length) return 0;
        return layerData[idx] ?? 0;
    }
}
