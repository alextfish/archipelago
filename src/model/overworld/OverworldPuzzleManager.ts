import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { MapPuzzleExtractor } from './MapPuzzleExtractor';
import type { MapPuzzleDefinition, TileLayerConfig, TiledMapData } from './MapPuzzleExtractor';

/**
 * Manages puzzles extracted from overworld Tiled maps
 * Handles loading, caching, and spatial lookup of puzzles
 */
export class OverworldPuzzleManager {
    private readonly extractor: MapPuzzleExtractor;
    private readonly puzzleCache = new Map<string, BridgePuzzle>();
    private readonly definitionCache = new Map<string, MapPuzzleDefinition>();
    private readonly spatialIndex = new Map<string, string>(); // "x,y" -> puzzleId

    constructor(tileConfig: TileLayerConfig) {
        this.extractor = new MapPuzzleExtractor(tileConfig);
    }

    /**
     * Load all puzzles from a Tiled map and build spatial index
     */
    loadPuzzlesFromMap(tiledMapData: TiledMapData): Map<string, BridgePuzzle> {
        console.log(`Loading puzzles from map (${tiledMapData.width}x${tiledMapData.height})`);

        const definitions = this.extractor.extractPuzzleDefinitions(tiledMapData);
        console.log(`Found ${definitions.length} puzzle definitions`);

        const puzzles = new Map<string, BridgePuzzle>();

        for (const definition of definitions) {
            try {
                const puzzle = this.extractor.createBridgePuzzle(definition, tiledMapData);
                puzzles.set(puzzle.id, puzzle);
                this.puzzleCache.set(puzzle.id, puzzle);
                this.definitionCache.set(puzzle.id, definition);

                // Build spatial index for quick position-based lookup
                this.indexPuzzleArea(definition, tiledMapData);

                console.log(`✓ Created puzzle "${puzzle.id}" (${puzzle.width}x${puzzle.height}) with ${puzzle.islands.length} islands`);
            } catch (error) {
                console.warn(`Failed to create puzzle ${definition.id}:`, error);
            }
        }

        console.log(`Loaded ${puzzles.size} puzzles successfully`);
        return puzzles;
    }

    /**
     * Get puzzle at specific overworld coordinates (in pixels)
     */
    getPuzzleAtPosition(x: number, y: number, tiledMapData: TiledMapData): BridgePuzzle | null {
        // Convert pixel coordinates to tile coordinates
        const tileX = Math.floor(x / tiledMapData.tilewidth);
        const tileY = Math.floor(y / tiledMapData.tileheight);

        return this.getPuzzleAtTilePosition(tileX, tileY);
    }

    /**
     * Get puzzle at specific tile coordinates
     */
    getPuzzleAtTilePosition(tileX: number, tileY: number): BridgePuzzle | null {
        const key = `${tileX},${tileY}`;
        const puzzleId = this.spatialIndex.get(key);

        return puzzleId ? this.puzzleCache.get(puzzleId) || null : null;
    }

    /**
     * Get puzzle by ID
     */
    getPuzzleById(puzzleId: string): BridgePuzzle | null {
        return this.puzzleCache.get(puzzleId) || null;
    }

    /**
     * Get puzzle definition (metadata) by ID
     */
    getPuzzleDefinitionById(puzzleId: string): MapPuzzleDefinition | null {
        return this.definitionCache.get(puzzleId) || null;
    }

    /**
     * Get all loaded puzzles
     */
    getAllPuzzles(): Map<string, BridgePuzzle> {
        return new Map(this.puzzleCache);
    }

    /**
     * Get all puzzle IDs
     */
    getAllPuzzleIds(): string[] {
        return Array.from(this.puzzleCache.keys());
    }

    /**
     * Check if a puzzle exists at the given position
     */
    hasPuzzleAtPosition(x: number, y: number, tiledMapData: TiledMapData): boolean {
        return this.getPuzzleAtPosition(x, y, tiledMapData) !== null;
    }

    /**
     * Get puzzle bounds in pixel coordinates
     */
    getPuzzleBounds(puzzleId: string): { x: number; y: number; width: number; height: number } | null {
        const definition = this.definitionCache.get(puzzleId);
        return definition ? definition.bounds : null;
    }

    /**
     * Clear all cached puzzles and spatial index
     */
    clearCache(): void {
        this.puzzleCache.clear();
        this.definitionCache.clear();
        this.spatialIndex.clear();
        console.log('Cleared overworld puzzle cache');
    }

    /**
     * Get statistics about loaded puzzles
     */
    getStats(): {
        totalPuzzles: number;
        totalIslands: number;
        averageIslandsPerPuzzle: number;
        spatialIndexSize: number;
    } {
        const puzzles = Array.from(this.puzzleCache.values());
        const totalIslands = puzzles.reduce((sum, puzzle) => sum + puzzle.islands.length, 0);

        return {
            totalPuzzles: puzzles.length,
            totalIslands,
            averageIslandsPerPuzzle: puzzles.length > 0 ? totalIslands / puzzles.length : 0,
            spatialIndexSize: this.spatialIndex.size
        };
    }

    /**
     * Validate that all puzzles are properly formed
     */
    validatePuzzles(): Array<{ puzzleId: string; errors: string[] }> {
        const validationResults: Array<{ puzzleId: string; errors: string[] }> = [];

        for (const [puzzleId, puzzle] of this.puzzleCache) {
            const errors: string[] = [];

            // Check for minimum islands
            if (puzzle.islands.length === 0) {
                errors.push('No islands found');
            }

            // Check for valid bridge inventory
            if (puzzle.inventory.bridgeTypes.length === 0) {
                errors.push('No bridge types available');
            }

            // Check for valid constraints
            if (puzzle.constraints.length === 0) {
                errors.push('No constraints defined');
            }

            // Check island positions are within puzzle bounds
            for (const island of puzzle.islands) {
                if (island.x < 0 || island.x >= puzzle.width || island.y < 0 || island.y >= puzzle.height) {
                    errors.push(`Island ${island.id} is outside puzzle bounds (${island.x}, ${island.y})`);
                }
            }

            if (errors.length > 0) {
                validationResults.push({ puzzleId, errors });
            }
        }

        return validationResults;
    }

    /**
     * Build spatial index for a puzzle definition
     */
    private indexPuzzleArea(definition: MapPuzzleDefinition, tiledMapData: TiledMapData): void {
        const { tilewidth, tileheight } = tiledMapData;

        // Convert bounds to tile coordinates
        const startTileX = Math.floor(definition.bounds.x / tilewidth);
        const startTileY = Math.floor(definition.bounds.y / tileheight);
        const endTileX = startTileX + Math.ceil(definition.bounds.width / tilewidth);
        const endTileY = startTileY + Math.ceil(definition.bounds.height / tileheight);

        // Index all tiles within the puzzle area
        for (let y = startTileY; y < endTileY; y++) {
            for (let x = startTileX; x < endTileX; x++) {
                const key = `${x},${y}`;
                this.spatialIndex.set(key, definition.id);
            }
        }
    }
}