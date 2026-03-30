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
}
