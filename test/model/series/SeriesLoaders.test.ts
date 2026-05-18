import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageProgressStore, MemoryProgressStore } from '@model/series/SeriesLoaders';
import type { SeriesProgress } from '@model/series/PuzzleSeries';
import { getSeriesProgressStorageKey } from '@model/persistence/PersistenceUtils';

describe("SeriesLoaders", () => {
    beforeEach(() => {
        localStorage.clear();
    });

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

    it("should clear all localStorage-backed series progress without touching unrelated keys", async () => {
        const store = new LocalStorageProgressStore();

        await store.saveProgress({
            seriesId: 'series-a',
            currentPuzzleIndex: 0,
            completedPuzzles: new Set(['a1']),
            unlockedPuzzles: new Set(['a1', 'a2'])
        });
        await store.saveProgress({
            seriesId: 'series-b',
            currentPuzzleIndex: 1,
            completedPuzzles: new Set(['b1']),
            unlockedPuzzles: new Set(['b1', 'b2'])
        });
        localStorage.setItem('unrelated-key', 'keep-me');

        await store.clearAllProgress();

        expect(localStorage.getItem(getSeriesProgressStorageKey('series-a'))).toBeNull();
        expect(localStorage.getItem(getSeriesProgressStorageKey('series-b'))).toBeNull();
        expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
    });
});
