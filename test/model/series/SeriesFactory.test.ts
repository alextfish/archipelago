import { describe, expect, it } from "vitest";
import { SeriesFactory } from '@model/series/SeriesFactory';
import { MemoryProgressStore } from '@model/series/SeriesLoaders';
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { PuzzleLoader } from '@model/series/SeriesFactory';

// Simple mock puzzle loader
class MockPuzzleLoader implements PuzzleLoader {
    async loadPuzzleFromFile(_filePath: string): Promise<BridgePuzzle> {
        throw new Error("Not implemented");
    }

    loadPuzzleFromData(_data: any): BridgePuzzle {
        throw new Error("Not implemented");
    }
}

describe("SeriesFactory", () => {
    it("should create SeriesFactory", () => {
        const progressStore = new MemoryProgressStore();
        const puzzleLoader = new MockPuzzleLoader();
        const factory = new SeriesFactory(puzzleLoader, progressStore);
        expect(factory).toBeDefined();
    });

    it("should handle basic operations", () => {
        const progressStore = new MemoryProgressStore();
        const puzzleLoader = new MockPuzzleLoader();
        const factory = new SeriesFactory(puzzleLoader, progressStore);

        // Basic functionality test
        expect(typeof factory.createFromJson).toBe('function');
    });
});
