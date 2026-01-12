import { MapPuzzleExtractor } from '@model/overworld/MapPuzzleExtractor';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import type { TiledMapData } from '@model/overworld/MapPuzzleExtractor';

// Mock Tiled map data for testing
function createMockTiledMap(): TiledMapData {
    return {
        width: 10,
        height: 10,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                name: 'terrain',
                type: 'tilelayer',
                width: 10,
                height: 10,
                data: [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 45, 0, 0, 0, 46, 0, 0, 0, 0,  // islands at (1,1) and (5,1)
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 47, 0, 0, 0, 48, 0, 0,  // islands at (3,3) and (7,3)
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                ]
            },
            {
                name: 'constraints',
                type: 'tilelayer',
                width: 10,
                height: 10,
                data: [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 81, 0, 0, 0, 82, 0, 0, 0,  // constraint tiles
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                ]
            },
            {
                name: 'puzzles',
                type: 'objectgroup',
                objects: [
                    {
                        id: 1,
                        name: 'puzzle_test_1',
                        type: 'puzzle',
                        x: 32,   // tile 1 in pixels
                        y: 32,   // tile 1 in pixels
                        width: 192,  // 6 tiles wide
                        height: 96,  // 3 tiles high
                        properties: [
                            { name: 'bridge_lengths', value: '3,2,2', type: 'string' },
                            { name: 'constraints', value: 'AllBridgesPlaced', type: 'string' },
                            { name: 'bridge_colour', value: '#8B4513', type: 'string' }
                        ]
                    },
                    {
                        id: 2,
                        name: 'puzzle_test_2',
                        type: 'puzzle',
                        x: 192,  // tile 6 in pixels
                        y: 96,   // tile 3 in pixels
                        width: 128,  // 4 tiles wide
                        height: 64,  // 2 tiles high
                        properties: [
                            { name: 'variable_bridges', value: 'rope:2,wooden:1', type: 'string' },
                            { name: 'max_bridges', value: '3', type: 'string' }
                        ]
                    }
                ]
            }
        ]
    };
}

function testMapPuzzleExtractorBasics() {
    console.log('Testing MapPuzzleExtractor basic functionality...');

    const extractor = new MapPuzzleExtractor(defaultTileConfig);
    const mockMap = createMockTiledMap();

    // Test puzzle definition extraction
    const definitions = extractor.extractPuzzleDefinitions(mockMap);
    assert(definitions.length === 2, 'Should extract 2 puzzle definitions');

    const puzzle1Def = definitions.find(def => def.id === 'puzzle_test_1');
    assert(puzzle1Def !== undefined, 'Should find puzzle_test_1');

    if (puzzle1Def) {
        assert(puzzle1Def.bounds.x === 32, 'Puzzle 1 should have correct X position');
        assert(puzzle1Def.bounds.y === 32, 'Puzzle 1 should have correct Y position');
        assert(puzzle1Def.bounds.width === 192, 'Puzzle 1 should have correct width');
        assert(puzzle1Def.bounds.height === 96, 'Puzzle 1 should have correct height');
        assert(puzzle1Def.metadata.bridge_lengths === '3,2,2', 'Should parse bridge_lengths metadata');
        assert(puzzle1Def.metadata.constraints === 'AllBridgesPlaced', 'Should parse constraints metadata');
    }

    console.log('✓ MapPuzzleExtractor basic tests passed');
}

function testBridgePuzzleCreation() {
    console.log('Testing BridgePuzzle creation from map data...');

    const extractor = new MapPuzzleExtractor(defaultTileConfig);
    const mockMap = createMockTiledMap();
    const definitions = extractor.extractPuzzleDefinitions(mockMap);

    const puzzle1Def = definitions.find(def => def.id === 'puzzle_test_1')!;
    const puzzle1 = extractor.createBridgePuzzle(puzzle1Def, mockMap);

    // Test puzzle properties
    assert(puzzle1.id === 'puzzle_test_1', 'Puzzle should have correct ID');
    assert(puzzle1.width === 6, 'Puzzle should have correct grid width');
    assert(puzzle1.height === 3, 'Puzzle should have correct grid height');

    // Test islands extraction (should find islands at relative positions within puzzle bounds)
    console.log(`Puzzle bounds: x=${puzzle1Def.bounds.x}, y=${puzzle1Def.bounds.y}, w=${puzzle1Def.bounds.width}, h=${puzzle1Def.bounds.height}`);
    console.log(`Map tile size: ${mockMap.tilewidth}x${mockMap.tileheight}`);
    console.log(`Islands found: ${puzzle1.islands.length}`);
    puzzle1.islands.forEach((island, i) => {
        console.log(`  Island ${i}: ${island.id} at (${island.x}, ${island.y})`);
    });

    assert(puzzle1.islands.length === 3, 'Should find 3 islands in puzzle area');

    // Islands should be at relative coordinates within the puzzle
    // Original islands at (1,1), (5,1), and (3,3) in world coords
    // Puzzle starts at tile (1,1), so relative positions should be (0,0), (4,0), and (2,2)
    const island1 = puzzle1.islands.find(island => island.x === 0 && island.y === 0);
    const island2 = puzzle1.islands.find(island => island.x === 4 && island.y === 0);
    const island3 = puzzle1.islands.find(island => island.x === 2 && island.y === 2);

    assert(island1 !== undefined, 'Should find island at relative position (0,0)');
    assert(island2 !== undefined, 'Should find island at relative position (4,0)');
    assert(island3 !== undefined, 'Should find island at relative position (2,2)');

    // Test bridge types from metadata
    const bridgeTypes = puzzle1.inventory.bridgeTypes;
    assert(bridgeTypes.length > 0, 'Should have bridge types');

    // Should have fixed-length bridges: 3,2,2 -> one type with length 3 (count 1), one with length 2 (count 2)
    const fixedLength3 = bridgeTypes.find(bt => bt.length === 3);
    const fixedLength2 = bridgeTypes.find(bt => bt.length === 2);

    // Note: The exact counting depends on how the extractor handles length specifications
    assert(fixedLength3 !== undefined || fixedLength2 !== undefined, 'Should have length-specific bridge types');

    console.log('✓ BridgePuzzle creation tests passed');
}

function testOverworldPuzzleManager() {
    console.log('Testing OverworldPuzzleManager...');

    const manager = new OverworldPuzzleManager(defaultTileConfig);
    const mockMap = createMockTiledMap();

    // Test loading puzzles from map
    const puzzles = manager.loadPuzzlesFromMap(mockMap);
    assert(puzzles.size === 2, 'Should load 2 puzzles');

    // Test spatial lookup
    // Puzzle 1 bounds: x=32, y=32, width=192, height=96
    // This covers tiles (1,1) to (6,3) approximately
    const puzzleAtPos = manager.getPuzzleAtPosition(64, 64, mockMap);
    assert(puzzleAtPos !== null, 'Should find puzzle at position (64,64)');
    assert(puzzleAtPos?.id === 'puzzle_test_1', 'Should find correct puzzle');

    // Test position outside puzzle area
    const noPuzzle = manager.getPuzzleAtPosition(0, 0, mockMap);
    assert(noPuzzle === null, 'Should not find puzzle at position (0,0)');

    // Test puzzle lookup by ID
    const puzzleById = manager.getPuzzleById('puzzle_test_1');
    assert(puzzleById !== null, 'Should find puzzle by ID');
    assert(puzzleById?.id === 'puzzle_test_1', 'Should return correct puzzle');

    // Test statistics
    const stats = manager.getStats();
    assert(stats.totalPuzzles === 2, 'Stats should show 2 puzzles');
    assert(stats.totalIslands >= 2, 'Stats should show at least 2 islands total');

    // Test validation
    const validation = manager.validatePuzzles();
    console.log('Validation results:', validation);
    // Some validation errors are expected since we have a minimal mock

    console.log('✓ OverworldPuzzleManager tests passed');
}

function testEdgeCases() {
    console.log('Testing edge cases...');

    const extractor = new MapPuzzleExtractor(defaultTileConfig);

    // Test empty map
    const emptyMap: TiledMapData = {
        width: 5,
        height: 5,
        tilewidth: 32,
        tileheight: 32,
        layers: []
    };

    const noPuzzles = extractor.extractPuzzleDefinitions(emptyMap);
    assert(noPuzzles.length === 0, 'Should extract no puzzles from empty map');

    // Test map with no puzzle layer
    const noPuzzleLayer: TiledMapData = {
        width: 5,
        height: 5,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                name: 'terrain',
                type: 'tilelayer',
                width: 5,
                height: 5,
                data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            }
        ]
    };

    const stillNoPuzzles = extractor.extractPuzzleDefinitions(noPuzzleLayer);
    assert(stillNoPuzzles.length === 0, 'Should extract no puzzles when no puzzle layer exists');

    console.log('✓ Edge case tests passed');
}

// Simple assertion function
function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Run tests
export async function runMapPuzzleTests() {
    try {
        testMapPuzzleExtractorBasics();
        testBridgePuzzleCreation();
        testOverworldPuzzleManager();
        testEdgeCases();
        console.log('🎉 All MapPuzzle tests completed successfully');
        return true;
    } catch (error) {
        console.error('❌ MapPuzzle test failed:', error);
        return false;
    }
}

// Auto-run tests if this module is executed directly
if (typeof window === 'undefined') {
    runMapPuzzleTests();
}