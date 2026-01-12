import { SeriesFactory } from '@model/series/SeriesFactory';
import { MemoryProgressStore } from '@model/series/SeriesLoaders';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { PuzzleLoader } from '@model/series/SeriesFactory';

// Mock puzzle loader for testing
class MockPuzzleLoader implements PuzzleLoader {
    private puzzleData: Map<string, any> = new Map();

    addMockPuzzle(filePath: string, puzzleData: any) {
        this.puzzleData.set(filePath, puzzleData);
    }

    async loadPuzzleFromFile(filePath: string): Promise<BridgePuzzle> {
        const data = this.puzzleData.get(filePath);
        if (!data) {
            throw new Error(`Mock puzzle not found: ${filePath}`);
        }
        return this.loadPuzzleFromData(data);
    }

    loadPuzzleFromData(data: any): BridgePuzzle {
        // Create a minimal valid puzzle spec for testing
        const spec = {
            id: data.id || 'test-puzzle',
            size: data.size || { width: 5, height: 5 },
            islands: data.islands || [],
            bridgeTypes: data.bridgeTypes || [{ id: 'basic', count: 10 }],
            constraints: data.constraints || [],
            maxNumBridges: data.maxNumBridges || 10
        };
        return new BridgePuzzle(spec);
    }
}

// Simple test runner functions
function testSeriesFactoryEmbeddedFormat() {
    console.log('Testing SeriesFactory with embedded format...');

    const mockLoader = new MockPuzzleLoader();
    const progressStore = new MemoryProgressStore();
    const factory = new SeriesFactory(mockLoader, progressStore);

    const embeddedSeriesJson = {
        id: 'embedded-series',
        title: 'Embedded Test Series',
        description: 'A test series with embedded puzzle data',
        puzzles: [
            {
                id: 'puzzle1',
                title: 'First Puzzle',
                puzzleData: {
                    id: 'puzzle1',
                    size: { width: 3, height: 3 },
                    islands: [{ id: 'island1', x: 1, y: 1 }],
                    bridgeTypes: [{ id: 'basic', count: 5 }],
                    constraints: [],
                    maxNumBridges: 5
                },
                requiredPuzzles: []
            },
            {
                id: 'puzzle2',
                title: 'Second Puzzle',
                puzzleData: {
                    id: 'puzzle2',
                    size: { width: 4, height: 4 },
                    islands: [{ id: 'island1', x: 2, y: 2 }],
                    bridgeTypes: [{ id: 'basic', count: 8 }],
                    constraints: [],
                    maxNumBridges: 8
                },
                requiredPuzzles: ['puzzle1']
            }
        ]
    };

    // Test series creation
    const seriesPromise = factory.createFromJson(embeddedSeriesJson);

    seriesPromise.then(series => {
        assert(series.id === 'embedded-series', 'Series ID should match');
        assert(series.title === 'Embedded Test Series', 'Series title should match');

        const entries = series.getPuzzleEntries();
        assert(entries.length === 2, 'Should have 2 puzzle entries');
        assert(entries[0].id === 'puzzle1', 'First puzzle ID should be correct');
        assert(entries[1].id === 'puzzle2', 'Second puzzle ID should be correct');
        assert(entries[0].requiredPuzzles.length === 0, 'First puzzle should have no requirements');
        assert(entries[1].requiredPuzzles.length === 1, 'Second puzzle should have 1 requirement');

        console.log('✓ SeriesFactory embedded format tests passed');

        // Test loading individual puzzles
        return Promise.all([
            factory.loadPuzzle(embeddedSeriesJson, 'puzzle1'),
            factory.loadPuzzle(embeddedSeriesJson, 'puzzle2'),
            factory.loadPuzzle(embeddedSeriesJson, 'nonexistent')
        ]);
    }).then(([puzzle1, puzzle2, nonexistent]) => {
        assert(puzzle1 !== null, 'Should load puzzle1');
        assert(puzzle2 !== null, 'Should load puzzle2');
        assert(nonexistent === null, 'Should return null for nonexistent puzzle');

        if (puzzle1) {
            assert(puzzle1.id === 'puzzle1', 'Loaded puzzle should have correct ID');
            assert(puzzle1.width === 3, 'Loaded puzzle should have correct width');
        }

        console.log('✓ SeriesFactory puzzle loading tests passed');
    }).catch(error => {
        console.error('❌ SeriesFactory embedded format test failed:', error);
    });
}

function testSeriesFactoryReferencedFormat() {
    console.log('Testing SeriesFactory with referenced format...');

    const mockLoader = new MockPuzzleLoader();

    // Add mock puzzles to the loader
    mockLoader.addMockPuzzle('puzzles/ref1.json', {
        id: 'ref-puzzle-1',
        size: { width: 5, height: 5 },
        islands: [{ id: 'island1', x: 2, y: 2 }],
        bridgeTypes: [{ id: 'basic', count: 10 }],
        constraints: [],
        maxNumBridges: 10
    });

    mockLoader.addMockPuzzle('puzzles/ref2.json', {
        id: 'ref-puzzle-2',
        size: { width: 6, height: 6 },
        islands: [{ id: 'island1', x: 3, y: 3 }],
        bridgeTypes: [{ id: 'basic', count: 12 }],
        constraints: [],
        maxNumBridges: 12
    });

    const progressStore = new MemoryProgressStore();
    const factory = new SeriesFactory(mockLoader, progressStore);

    const referencedSeriesJson = {
        id: 'referenced-series',
        title: 'Referenced Test Series',
        description: 'A test series with file references',
        puzzleRefs: [
            {
                puzzleFile: 'puzzles/ref1.json',
                title: 'Referenced Puzzle 1',
                unlocked: true,
                requiredPuzzles: []
            },
            {
                puzzleFile: 'puzzles/ref2.json',
                title: 'Referenced Puzzle 2',
                unlocked: false,
                requiredPuzzles: ['ref1']
            }
        ]
    };

    // Test series creation
    const seriesPromise = factory.createFromJson(referencedSeriesJson);

    seriesPromise.then(series => {
        assert(series.id === 'referenced-series', 'Series ID should match');
        assert(series.title === 'Referenced Test Series', 'Series title should match');

        const entries = series.getPuzzleEntries();
        assert(entries.length === 2, 'Should have 2 puzzle entries');
        assert(entries[0].id === 'ref1', 'First puzzle ID should be extracted from filename');
        assert(entries[1].id === 'ref2', 'Second puzzle ID should be extracted from filename');

        console.log('✓ SeriesFactory referenced format tests passed');

        // Test loading individual puzzles by extracted ID
        return Promise.all([
            factory.loadPuzzle(referencedSeriesJson, 'ref1'),
            factory.loadPuzzle(referencedSeriesJson, 'ref2')
        ]);
    }).then(([puzzle1, puzzle2]) => {
        assert(puzzle1 !== null, 'Should load ref1 puzzle');
        assert(puzzle2 !== null, 'Should load ref2 puzzle');

        if (puzzle1) {
            assert(puzzle1.id === 'ref-puzzle-1', 'Loaded puzzle should have correct original ID');
            assert(puzzle1.width === 5, 'Loaded puzzle should have correct width');
        }

        if (puzzle2) {
            assert(puzzle2.id === 'ref-puzzle-2', 'Loaded puzzle should have correct original ID');
            assert(puzzle2.width === 6, 'Loaded puzzle should have correct width');
        }

        console.log('✓ SeriesFactory referenced puzzle loading tests passed');
    }).catch(error => {
        console.error('❌ SeriesFactory referenced format test failed:', error);
    });
}

function testProgressPersistence() {
    console.log('Testing progress persistence...');

    const mockLoader = new MockPuzzleLoader();
    const progressStore = new MemoryProgressStore();
    const factory = new SeriesFactory(mockLoader, progressStore);

    const seriesJson = {
        id: 'progress-test-series',
        title: 'Progress Test Series',
        description: 'Testing progress persistence',
        puzzles: [
            {
                id: 'puzzle1',
                title: 'First Puzzle',
                puzzleData: { id: 'puzzle1', maxNumBridges: 5 },
                requiredPuzzles: []
            }
        ]
    };

    // Create series and modify progress
    const seriesPromise = factory.createFromJson(seriesJson);

    seriesPromise.then(series1 => {
        // Complete a puzzle to change progress
        series1.completePuzzle('puzzle1');

        const progress = series1.getProgress();
        assert(progress.completedPuzzles.has('puzzle1'), 'Puzzle should be completed');

        // Save progress manually to the store
        return progressStore.saveProgress(progress).then(() => {
            // Create a new series with the same ID to test if progress is loaded
            return factory.createFromJson(seriesJson);
        });
    }).then(series2 => {
        const progress2 = series2.getProgress();
        assert(progress2.completedPuzzles.has('puzzle1'), 'Progress should be loaded from store');

        console.log('✓ Progress persistence tests passed');
    }).catch(error => {
        console.error('❌ Progress persistence test failed:', error);
    });
}

// Simple assertion function
function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Run tests
export async function runSeriesFactoryTests() {
    try {
        await testSeriesFactoryEmbeddedFormat();
        await testSeriesFactoryReferencedFormat();
        await testProgressPersistence();
        console.log('🎉 All SeriesFactory tests completed successfully');
        return true;
    } catch (error) {
        console.error('❌ SeriesFactory test failed:', error);
        return false;
    }
}

// Auto-run tests if this module is executed directly
if (typeof window === 'undefined') {
    runSeriesFactoryTests();
}