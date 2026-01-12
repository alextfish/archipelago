import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { MapUtils, defaultTileConfig } from '@model/overworld/MapConfig';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { TileLayerConfig } from '@model/overworld/MapPuzzleExtractor';

/**
 * Example integration showing how to use the map-based puzzle system
 * This demonstrates loading puzzles from a Tiled map and integrating with game systems
 */
export class OverworldGameManager {
    private puzzleManager: OverworldPuzzleManager;
    private currentMap: any = null;
    private activePuzzle: BridgePuzzle | null = null;

    constructor(customTileConfig?: TileLayerConfig) {
        this.puzzleManager = new OverworldPuzzleManager(customTileConfig || defaultTileConfig);
    }

    /**
     * Load an overworld map and extract all puzzles from it
     */
    async loadOverworldMap(mapPath: string): Promise<void> {
        console.log(`Loading overworld map from: ${mapPath}`);

        try {
            // Load the Tiled map
            this.currentMap = await MapUtils.loadTiledMap(mapPath);

            // Validate map structure
            const requiredLayers = ['terrain', 'puzzles'];
            const validation = MapUtils.validateMapStructure(this.currentMap, requiredLayers);

            if (!validation.valid) {
                console.warn('Missing required layers:', validation.missingLayers);
                // Continue anyway - some layers might be optional
            }

            // Show layer statistics
            const layerStats = MapUtils.getLayerStats(this.currentMap);
            console.log('Map layers:');
            layerStats.forEach(stat => {
                const extra = stat.objectCount !== undefined ? ` (${stat.objectCount} objects)` : '';
                console.log(`  ${stat.name}: ${stat.type} ${stat.size}${extra}`);
            });

            // Extract and load puzzles
            const puzzles = this.puzzleManager.loadPuzzlesFromMap(this.currentMap);
            console.log(`✓ Successfully loaded ${puzzles.size} puzzles from overworld`);

            // Show puzzle statistics
            const stats = this.puzzleManager.getStats();
            console.log(`📊 Puzzle Stats:`, stats);

            // Validate puzzles
            const validation_results = this.puzzleManager.validatePuzzles();
            if (validation_results.length > 0) {
                console.warn('Puzzle validation issues found:');
                validation_results.forEach(result => {
                    console.warn(`  ${result.puzzleId}: ${result.errors.join(', ')}`);
                });
            } else {
                console.log('✓ All puzzles passed validation');
            }

        } catch (error) {
            console.error('Failed to load overworld map:', error);
            throw error;
        }
    }

    /**
     * Check if the player is stepping on a puzzle trigger
     */
    checkPuzzleInteraction(playerX: number, playerY: number): {
        hasPuzzle: boolean;
        puzzle?: BridgePuzzle;
        puzzleId?: string;
    } {
        if (!this.currentMap) {
            return { hasPuzzle: false };
        }

        const puzzle = this.puzzleManager.getPuzzleAtPosition(playerX, playerY, this.currentMap);

        if (puzzle) {
            console.log(`Player entered puzzle area: ${puzzle.id}`);
            return {
                hasPuzzle: true,
                puzzle,
                puzzleId: puzzle.id
            };
        }

        return { hasPuzzle: false };
    }

    /**
     * Start a puzzle when player interacts with it
     */
    startPuzzle(puzzleId: string): BridgePuzzle | null {
        const puzzle = this.puzzleManager.getPuzzleById(puzzleId);

        if (!puzzle) {
            console.warn(`Puzzle not found: ${puzzleId}`);
            return null;
        }

        console.log(`Starting puzzle: ${puzzle.id}`);
        console.log(`  Size: ${puzzle.width}x${puzzle.height}`);
        console.log(`  Islands: ${puzzle.islands.length}`);
        console.log(`  Bridge types: ${puzzle.inventory.bridgeTypes.length}`);
        console.log(`  Constraints: ${puzzle.constraints.length}`);

        this.activePuzzle = puzzle;
        return puzzle;
    }

    /**
     * Complete the current puzzle and return to overworld
     */
    completePuzzle(success: boolean): void {
        if (!this.activePuzzle) {
            console.warn('No active puzzle to complete');
            return;
        }

        const puzzleId = this.activePuzzle.id;
        console.log(`Puzzle ${puzzleId} completed with ${success ? 'success' : 'failure'}`);

        // Here you would typically:
        // 1. Save puzzle completion state
        // 2. Update series progress if this puzzle is part of a series
        // 3. Unlock new areas or puzzles
        // 4. Return player to overworld

        this.activePuzzle = null;
    }

    /**
     * Get puzzle metadata for UI display
     */
    getPuzzleInfo(puzzleId: string): {
        puzzle?: BridgePuzzle;
        definition?: any;
        bounds?: { x: number; y: number; width: number; height: number };
    } {
        const puzzle = this.puzzleManager.getPuzzleById(puzzleId);
        const definition = this.puzzleManager.getPuzzleDefinitionById(puzzleId);
        const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);

        return {
            puzzle: puzzle || undefined,
            definition: definition || undefined,
            bounds: bounds || undefined
        };
    }

    /**
     * Get all available puzzles for selection UI
     */
    getAllAvailablePuzzles(): Array<{
        id: string;
        title?: string;
        difficulty?: string;
        islands: number;
        completed?: boolean;
    }> {
        const puzzles = this.puzzleManager.getAllPuzzles();
        const result: Array<{
            id: string;
            title?: string;
            difficulty?: string;
            islands: number;
            completed?: boolean;
        }> = [];

        for (const [id, puzzle] of puzzles) {
            const definition = this.puzzleManager.getPuzzleDefinitionById(id);

            result.push({
                id,
                title: definition?.metadata.title || id,
                difficulty: definition?.metadata.difficulty,
                islands: puzzle.islands.length,
                completed: false // TODO: Get from save data
            });
        }

        return result.sort((a, b) => a.id.localeCompare(b.id));
    }

    /**
     * Convert world coordinates to puzzle-relative coordinates
     */
    worldToPuzzleCoords(worldX: number, worldY: number, puzzleId: string): { x: number; y: number } | null {
        if (!this.currentMap) {
            return null;
        }

        const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);
        if (!bounds) {
            return null;
        }

        const tileX = Math.floor((worldX - bounds.x) / this.currentMap.tilewidth);
        const tileY = Math.floor((worldY - bounds.y) / this.currentMap.tileheight);

        return { x: tileX, y: tileY };
    }

    /**
     * Get debug information about the current map state
     */
    getDebugInfo(): {
        mapLoaded: boolean;
        mapSize?: string;
        totalPuzzles: number;
        activePuzzle?: string;
        stats: any;
    } {
        const stats = this.puzzleManager.getStats();

        return {
            mapLoaded: this.currentMap !== null,
            mapSize: this.currentMap ? `${this.currentMap.width}x${this.currentMap.height}` : undefined,
            totalPuzzles: stats.totalPuzzles,
            activePuzzle: this.activePuzzle?.id,
            stats
        };
    }

    /**
     * Clear all loaded map data
     */
    unloadMap(): void {
        console.log('Unloading overworld map');
        this.currentMap = null;
        this.activePuzzle = null;
        this.puzzleManager.clearCache();
    }
}

/**
 * Example usage of the overworld puzzle system with real Tiled map data
 */
export async function demonstrateOverworldPuzzles() {
    console.log('=== Overworld Puzzle System Demonstration ===');

    // Create custom tile configuration for the beach tileset
    // Tile 6 in beach tileset (firstgid=1, so tile 6 becomes global ID 6)
    const beachTileConfig: TileLayerConfig = {
        islandTileIDs: [6], // Tile 6 from beach tileset means "island"
        obstacleTileIDs: [], // Everything else treated as empty for now
        constraintTileIDs: {},
        entryPointTileIDs: []
    };

    const gameManager = new OverworldGameManager(beachTileConfig);

    try {
        // Load the real overworld.tmx file
        console.log('Loading overworld.tmx...');
        await gameManager.loadOverworldMap('resources/overworld.tmx');

        // Test the first three puzzles specifically
        const availablePuzzles = gameManager.getAllAvailablePuzzles();
        console.log(`\nFound ${availablePuzzles.length} puzzles in overworld`);

        // Find and analyze the specific puzzles
        const targetPuzzles = ['puzzle 1', 'puzzle 2', 'puzzle 3'];

        for (const puzzleName of targetPuzzles) {
            const puzzleInfo = gameManager.getPuzzleInfo(puzzleName);
            if (puzzleInfo.puzzle) {
                const puzzle = puzzleInfo.puzzle;
                console.log(`\n--- ${puzzleName.toUpperCase()} ---`);
                console.log(`Islands: ${puzzle.islands.length}`);
                console.log(`Size: ${puzzle.width}x${puzzle.height} tiles`);

                // Show island positions
                puzzle.islands.forEach((island, i) => {
                    console.log(`  Island ${i + 1}: (${island.x}, ${island.y}) id="${island.id}"`);
                });

                // Show bridge inventory (from "bridges" property)
                if (puzzle.inventory) {
                    const bridgeTypes = puzzle.inventory.bridgeTypes;
                    console.log(`Bridge types available: ${bridgeTypes.length}`);
                    bridgeTypes.forEach(bridgeType => {
                        const available = puzzle.inventory.getAvailableOfType(bridgeType.id);
                        console.log(`  ${bridgeType.id}: ${available.length} bridges (length ${bridgeType.length})`);
                    });
                } else {
                    console.log('No bridge inventory found');
                }

                // Show puzzle bounds in overworld coordinates
                if (puzzleInfo.bounds) {
                    const bounds = puzzleInfo.bounds;
                    console.log(`Overworld bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
                    console.log(`Tile bounds: (${Math.floor(bounds.x / 32)}, ${Math.floor(bounds.y / 32)}) to (${Math.floor((bounds.x + bounds.width) / 32)}, ${Math.floor((bounds.y + bounds.height) / 32)})`);
                }
            } else {
                console.log(`\n⚠️  Could not find ${puzzleName}`);
            }
        }

        // Show debug info
        const debugInfo = gameManager.getDebugInfo();
        console.log('\n--- DEBUG INFO ---');
        console.log(`Total puzzles loaded: ${debugInfo.totalPuzzles}`);
        console.log(`Map size: ${debugInfo.mapSize || 'unknown'}`);
        console.log(`Active puzzle: ${debugInfo.activePuzzle || 'none'}`);
        console.log(`Map loaded: ${debugInfo.mapLoaded}`);
        console.log(`Puzzle manager stats:`, debugInfo.stats);

        console.log('\n🎉 Real overworld demonstration completed successfully!');

    } catch (error) {
        console.error('❌ Error in demonstration:', error);
    }
}

// Auto-run demonstration if this module is executed directly
if (typeof window === 'undefined') {
    demonstrateOverworldPuzzles();
}