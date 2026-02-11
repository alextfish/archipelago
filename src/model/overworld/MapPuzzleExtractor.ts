import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { PuzzleSpec } from '@model/puzzle/BridgePuzzle';
import type { Island } from '@model/puzzle/Island';

/**
 * Represents a puzzle definition extracted from a Tiled map
 */
export interface MapPuzzleDefinition {
    readonly id: string;
    readonly bounds: { x: number; y: number; width: number; height: number };
    readonly metadata: Record<string, string>; // Custom properties from Tiled object
}

/**
 * Configuration for interpreting different tile types in puzzle extraction
 */
export interface TileLayerConfig {
    readonly islandTileIDs: number[];
    readonly obstacleTileIDs: number[];
    readonly constraintTileIDs: Record<number, string>; // tileID → constraint type
    readonly entryPointTileIDs: number[];
}

/**
 * Represents a Tiled map layer for type safety
 */
export interface MapLayer {
    readonly name: string;
    readonly type: 'tilelayer' | 'objectgroup' | 'group';
    readonly width?: number;
    readonly height?: number;
    readonly data?: number[];
    readonly objects?: MapObject[];
    readonly layers?: MapLayer[]; // For group layers
}

/**
 * Represents a Tiled map object
 */
export interface MapObject {
    readonly id: number;
    readonly name: string;
    readonly type: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly properties?: Array<{ name: string; value: any; type: string }>;
}

/**
 * Represents a complete Tiled map structure
 */
export interface TiledMapData {
    readonly width: number;
    readonly height: number;
    readonly tilewidth: number;
    readonly tileheight: number;
    readonly layers: MapLayer[];
}

/**
 * Extracts BridgePuzzle data from Tiled map objects and tiles
 * Coordinates are grid-based and relative to puzzle bounds (0,0 = top-left of puzzle area)
 */
export class MapPuzzleExtractor {
    constructor(private readonly tileConfig: TileLayerConfig) { }

    /**
     * Extract all puzzle definitions from all region-prefixed puzzles object layers
     * (e.g., "Beach/puzzles", "Forest/puzzles")
     */
    extractPuzzleDefinitions(tiledMap: TiledMapData): MapPuzzleDefinition[] {
        // Find all puzzles object layers, including those nested in groups
        const puzzleLayers = this.findAllLayersBySuffix(tiledMap.layers, 'puzzles').filter(
            layer => layer.type === 'objectgroup'
        );

        if (puzzleLayers.length === 0) {
            console.warn('No "*/puzzles" object layers found in map');
            return [];
        }

        console.log(`Found ${puzzleLayers.length} puzzle layers`);

        const allDefinitions: MapPuzzleDefinition[] = [];

        for (const puzzleLayer of puzzleLayers) {
            console.log(`Processing puzzle layer: ${puzzleLayer.name} with ${puzzleLayer.objects?.length || 0} objects`);

            // Debug: show all objects in the puzzles layer
            if (puzzleLayer.objects) {
                puzzleLayer.objects.forEach((obj, i) => {
                    console.log(`  Object ${i}: name="${obj.name}", type="${obj.type || 'none'}", x=${obj.x}, y=${obj.y}, w=${obj.width}, h=${obj.height}`);
                    console.log(`    Properties:`, obj.properties);
                });
            }

            const definitions = puzzleLayer.objects
                ?.filter(obj => obj.type === 'puzzle' ||
                    obj.name?.startsWith('puzzle_') ||
                    obj.name?.toLowerCase().includes('puzzle'))
                .map(obj => this.createPuzzleDefinition(obj)) || [];

            allDefinitions.push(...definitions);
        }

        return allDefinitions;
    }

    /**
     * Helper: Get the layer suffix (everything after the last '/')
     */
    private getLayerSuffix(layerName: string): string {
        const lastSlash = layerName.lastIndexOf('/');
        return lastSlash >= 0 ? layerName.substring(lastSlash + 1) : layerName;
    }

    /**
     * Recursively find all layers matching a suffix, even if nested in groups
     */
    private findAllLayersBySuffix(layers: MapLayer[], suffix: string): MapLayer[] {
        const result: MapLayer[] = [];
        
        for (const layer of layers) {
            // Check if this layer matches the suffix
            if (this.getLayerSuffix(layer.name) === suffix) {
                result.push(layer);
            }
            
            // If this is a group layer, recursively search its children
            if (layer.type === 'group' && layer.layers) {
                result.push(...this.findAllLayersBySuffix(layer.layers, suffix));
            }
        }
        
        return result;
    }

    /**
     * Convert a map puzzle definition to a BridgePuzzle
     */
    createBridgePuzzle(
        definition: MapPuzzleDefinition,
        tiledMap: TiledMapData
    ): BridgePuzzle {
        const puzzleWidthInTiles = Math.ceil(definition.bounds.width / tiledMap.tilewidth);
        const puzzleHeightInTiles = Math.ceil(definition.bounds.height / tiledMap.tileheight);

        const islands = this.extractIslands(definition, tiledMap);
        const constraints = this.extractConstraints(definition, tiledMap);
        const bridgeTypes = this.extractBridgeTypes(definition);
        const maxNumBridges = this.calculateMaxBridges(definition);

        const puzzleSpec: PuzzleSpec = {
            id: definition.id,
            type: definition.metadata.type || 'overworld',
            size: {
                width: puzzleWidthInTiles,
                height: puzzleHeightInTiles
            },
            islands,
            bridgeTypes,
            constraints,
            maxNumBridges
        };

        return new BridgePuzzle(puzzleSpec);
    }

    /**
     * Create a puzzle definition from a Tiled map object
     */
    private createPuzzleDefinition(obj: MapObject): MapPuzzleDefinition {
        const metadata = this.extractObjectProperties(obj);

        return {
            id: obj.name || `puzzle_${obj.id}`,
            bounds: {
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height
            },
            metadata
        };
    }

    /**
     * Extract islands from tiles within the puzzle bounds
     */
    private extractIslands(definition: MapPuzzleDefinition, tiledMap: TiledMapData): Island[] {
        const islands: Island[] = [];

        // Check relevant tile layers for island tiles
        const islandLayers = ['terrain', 'islands', 'puzzle_elements', 'beach'] // Added 'beach' layer
            .map(name => this.findTileLayer(tiledMap, name))
            .filter(Boolean) as MapLayer[];

        console.log(`Extracting islands for ${definition.id} from ${islandLayers.length} tile layers`);
        islandLayers.forEach(layer => {
            console.log(`  Checking layer: ${layer.name}`);
        });

        for (const layer of islandLayers) {
            const layerIslands = this.extractIslandsFromLayer(layer, definition, tiledMap);
            console.log(`  Found ${layerIslands.length} islands in layer ${layer.name}`);
            islands.push(...layerIslands);
        }

        // Ensure islands have unique IDs
        islands.forEach((island, index) => {
            if (!island.id) {
                island.id = `${definition.id}_island_${index + 1}`;
            }
        });

        // Apply island constraints from constraint objects in the puzzles layer
        this.applyIslandConstraintsFromObjects(islands, definition, tiledMap);

        console.log(`Total islands found for ${definition.id}: ${islands.length}`);
        return islands;
    }

    /**
     * Extract islands from a specific tile layer
     */
    private extractIslandsFromLayer(
        layer: MapLayer,
        definition: MapPuzzleDefinition,
        tiledMap: TiledMapData
    ): Island[] {
        if (!layer.data || !layer.width || !layer.height) {
            return [];
        }

        const islands: Island[] = [];
        const { tilewidth, tileheight } = tiledMap;

        // Calculate puzzle bounds in tile coordinates
        const puzzleStartX = Math.floor(definition.bounds.x / tilewidth);
        const puzzleStartY = Math.floor(definition.bounds.y / tileheight);
        const puzzleEndX = puzzleStartX + Math.ceil(definition.bounds.width / tilewidth);
        const puzzleEndY = puzzleStartY + Math.ceil(definition.bounds.height / tileheight);

        console.log(`    Checking puzzle ${definition.id} in layer ${layer.name}`);
        console.log(`    Puzzle bounds: tile (${puzzleStartX},${puzzleStartY}) to (${puzzleEndX},${puzzleEndY})`);
        console.log(`    Looking for island tile IDs: [${this.tileConfig.islandTileIDs.join(', ')}]`);

        // Scan the puzzle area for island tiles
        let tilesChecked = 0;
        let tilesFound = 0;
        for (let y = puzzleStartY; y < puzzleEndY && y < layer.height; y++) {
            for (let x = puzzleStartX; x < puzzleEndX && x < layer.width; x++) {
                const tileIndex = y * layer.width + x;
                const tileID = layer.data[tileIndex];
                tilesChecked++;

                if (this.tileConfig.islandTileIDs.includes(tileID)) {
                    tilesFound++;
                    // Convert to puzzle-relative coordinates
                    const relativeX = x - puzzleStartX;
                    const relativeY = y - puzzleStartY;

                    console.log(`    Found island tile ${tileID} at world (${x},${y}) -> puzzle (${relativeX},${relativeY})`);

                    islands.push({
                        id: `island_${relativeX}_${relativeY}`,
                        x: relativeX,
                        y: relativeY
                    });
                }
            }
        }

        console.log(`    Checked ${tilesChecked} tiles, found ${tilesFound} islands`);

        return islands;
    }

    /**
     * Extract constraints from puzzle metadata and special tiles
     */
    private extractConstraints(definition: MapPuzzleDefinition, tiledMap: TiledMapData): Array<{ type: string; params?: any }> {
        const constraints: Array<{ type: string; params?: any }> = [];

        // Parse constraints from object metadata
        constraints.push(...this.parseMetadataConstraints(definition.metadata));

        // Extract constraints from special tile placements
        constraints.push(...this.extractTileConstraints(definition, tiledMap));

        // Add default constraints if none specified
        if (constraints.length === 0) {
            constraints.push({ type: 'AllBridgesPlacedConstraint' });
        }

        return constraints;
    }

    /**
     * Parse constraint specifications from puzzle metadata
     */
    private parseMetadataConstraints(metadata: Record<string, string>): Array<{ type: string; params?: any }> {
        const constraints: Array<{ type: string; params?: any }> = [];

        // Parse constraints="AllBridgesPlaced,NoCrossing" format
        if (metadata.constraints) {
            const constraintTypes = metadata.constraints.split(',').map(s => s.trim());
            for (const type of constraintTypes) {
                constraints.push({ type: `${type}Constraint` });
            }
        }

        // Parse specific constraint parameters
        if (metadata.max_bridges_per_island) {
            constraints.push({
                type: 'IslandBridgeCountConstraint',
                params: { maxBridges: parseInt(metadata.max_bridges_per_island) }
            });
        }

        return constraints;
    }

    /**
     * Extract constraints from special tiles within puzzle bounds
     */
    private extractTileConstraints(definition: MapPuzzleDefinition, tiledMap: TiledMapData): Array<{ type: string; params?: any }> {
        const constraints: Array<{ type: string; params?: any }> = [];

        const constraintLayer = this.findTileLayer(tiledMap, 'constraints');
        if (!constraintLayer || !constraintLayer.data) {
            return constraints;
        }

        // Scan constraint layer for special tiles
        const { tilewidth, tileheight } = tiledMap;
        const puzzleStartX = Math.floor(definition.bounds.x / tilewidth);
        const puzzleStartY = Math.floor(definition.bounds.y / tileheight);
        const puzzleEndX = puzzleStartX + Math.ceil(definition.bounds.width / tilewidth);
        const puzzleEndY = puzzleStartY + Math.ceil(definition.bounds.height / tileheight);

        const constraintPoints: Array<{ x: number; y: number; type: string }> = [];

        if (constraintLayer.width && constraintLayer.height) {
            for (let y = puzzleStartY; y < puzzleEndY && y < constraintLayer.height; y++) {
                for (let x = puzzleStartX; x < puzzleEndX && x < constraintLayer.width; x++) {
                    const tileIndex: number = y * constraintLayer.width + x;
                    const tileID = constraintLayer.data[tileIndex];

                    const constraintType = this.tileConfig.constraintTileIDs[tileID];
                    if (constraintType) {
                        constraintPoints.push({
                            x: x - puzzleStartX,
                            y: y - puzzleStartY,
                            type: constraintType
                        });
                    }
                }
            }
        }

        // Convert constraint points to constraint specs
        for (const point of constraintPoints) {
            if (point.type === 'bridge_count_2') {
                constraints.push({
                    type: 'MustTouchAHorizontalBridge',
                    params: { position: { x: point.x, y: point.y } }
                });
            } else if (point.type === 'bridge_count_3') {
                constraints.push({
                    type: 'MustTouchAVerticalBridge',
                    params: { position: { x: point.x, y: point.y } }
                });
            }
            // Add more constraint type mappings as needed
        }

        return constraints;
    }

    /**
     * Extract bridge type specifications from puzzle metadata
     */
    private extractBridgeTypes(definition: MapPuzzleDefinition): Array<{ id: string; colour?: string; length?: number; count?: number; width?: number; style?: string }> {
        const bridgeTypes: Array<{ id: string; colour?: string; length?: number; count?: number; width?: number; style?: string }> = [];
        const metadata = definition.metadata;

        // Parse bridges="3,3,3" or "3, 3, 3" format (common TMX format)
        if (metadata.bridges) {
            const lengths = metadata.bridges.split(',').map(s => parseInt(s.trim()));
            const lengthCounts = this.countOccurrences(lengths);

            for (const [length, count] of lengthCounts) {
                bridgeTypes.push({
                    id: `fixed_${length}`,
                    colour: metadata.bridge_colour || '#8B4513',
                    length,
                    count,
                    width: 1,
                    style: 'wooden'
                });
            }
        }
        // Fallback: Parse bridge_lengths="4,3,3,2,2,2" format (legacy)
        else if (metadata.bridge_lengths) {
            const lengths = metadata.bridge_lengths.split(',').map(s => parseInt(s.trim()));
            const lengthCounts = this.countOccurrences(lengths);

            for (const [length, count] of lengthCounts) {
                bridgeTypes.push({
                    id: `fixed_${length}`,
                    colour: metadata.bridge_colour || '#8B4513',
                    length,
                    count,
                    width: 1,
                    style: 'wooden'
                });
            }
        }

        // Parse variable_bridges="rope:2,chain:1" format
        if (metadata.variable_bridges) {
            const specs = metadata.variable_bridges.split(',');
            for (const spec of specs) {
                const [typeId, countStr] = spec.split(':');
                bridgeTypes.push({
                    id: typeId.trim(),
                    colour: metadata.bridge_colour || '#8B4513',
                    count: parseInt(countStr.trim()),
                    width: 1,
                    style: typeId.trim()
                });
            }
        }

        // Default bridge type if none specified
        if (bridgeTypes.length === 0) {
            bridgeTypes.push({
                id: 'basic',
                colour: '#8B4513',
                count: 10,
                width: 1
            });
        }

        return bridgeTypes;
    }

    /**
     * Calculate maximum number of bridges from metadata or bridge types
     */
    private calculateMaxBridges(definition: MapPuzzleDefinition): number {
        const metadata = definition.metadata;

        if (metadata.max_bridges) {
            return parseInt(metadata.max_bridges);
        }

        // Sum up all bridge counts from bridge types
        let totalBridges = 0;

        if (metadata.bridge_lengths) {
            totalBridges += metadata.bridge_lengths.split(',').length;
        }

        if (metadata.variable_bridges) {
            const specs = metadata.variable_bridges.split(',');
            for (const spec of specs) {
                const [, countStr] = spec.split(':');
                totalBridges += parseInt(countStr.trim() || '0');
            }
        }

        return totalBridges || 10; // Default fallback
    }

    /**
     * Find an object layer by name, searching recursively through groups
     */
    private findObjectLayer(tiledMap: TiledMapData, layerName: string): MapLayer | null {
        return this.findLayerByName(tiledMap.layers, layerName, 'objectgroup');
    }

    /**
     * Find a tile layer by name, searching recursively through groups
     */
    private findTileLayer(tiledMap: TiledMapData, layerName: string): MapLayer | null {
        return this.findLayerByName(tiledMap.layers, layerName, 'tilelayer');
    }

    /**
     * Recursively find a layer by name and type
     */
    private findLayerByName(layers: MapLayer[], layerName: string, layerType: 'tilelayer' | 'objectgroup'): MapLayer | null {
        for (const layer of layers) {
            // Check if this layer matches
            if (layer.type === layerType && layer.name === layerName) {
                return layer;
            }
            
            // If this is a group layer, recursively search its children
            if (layer.type === 'group' && layer.layers) {
                const found = this.findLayerByName(layer.layers, layerName, layerType);
                if (found) return found;
            }
        }
        
        return null;
    }

    /**
     * Extract properties from a Tiled map object
     */
    private extractObjectProperties(obj: MapObject): Record<string, string> {
        const properties: Record<string, string> = {};

        if (obj.properties) {
            // Handle both formats: array (from JSON export) and object (from TMX conversion)
            if (Array.isArray(obj.properties)) {
                for (const prop of obj.properties) {
                    properties[prop.name] = String(prop.value);
                }
            } else {
                // Handle object format from TMX conversion
                for (const [key, value] of Object.entries(obj.properties)) {
                    properties[key] = String(value);
                }
            }
        }

        return properties;
    }

    /**
     * Count occurrences of each value in an array
     */
    private countOccurrences<T>(array: T[]): Map<T, number> {
        const counts = new Map<T, number>();
        for (const item of array) {
            counts.set(item, (counts.get(item) || 0) + 1);
        }
        return counts;
    }

    /**
     * Find and apply island constraints from constraint objects in all puzzles layers
     */
    private applyIslandConstraintsFromObjects(
        islands: Island[],
        definition: MapPuzzleDefinition,
        tiledMap: TiledMapData
    ): void {
        // Find all puzzles object layers, including those nested in groups
        const puzzleLayers = this.findAllLayersBySuffix(tiledMap.layers, 'puzzles').filter(
            layer => layer.type === 'objectgroup'
        );

        if (puzzleLayers.length === 0) {
            return;
        }

        // Find constraint objects within this puzzle's bounds
        const { tilewidth, tileheight } = tiledMap;
        const puzzleStartX = Math.floor(definition.bounds.x / tilewidth);
        const puzzleStartY = Math.floor(definition.bounds.y / tileheight);

        for (const puzzleLayer of puzzleLayers) {
            if (!puzzleLayer.objects) continue;

            const constraintObjects = puzzleLayer.objects.filter(obj => {
                const props = this.extractObjectProperties(obj);
                if (props.constraint !== 'true') return false;

                // Check if constraint is within this puzzle's bounds
                const objTileX = Math.floor(obj.x / tilewidth);
                const objTileY = Math.floor(obj.y / tileheight);
                const relativeTileX = objTileX - puzzleStartX;
                const relativeTileY = objTileY - puzzleStartY;

                const puzzleWidthInTiles = Math.ceil(definition.bounds.width / tilewidth);
                const puzzleHeightInTiles = Math.ceil(definition.bounds.height / tileheight);

                return relativeTileX >= 0 && relativeTileX < puzzleWidthInTiles &&
                    relativeTileY >= 0 && relativeTileY < puzzleHeightInTiles;
            });

            console.log(`Found ${constraintObjects.length} constraint objects in layer "${puzzleLayer.name}" for puzzle ${definition.id}`);

            // Apply constraints to matching islands
            for (const constraintObj of constraintObjects) {
                const objTileX = Math.floor(constraintObj.x / tilewidth);
                const objTileY = Math.floor(constraintObj.y / tileheight);
                const relativeTileX = objTileX - puzzleStartX;
                const relativeTileY = objTileY - puzzleStartY;

                // Find island at this position
                const island = islands.find(i => i.x === relativeTileX && i.y === relativeTileY);
                if (!island) {
                    console.warn(`Constraint object at puzzle-relative (${relativeTileX}, ${relativeTileY}) has no matching island`);
                    continue;
                }

                // Parse constraint properties
                const props = this.extractObjectProperties(constraintObj);
                const constraints: string[] = [];

                // Check for num_bridges property
                if (props.num_bridges) {
                    const numBridges = parseInt(props.num_bridges);
                    if (!isNaN(numBridges)) {
                        constraints.push(`num_bridges=${numBridges}`);
                        console.log(`Applied num_bridges=${numBridges} constraint to island ${island.id}`);
                    }
                }

                // Add constraints to island
                if (constraints.length > 0) {
                    island.constraints = island.constraints || [];
                    island.constraints.push(...constraints);
                }
            }
        }
    }
}