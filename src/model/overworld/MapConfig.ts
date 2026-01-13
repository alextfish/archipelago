import type { TileLayerConfig } from './MapPuzzleExtractor';

/**
 * Example tile layer configuration for overworld puzzle extraction
 * These tile IDs correspond to specific tiles in your tilesets
 */
export const defaultTileConfig: TileLayerConfig = {
    // Island tiles - specific tile IDs that represent islands in puzzles
    islandTileIDs: [
        6
    ],

    // Obstacle tiles - tiles that block bridge placement
    obstacleTileIDs: [
        72,  // Rock
        73,  // Boulder
        74,  // Reef
        75   // Whirlpool
    ],

    // Constraint tiles - special tiles that add constraints to specific locations
    constraintTileIDs: {
        80: 'no_bridge',      // Red X tile - no bridge allowed
        81: 'bridge_count_2', // Number 2 tile - max 2 bridges
        82: 'bridge_count_3', // Number 3 tile - max 3 bridges
        83: 'required_path',  // Arrow tile - bridge must pass through
        84: 'wind_direction'  // Wind tile - directional constraint
    },

    // Entry point tiles - tiles that trigger puzzle interface when player walks on them
    entryPointTileIDs: [
        7,  // Planks
        17  // Pier tile
    ]
};

/**
 * Utility functions for working with Tiled map data
 */
export class MapUtils {
    /**
     * Load and parse a Tiled map file (JSON or TMX)
     */
    static async loadTiledMap(mapPath: string): Promise<any> {
        try {
            let mapData: any;

            // Check if we're in Node.js environment
            if (typeof window === 'undefined') {
                // Node.js environment - use filesystem
                const fs = await import('fs');
                const path = await import('path');

                const fullPath = path.resolve(mapPath);
                console.log(`Loading TMX file from: ${fullPath}`);
                const fileContent = fs.readFileSync(fullPath, 'utf8');

                if (mapPath.endsWith('.tmx')) {
                    // Parse TMX (XML) format
                    const { parseString } = await import('xml2js');

                    const parsedXml = await new Promise<any>((resolve, reject) => {
                        parseString(fileContent, (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                    });

                    // Convert TMX structure to JSON-like format for compatibility
                    mapData = this.convertTmxToJson(parsedXml.map);
                } else {
                    // Parse JSON format
                    mapData = JSON.parse(fileContent);
                }
            } else {
                // Browser environment - use fetch
                const response = await fetch(mapPath);
                if (!response.ok) {
                    throw new Error(`Failed to load map: ${mapPath} (${response.status})`);
                }

                if (mapPath.endsWith('.tmx')) {
                    // Parse TMX in browser using DOMParser
                    const xmlText = await response.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

                    // Check for parsing errors
                    const parserError = xmlDoc.querySelector('parsererror');
                    if (parserError) {
                        throw new Error(`XML parsing error: ${parserError.textContent}`);
                    }

                    mapData = this.convertTmxToJsonBrowser(xmlDoc);
                } else {
                    mapData = await response.json();
                }
            }

            // Validate basic structure
            if (!mapData.width || !mapData.height || !mapData.layers) {
                throw new Error(`Invalid Tiled map format: ${mapPath}`);
            }

            console.log(`Loaded Tiled map: ${mapData.width}x${mapData.height} with ${mapData.layers.length} layers`);
            return mapData;
        } catch (error) {
            console.error(`Error loading Tiled map from ${mapPath}:`, error);
            throw error;
        }
    }

    /**
     * Convert TMX (parsed XML) structure to JSON-like format for compatibility
     */
    private static convertTmxToJson(tmxMap: any): any {
        // Extract basic map properties
        const map = tmxMap.$; // XML attributes
        const mapData: any = {
            width: parseInt(map.width),
            height: parseInt(map.height),
            tilewidth: parseInt(map.tilewidth),
            tileheight: parseInt(map.tileheight),
            tilesets: [],
            layers: []
        };

        // Process tilesets
        if (tmxMap.tileset) {
            for (const tileset of tmxMap.tileset) {
                const tilesetData = {
                    firstgid: parseInt(tileset.$.firstgid),
                    source: tileset.$.source || undefined,
                    name: tileset.$.name || 'unknown'
                };
                mapData.tilesets.push(tilesetData);
            }
        }

        // Process tile layers
        if (tmxMap.layer) {
            for (const layer of tmxMap.layer) {
                const layerData: any = {
                    id: parseInt(layer.$.id || 0),
                    name: layer.$.name,
                    type: 'tilelayer',
                    width: parseInt(layer.$.width),
                    height: parseInt(layer.$.height),
                    visible: layer.$.visible !== '0'
                };

                // Parse CSV tile data
                if (layer.data && layer.data[0]) {
                    const csvData = layer.data[0]._.trim();
                    layerData.data = csvData
                        .split(/[\n,]/)
                        .map((s: string) => parseInt(s.trim()))
                        .filter((n: number) => !isNaN(n));
                }

                mapData.layers.push(layerData);
            }
        }

        // Process object layers
        if (tmxMap.objectgroup) {
            for (const objectgroup of tmxMap.objectgroup) {
                const objectLayer: any = {
                    id: parseInt(objectgroup.$.id || 0),
                    name: objectgroup.$.name,
                    type: 'objectgroup',
                    visible: objectgroup.$.visible !== '0',
                    objects: []
                };

                // Process objects
                if (objectgroup.object) {
                    for (const obj of objectgroup.object) {
                        const objData: any = {
                            id: parseInt(obj.$.id),
                            name: obj.$.name || '',
                            x: parseFloat(obj.$.x),
                            y: parseFloat(obj.$.y),
                            width: parseFloat(obj.$.width || '0'),
                            height: parseFloat(obj.$.height || '0'),
                            properties: {}
                        };

                        // Process properties
                        if (obj.properties && obj.properties[0] && obj.properties[0].property) {
                            for (const prop of obj.properties[0].property) {
                                objData.properties[prop.$.name] = prop.$.value;
                            }
                        }

                        objectLayer.objects.push(objData);
                    }
                }

                mapData.layers.push(objectLayer);
            }
        }

        return mapData;
    }

    /**
     * Convert TMX DOM Document to JSON-like format for browser environment
     */
    private static convertTmxToJsonBrowser(xmlDoc: Document): any {
        const mapElement = xmlDoc.querySelector('map');
        if (!mapElement) {
            throw new Error('Invalid TMX file: no map element found');
        }

        // Extract basic map properties
        const mapData: any = {
            width: parseInt(mapElement.getAttribute('width') || '0'),
            height: parseInt(mapElement.getAttribute('height') || '0'),
            tilewidth: parseInt(mapElement.getAttribute('tilewidth') || '32'),
            tileheight: parseInt(mapElement.getAttribute('tileheight') || '32'),
            orientation: mapElement.getAttribute('orientation') || 'orthogonal',
            renderorder: mapElement.getAttribute('renderorder') || 'right-down',
            infinite: mapElement.getAttribute('infinite') === '1',
            version: mapElement.getAttribute('version') || '1.0',
            type: 'map',
            tilesets: [],
            layers: []
        };

        // Process tilesets
        const tilesets = xmlDoc.querySelectorAll('tileset');
        for (const tileset of tilesets) {
            // Check if this is an external tileset reference
            const sourceAttr = tileset.getAttribute('source');
            if (sourceAttr) {
                // External tileset - we don't support loading TSX files yet
                console.warn(`External tileset detected: ${sourceAttr}. Consider exporting as JSON instead.`);
                throw new Error(`External tilesets not yet supported. Found: ${sourceAttr}`);
            }

            const imageElement = tileset.querySelector('image');
            const tilesetData: any = {
                firstgid: parseInt(tileset.getAttribute('firstgid') || '1'),
                name: tileset.getAttribute('name') || 'unknown',
                tilewidth: parseInt(tileset.getAttribute('tilewidth') || '32'),
                tileheight: parseInt(tileset.getAttribute('tileheight') || '32'),
                tilecount: parseInt(tileset.getAttribute('tilecount') || '1'),
                columns: parseInt(tileset.getAttribute('columns') || '1')
            };

            if (imageElement) {
                tilesetData.image = imageElement.getAttribute('source');
                tilesetData.imagewidth = parseInt(imageElement.getAttribute('width') || '32');
                tilesetData.imageheight = parseInt(imageElement.getAttribute('height') || '32');
            }

            mapData.tilesets.push(tilesetData);
        }

        // Process tile layers
        const tileLayers = xmlDoc.querySelectorAll('layer');
        for (const layer of tileLayers) {
            const layerData: any = {
                id: parseInt(layer.getAttribute('id') || '0'),
                name: layer.getAttribute('name') || 'unknown',
                type: 'tilelayer',
                width: parseInt(layer.getAttribute('width') || '0'),
                height: parseInt(layer.getAttribute('height') || '0'),
                visible: layer.getAttribute('visible') !== '0',
                opacity: parseFloat(layer.getAttribute('opacity') || '1'),
                x: parseInt(layer.getAttribute('offsetx') || '0'),
                y: parseInt(layer.getAttribute('offsety') || '0')
            };

            // Parse tile data
            const dataElement = layer.querySelector('data');
            if (dataElement) {
                const encoding = dataElement.getAttribute('encoding');

                if (encoding === 'csv') {
                    // Parse CSV data
                    const csvData = dataElement.textContent?.trim() || '';
                    layerData.data = csvData
                        .split(/[\n,]/)
                        .map((s: string) => parseInt(s.trim()))
                        .filter((n: number) => !isNaN(n));
                } else {
                    // Default to CSV-like parsing for uncompressed data
                    const csvData = dataElement.textContent?.trim() || '';
                    layerData.data = csvData
                        .split(/[\s,]+/)
                        .map((s: string) => parseInt(s.trim()))
                        .filter((n: number) => !isNaN(n));
                }
            }

            mapData.layers.push(layerData);
        }

        // Process object layers
        const objectLayers = xmlDoc.querySelectorAll('objectgroup');
        for (const objectgroup of objectLayers) {
            const objectLayer: any = {
                id: parseInt(objectgroup.getAttribute('id') || '0'),
                name: objectgroup.getAttribute('name') || 'unknown',
                type: 'objectgroup',
                visible: objectgroup.getAttribute('visible') !== '0',
                objects: []
            };

            // Process objects in this layer
            const objects = objectgroup.querySelectorAll('object');
            for (const obj of objects) {
                const objData: any = {
                    id: parseInt(obj.getAttribute('id') || '0'),
                    name: obj.getAttribute('name') || '',
                    type: obj.getAttribute('type') || '',
                    x: parseFloat(obj.getAttribute('x') || '0'),
                    y: parseFloat(obj.getAttribute('y') || '0'),
                    width: parseFloat(obj.getAttribute('width') || '0'),
                    height: parseFloat(obj.getAttribute('height') || '0'),
                    rotation: parseFloat(obj.getAttribute('rotation') || '0'),
                    visible: obj.getAttribute('visible') !== '0'
                };

                // Parse properties if present
                const properties = obj.querySelector('properties');
                if (properties) {
                    objData.properties = {};
                    const propElements = properties.querySelectorAll('property');
                    for (const prop of propElements) {
                        const name = prop.getAttribute('name');
                        const value = prop.getAttribute('value') || prop.textContent;
                        const type = prop.getAttribute('type') || 'string';

                        if (name) {
                            // Convert value based on type
                            switch (type) {
                                case 'bool':
                                    objData.properties[name] = value === 'true';
                                    break;
                                case 'int':
                                case 'float':
                                    objData.properties[name] = parseFloat(value || '0');
                                    break;
                                default:
                                    objData.properties[name] = value || '';
                            }
                        }
                    }
                }

                objectLayer.objects.push(objData);
            }

            mapData.layers.push(objectLayer);
        }

        return mapData;
    }

    /**
     * Convert pixel coordinates to tile coordinates
     */
    static pixelToTile(pixelX: number, pixelY: number, tileWidth: number, tileHeight: number): { x: number; y: number } {
        return {
            x: Math.floor(pixelX / tileWidth),
            y: Math.floor(pixelY / tileHeight)
        };
    }

    /**
     * Convert tile coordinates to pixel coordinates (top-left of tile)
     */
    static tileToPixel(tileX: number, tileY: number, tileWidth: number, tileHeight: number): { x: number; y: number } {
        return {
            x: tileX * tileWidth,
            y: tileY * tileHeight
        };
    }

    /**
     * Get tile ID at specific position in a tile layer
     */
    static getTileAt(layer: any, x: number, y: number): number {
        if (!layer.data || !layer.width || !layer.height) {
            return 0;
        }

        if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) {
            return 0;
        }

        const index = y * layer.width + x;
        return layer.data[index] || 0;
    }

    /**
     * Find all positions of specific tile IDs in a layer
     */
    static findTilePositions(layer: any, targetTileIDs: number[]): Array<{ x: number; y: number; tileID: number }> {
        const positions: Array<{ x: number; y: number; tileID: number }> = [];

        if (!layer.data || !layer.width || !layer.height) {
            return positions;
        }

        for (let y = 0; y < layer.height; y++) {
            for (let x = 0; x < layer.width; x++) {
                const tileID = MapUtils.getTileAt(layer, x, y);
                if (targetTileIDs.includes(tileID)) {
                    positions.push({ x, y, tileID });
                }
            }
        }

        return positions;
    }

    /**
     * Get bounds of all non-empty tiles in a layer
     */
    static getLayerBounds(layer: any): { minX: number; minY: number; maxX: number; maxY: number } | null {
        if (!layer.data || !layer.width || !layer.height) {
            return null;
        }

        let minX = layer.width;
        let minY = layer.height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < layer.height; y++) {
            for (let x = 0; x < layer.width; x++) {
                const tileID = MapUtils.getTileAt(layer, x, y);
                if (tileID !== 0) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        return maxX >= minX ? { minX, minY, maxX, maxY } : null;
    }

    /**
     * Extract custom properties from a Tiled object
     */
    static extractProperties(tiledObject: any): Record<string, any> {
        const properties: Record<string, any> = {};

        if (tiledObject.properties) {
            for (const prop of tiledObject.properties) {
                properties[prop.name] = prop.value;
            }
        }

        return properties;
    }

    /**
     * Validate that required layers exist in the map
     */
    static validateMapStructure(tiledMap: any, requiredLayers: string[]): { valid: boolean; missingLayers: string[] } {
        const existingLayers = tiledMap.layers?.map((layer: any) => layer.name) || [];
        const missingLayers = requiredLayers.filter(required => !existingLayers.includes(required));

        return {
            valid: missingLayers.length === 0,
            missingLayers
        };
    }

    /**
     * Get layer statistics for debugging
     */
    static getLayerStats(tiledMap: any): Array<{ name: string; type: string; size: string; objectCount?: number }> {
        if (!tiledMap.layers) {
            return [];
        }

        return tiledMap.layers.map((layer: any) => {
            const stats: any = {
                name: layer.name,
                type: layer.type
            };

            if (layer.type === 'tilelayer') {
                stats.size = `${layer.width || 0}x${layer.height || 0}`;
            } else if (layer.type === 'objectgroup') {
                stats.size = 'N/A';
                stats.objectCount = layer.objects?.length || 0;
            }

            return stats;
        });
    }
}