import { describe, expect, it } from "vitest";
import { MemoryProgressStore } from '@model/series/SeriesLoaders';
import type { SeriesProgress } from '@model/series/PuzzleSeries';

describe("SeriesLoaders", () => {
    it("should create MemoryProgressStore", () => {
        const store = new MemoryProgressStore();
        expect(store).toBeDefined();
    });

    it("should handle progress operations", async () => {
        const store = new MemoryProgressStore();
        const progress: SeriesProgress = {
            seriesId: 'test-series',
            currentPuzzleIndex: 0,
            completedPuzzles: new Set(),
            unlockedPuzzles: new Set(['puzzle1'])
        };

        await store.saveProgress(progress);
        const loaded = await store.loadProgress('test-series');
        expect(loaded).not.toBeNull();
        expect(loaded!.seriesId).toBe('test-series');
    });
});
