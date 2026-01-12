import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { PuzzleLoader, SeriesProgressStore } from './SeriesFactory';
import type { SeriesProgress } from './PuzzleSeries';

/**
 * Implementation of PuzzleLoader that loads puzzle data from files or JSON
 */
export class FilePuzzleLoader implements PuzzleLoader {
    /**
     * Load a puzzle from a file path
     */
    async loadPuzzleFromFile(filePath: string): Promise<BridgePuzzle> {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to load puzzle file: ${filePath} (${response.status})`);
            }
            const data = await response.json();
            return this.loadPuzzleFromData(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Error loading puzzle from ${filePath}: ${message}`);
        }
    }

    /**
     * Create a BridgePuzzle from raw JSON data
     */
    loadPuzzleFromData(data: any): BridgePuzzle {
        try {
            return new BridgePuzzle(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Error creating puzzle from data: ${message}`);
        }
    }
}

/**
 * Local storage implementation of SeriesProgressStore
 */
export class LocalStorageProgressStore implements SeriesProgressStore {
    private readonly storageKeyPrefix = 'archipelago_series_progress_';

    /**
     * Load series progress from localStorage
     */
    async loadProgress(seriesId: string): Promise<SeriesProgress | null> {
        try {
            const key = this.getStorageKey(seriesId);
            const stored = localStorage.getItem(key);

            if (!stored) {
                return null;
            }

            const data = JSON.parse(stored);

            // Convert arrays back to Sets
            return {
                seriesId: data.seriesId,
                currentPuzzleIndex: data.currentPuzzleIndex,
                completedPuzzles: new Set(data.completedPuzzles || []),
                unlockedPuzzles: new Set(data.unlockedPuzzles || [])
            };
        } catch (error) {
            console.warn(`Failed to load progress for series ${seriesId}:`, error);
            return null;
        }
    }

    /**
     * Save series progress to localStorage
     */
    async saveProgress(progress: SeriesProgress): Promise<void> {
        try {
            const key = this.getStorageKey(progress.seriesId);

            // Convert Sets to arrays for JSON storage
            const storable = {
                seriesId: progress.seriesId,
                currentPuzzleIndex: progress.currentPuzzleIndex,
                completedPuzzles: Array.from(progress.completedPuzzles),
                unlockedPuzzles: Array.from(progress.unlockedPuzzles)
            };

            localStorage.setItem(key, JSON.stringify(storable));
        } catch (error) {
            console.error(`Failed to save progress for series ${progress.seriesId}:`, error);
            throw error;
        }
    }

    /**
     * Clear progress for a specific series
     */
    async clearProgress(seriesId: string): Promise<void> {
        try {
            const key = this.getStorageKey(seriesId);
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`Failed to clear progress for series ${seriesId}:`, error);
        }
    }

    /**
     * Clear all series progress
     */
    async clearAllProgress(): Promise<void> {
        try {
            const keysToRemove: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.storageKeyPrefix)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.error('Failed to clear all series progress:', error);
        }
    }

    /**
     * Get all stored series IDs
     */
    async getStoredSeriesIds(): Promise<string[]> {
        try {
            const seriesIds: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.storageKeyPrefix)) {
                    const seriesId = key.substring(this.storageKeyPrefix.length);
                    seriesIds.push(seriesId);
                }
            }

            return seriesIds;
        } catch (error) {
            console.warn('Failed to get stored series IDs:', error);
            return [];
        }
    }

    private getStorageKey(seriesId: string): string {
        return `${this.storageKeyPrefix}${seriesId}`;
    }
}

/**
 * In-memory implementation of SeriesProgressStore (useful for testing)
 */
export class MemoryProgressStore implements SeriesProgressStore {
    private progressMap = new Map<string, SeriesProgress>();

    async loadProgress(seriesId: string): Promise<SeriesProgress | null> {
        const stored = this.progressMap.get(seriesId);

        if (!stored) {
            return null;
        }

        // Deep clone to avoid mutation issues
        return {
            seriesId: stored.seriesId,
            currentPuzzleIndex: stored.currentPuzzleIndex,
            completedPuzzles: new Set(stored.completedPuzzles),
            unlockedPuzzles: new Set(stored.unlockedPuzzles)
        };
    }

    async saveProgress(progress: SeriesProgress): Promise<void> {
        // Deep clone to avoid mutation issues
        this.progressMap.set(progress.seriesId, {
            seriesId: progress.seriesId,
            currentPuzzleIndex: progress.currentPuzzleIndex,
            completedPuzzles: new Set(progress.completedPuzzles),
            unlockedPuzzles: new Set(progress.unlockedPuzzles)
        });
    }

    /**
     * Clear progress for a specific series
     */
    clearProgress(seriesId: string): void {
        this.progressMap.delete(seriesId);
    }

    /**
     * Clear all progress
     */
    clearAllProgress(): void {
        this.progressMap.clear();
    }

    /**
     * Get all stored progress (useful for testing)
     */
    getAllProgress(): Map<string, SeriesProgress> {
        return new Map(this.progressMap);
    }
}