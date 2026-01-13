import { describe, expect, it, beforeEach } from "vitest";
import { PuzzleSeries } from '@model/series/PuzzleSeries';
import type { SeriesPuzzleEntry, SeriesProgress } from '@model/series/PuzzleSeries';

describe("PuzzleSeries", () => {
    let puzzleEntries: SeriesPuzzleEntry[];
    let initialProgress: SeriesProgress;
    let series: PuzzleSeries;

    beforeEach(() => {
        puzzleEntries = [
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
            }
        ];

        initialProgress = {
            seriesId: 'test-series',
            currentPuzzleIndex: 0,
            completedPuzzles: new Set<string>(),
            unlockedPuzzles: new Set(['puzzle1'])
        };

        series = new PuzzleSeries(
            'test-series',
            'Test Series',
            'A test puzzle series',
            puzzleEntries,
            initialProgress
        );
    });

    describe("basic properties", () => {
        it("should have correct id, title, and description", () => {
            expect(series.id).toBe('test-series');
            expect(series.title).toBe('Test Series');
            expect(series.description).toBe('A test puzzle series');
        });

        it("should start at puzzle index 0", () => {
            expect(series.getCurrentPuzzleIndex()).toBe(0);
        });
    });

    describe("puzzle completion", () => {
        it("should complete puzzle1 and unlock puzzle2", () => {
            const completionResult = series.completePuzzle('puzzle1');
            expect(completionResult.success).toBe(true);
            expect(completionResult.newlyUnlockedPuzzles).toContain('puzzle2');
        });

        it("should handle completion of non-existent puzzle", () => {
            const result = series.completePuzzle('nonexistent');
            expect(result.success).toBe(false);
            expect(result.newlyUnlockedPuzzles).toHaveLength(0);
        });
    });
});