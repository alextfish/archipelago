import { LocalStorageProgressStore, MemoryProgressStore } from '@model/series/SeriesLoaders';
import type { SeriesProgress } from '@model/series/PuzzleSeries';

function testMemoryProgressStore() {
    console.log('Testing MemoryProgressStore...');

    const store = new MemoryProgressStore();

    const progress1: SeriesProgress = {
        seriesId: 'test-series-1',
        currentPuzzleIndex: 2,
        completedPuzzles: new Set(['puzzle1', 'puzzle2']),
        unlockedPuzzles: new Set(['puzzle1', 'puzzle2', 'puzzle3'])
    };

    const progress2: SeriesProgress = {
        seriesId: 'test-series-2',
        currentPuzzleIndex: 0,
        completedPuzzles: new Set(),
        unlockedPuzzles: new Set(['puzzle1'])
    };

    // Test saving and loading progress
    Promise.all([
        store.saveProgress(progress1),
        store.saveProgress(progress2)
    ]).then(() => {
        return Promise.all([
            store.loadProgress('test-series-1'),
            store.loadProgress('test-series-2'),
            store.loadProgress('nonexistent')
        ]);
    }).then(([loaded1, loaded2, nonexistent]) => {
        assert(loaded1 !== null, 'Should load first progress');
        assert(loaded2 !== null, 'Should load second progress');
        assert(nonexistent === null, 'Should return null for nonexistent progress');

        if (loaded1) {
            assert(loaded1.seriesId === 'test-series-1', 'Series ID should match');
            assert(loaded1.currentPuzzleIndex === 2, 'Current puzzle index should match');
            assert(loaded1.completedPuzzles.has('puzzle1'), 'Should have completed puzzle1');
            assert(loaded1.completedPuzzles.has('puzzle2'), 'Should have completed puzzle2');
            assert(!loaded1.completedPuzzles.has('puzzle3'), 'Should not have completed puzzle3');
            assert(loaded1.unlockedPuzzles.has('puzzle3'), 'Should have unlocked puzzle3');
        }

        // Test clear functionality
        store.clearProgress('test-series-1');
        return store.loadProgress('test-series-1');
    }).then((cleared) => {
        assert(cleared === null, 'Cleared progress should return null');

        // Test clear all functionality
        store.clearAllProgress();
        const allProgress = store.getAllProgress();
        assert(allProgress.size === 0, 'All progress should be cleared');

        console.log('✓ MemoryProgressStore tests passed');
    }).catch(error => {
        console.error('❌ MemoryProgressStore test failed:', error);
    });
}

function testLocalStorageProgressStore() {
    console.log('Testing LocalStorageProgressStore...');

    // Only run if localStorage is available (e.g., in browser environment)
    if (typeof localStorage === 'undefined') {
        console.log('⚠️ Skipping LocalStorageProgressStore tests (localStorage not available)');
        return Promise.resolve();
    }

    const store = new LocalStorageProgressStore();

    const progress: SeriesProgress = {
        seriesId: 'local-test-series',
        currentPuzzleIndex: 1,
        completedPuzzles: new Set(['puzzle1']),
        unlockedPuzzles: new Set(['puzzle1', 'puzzle2'])
    };

    return store.saveProgress(progress).then(() => {
        return store.loadProgress('local-test-series');
    }).then((loaded) => {
        assert(loaded !== null, 'Should load progress from localStorage');

        if (loaded) {
            assert(loaded.seriesId === 'local-test-series', 'Series ID should match');
            assert(loaded.currentPuzzleIndex === 1, 'Current puzzle index should match');
            assert(loaded.completedPuzzles.has('puzzle1'), 'Should have completed puzzle1');
            assert(loaded.unlockedPuzzles.has('puzzle2'), 'Should have unlocked puzzle2');
            assert(loaded.completedPuzzles instanceof Set, 'completedPuzzles should be a Set');
            assert(loaded.unlockedPuzzles instanceof Set, 'unlockedPuzzles should be a Set');
        }

        // Test getting stored series IDs
        return store.getStoredSeriesIds();
    }).then((seriesIds) => {
        assert(seriesIds.includes('local-test-series'), 'Should include our test series');

        // Test clearing specific progress
        return store.clearProgress('local-test-series');
    }).then(() => {
        return store.loadProgress('local-test-series');
    }).then((cleared) => {
        assert(cleared === null, 'Cleared progress should return null');

        console.log('✓ LocalStorageProgressStore tests passed');
    }).catch(error => {
        console.error('❌ LocalStorageProgressStore test failed:', error);
    });
}

function testProgressStoreMutationSafety() {
    console.log('Testing progress store mutation safety...');

    const store = new MemoryProgressStore();

    const originalCompletedSet = new Set(['puzzle1']);
    const originalUnlockedSet = new Set(['puzzle1', 'puzzle2']);

    const originalProgress: SeriesProgress = {
        seriesId: 'mutation-test',
        currentPuzzleIndex: 0,
        completedPuzzles: originalCompletedSet,
        unlockedPuzzles: originalUnlockedSet
    };

    return store.saveProgress(originalProgress).then(() => {
        // Mutate the original sets (the interface doesn't prevent this)
        originalCompletedSet.add('puzzle999');
        originalUnlockedSet.add('puzzle999');

        // Load progress and verify it wasn't affected by mutations
        return store.loadProgress('mutation-test');
    }).then((loaded) => {
        assert(loaded !== null, 'Should load progress');

        if (loaded) {
            assert(loaded.currentPuzzleIndex === 0, 'Should preserve current puzzle index');
            assert(!loaded.completedPuzzles.has('puzzle999'), 'Should not have mutated puzzle');
            assert(!loaded.unlockedPuzzles.has('puzzle999'), 'Should not have mutated unlocked');

            // Mutate the loaded progress sets
            loaded.completedPuzzles.add('puzzle888');

            // Load again and verify the store wasn't affected
            return store.loadProgress('mutation-test');
        }

        return null;
    }).then((loaded2) => {
        if (loaded2) {
            assert(!loaded2.completedPuzzles.has('puzzle888'), 'Store should not be affected by loaded object mutation');
        }

        console.log('✓ Progress store mutation safety tests passed');
    }).catch(error => {
        console.error('❌ Progress store mutation safety test failed:', error);
    });
}

// Simple assertion function
function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Run tests
export async function runSeriesLoadersTests() {
    try {
        await testMemoryProgressStore();
        await testLocalStorageProgressStore();
        await testProgressStoreMutationSafety();
        console.log('🎉 All SeriesLoaders tests completed successfully');
        return true;
    } catch (error) {
        console.error('❌ SeriesLoaders test failed:', error);
        return false;
    }
}

// Auto-run tests if this module is executed directly
if (typeof window === 'undefined') {
    runSeriesLoadersTests();
}