import { PuzzleSeries } from '@model/series/PuzzleSeries';
import type { SeriesPuzzleEntry, SeriesProgress } from '@model/series/PuzzleSeries';

// Simple test runner functions
function testPuzzleSeriesBasicOperations() {
    console.log('Testing PuzzleSeries basic operations...');

    const puzzleEntries: SeriesPuzzleEntry[] = [
        {
            id: 'puzzle1',
            title: 'First Puzzle',
            description: 'The starting puzzle',
            unlocked: false,
            completed: false,
            requiredPuzzles: []
        },
        {
            id: 'puzzle2',
            title: 'Second Puzzle',
            description: 'Requires first puzzle',
            unlocked: false,
            completed: false,
            requiredPuzzles: ['puzzle1']
        },
        {
            id: 'puzzle3',
            title: 'Third Puzzle',
            description: 'Requires first puzzle',
            unlocked: false,
            completed: false,
            requiredPuzzles: ['puzzle1']
        },
        {
            id: 'puzzle4',
            title: 'Final Puzzle',
            description: 'Requires both second and third puzzles',
            unlocked: false,
            completed: false,
            requiredPuzzles: ['puzzle2', 'puzzle3']
        }
    ];

    const initialProgress: SeriesProgress = {
        seriesId: 'test-series',
        currentPuzzleIndex: 0,
        completedPuzzles: new Set<string>(),
        unlockedPuzzles: new Set(['puzzle1'])
    };

    const series = new PuzzleSeries(
        'test-series',
        'Test Series',
        'A test puzzle series',
        puzzleEntries,
        initialProgress
    );

    // Test basic properties
    assert(series.id === 'test-series', 'Series ID should be correct');
    assert(series.title === 'Test Series', 'Series title should be correct');
    assert(series.description === 'A test puzzle series', 'Series description should be correct');
    assert(series.getCurrentPuzzleIndex() === 0, 'Initial puzzle index should be 0');

    // Test puzzle entry syncing
    const entries = series.getPuzzleEntries();
    assert(entries[0].unlocked === true, 'First puzzle should be unlocked');
    assert(entries[1].unlocked === false, 'Second puzzle should be locked');
    assert(entries[2].unlocked === false, 'Third puzzle should be locked');
    assert(entries[3].unlocked === false, 'Fourth puzzle should be locked');

    // Test current puzzle
    const currentPuzzle = series.getCurrentPuzzle();
    assert(currentPuzzle !== null, 'Should have a current puzzle');
    assert(currentPuzzle!.id === 'puzzle1', 'Current puzzle should be puzzle1');

    // Test navigation boundaries
    assert(series.canNavigateToPrevious() === false, 'Should not be able to navigate to previous at start');
    assert(series.canNavigateToNext() === false, 'Should not be able to navigate to next without completing current');

    // Test puzzle completion
    const completionResult = series.completePuzzle('puzzle1');
    assert(completionResult.success === true, 'Should successfully complete puzzle1');
    assert(completionResult.newlyUnlockedPuzzles.length === 2, 'Should unlock puzzle2 and puzzle3');
    assert(completionResult.newlyUnlockedPuzzles.includes('puzzle2'), 'Should unlock puzzle2');
    assert(completionResult.newlyUnlockedPuzzles.includes('puzzle3'), 'Should unlock puzzle3');

    // Test progress after completion
    const progress = series.getProgress();
    assert(progress.completedPuzzles.has('puzzle1'), 'puzzle1 should be marked as completed');
    assert(progress.unlockedPuzzles.has('puzzle2'), 'puzzle2 should be marked as unlocked');
    assert(progress.unlockedPuzzles.has('puzzle3'), 'puzzle3 should be marked as unlocked');

    // Test completion percentage
    assert(series.getCompletionPercentage() === 25, 'Completion percentage should be 25%');
    assert(series.isCompleted() === false, 'Series should not be completed yet');

    // Test navigation after completion
    assert(series.canNavigateToNext() === true, 'Should be able to navigate to next after completion');
    const navigateResult = series.navigateToNext();
    assert(navigateResult !== null, 'Should successfully navigate to next');
    assert(series.getCurrentPuzzleIndex() === 1, 'Should be at puzzle index 1');

    // Test requirements checking
    assert(series.areRequirementsMet('puzzle1') === true, 'puzzle1 requirements should be met (no requirements)');
    assert(series.areRequirementsMet('puzzle2') === true, 'puzzle2 requirements should be met (puzzle1 completed)');
    assert(series.areRequirementsMet('puzzle4') === false, 'puzzle4 requirements should not be met yet');

    // Test multiple completion for final puzzle
    series.completePuzzle('puzzle2');
    assert(series.areRequirementsMet('puzzle4') === false, 'puzzle4 should still not be unlocked (missing puzzle3)');

    const result3 = series.completePuzzle('puzzle3');
    assert(result3.newlyUnlockedPuzzles.includes('puzzle4'), 'Completing puzzle3 should unlock puzzle4');

    series.completePuzzle('puzzle4');
    assert(series.isCompleted() === true, 'Series should be completed');
    assert(series.getCompletionPercentage() === 100, 'Completion percentage should be 100%');

    console.log('✓ All PuzzleSeries tests passed');
}

function testPuzzleSeriesEdgeCases() {
    console.log('Testing PuzzleSeries edge cases...');

    // Test empty series (should throw)
    try {
        new PuzzleSeries('empty', 'Empty', 'Empty series', [], {
            seriesId: 'empty',
            currentPuzzleIndex: 0,
            completedPuzzles: new Set(),
            unlockedPuzzles: new Set()
        });
        assert(false, 'Empty series should throw an error');
    } catch (error) {
        assert(error instanceof Error, 'Should throw an Error');
        const errorMessage = error instanceof Error ? error.message : String(error);
        assert(errorMessage.includes('at least one puzzle'), 'Error message should mention minimum puzzles');
    }

    // Test single puzzle series
    const singlePuzzleEntries: SeriesPuzzleEntry[] = [{
        id: 'only-puzzle',
        title: 'Only Puzzle',
        unlocked: false,
        completed: false,
        requiredPuzzles: []
    }];

    const singleProgress: SeriesProgress = {
        seriesId: 'single',
        currentPuzzleIndex: 0,
        completedPuzzles: new Set(),
        unlockedPuzzles: new Set(['only-puzzle'])
    };

    const singleSeries = new PuzzleSeries('single', 'Single', 'Single puzzle', singlePuzzleEntries, singleProgress);

    assert(singleSeries.canNavigateToPrevious() === false, 'Single series should not allow previous navigation');
    assert(singleSeries.canNavigateToNext() === false, 'Single series should not allow next navigation before completion');
    assert(singleSeries.getNextPuzzle() === null, 'Should have no next puzzle');
    assert(singleSeries.getPreviousPuzzle() === null, 'Should have no previous puzzle');

    singleSeries.completePuzzle('only-puzzle');
    assert(singleSeries.isCompleted() === true, 'Single puzzle series should be completed');
    assert(singleSeries.getCompletionPercentage() === 100, 'Should be 100% complete');

    // Test invalid operations
    const result = singleSeries.completePuzzle('non-existent');
    assert(result.success === false, 'Completing non-existent puzzle should fail');
    assert(result.newlyUnlockedPuzzles.length === 0, 'Should not unlock any puzzles');

    assert(singleSeries.setCurrentPuzzleIndex(-1) === false, 'Should not set negative index');
    assert(singleSeries.setCurrentPuzzleIndex(10) === false, 'Should not set out-of-bounds index');
    assert(singleSeries.setCurrentPuzzle('non-existent') === false, 'Should not set non-existent puzzle as current');

    assert(singleSeries.getPuzzleById('non-existent') === null, 'Should return null for non-existent puzzle');
    assert(singleSeries.areRequirementsMet('non-existent') === false, 'Should return false for non-existent puzzle requirements');

    console.log('✓ All PuzzleSeries edge case tests passed');
}

// Simple assertion function
function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Run tests
export function runPuzzleSeriesTests() {
    try {
        testPuzzleSeriesBasicOperations();
        testPuzzleSeriesEdgeCases();
        console.log('🎉 All PuzzleSeries tests completed successfully');
        return true;
    } catch (error) {
        console.error('❌ PuzzleSeries test failed:', error);
        return false;
    }
}

// Auto-run tests if this module is executed directly
if (typeof window === 'undefined') {
    runPuzzleSeriesTests();
}