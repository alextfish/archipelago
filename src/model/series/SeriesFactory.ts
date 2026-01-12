import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { PuzzleSeries } from './PuzzleSeries';
import type { SeriesPuzzleEntry, SeriesProgress } from './PuzzleSeries';

/**
 * JSON structure for puzzle series (Approach 1: Embedded puzzles)
 */
interface SeriesJsonEmbedded {
    id: string;
    title: string;
    description: string;
    puzzles: Array<{
        id: string;
        title: string;
        description?: string;
        puzzleData: any; // Raw puzzle JSON data
        requiredPuzzles?: string[];
    }>;
    metadata?: {
        difficulty?: string;
        estimatedTime?: string;
        tags?: string[];
    };
}

/**
 * JSON structure for puzzle series (Approach 2: File references)
 */
interface SeriesJsonReferenced {
    id: string;
    title: string;
    description: string;
    puzzleRefs: Array<{
        puzzleFile: string;
        title: string;
        description?: string;
        unlocked?: boolean;
        requiredPuzzles?: string[];
    }>;
    metadata?: {
        difficulty?: string;
        estimatedTime?: string;
        tags?: string[];
    };
}

type SeriesJson = SeriesJsonEmbedded | SeriesJsonReferenced;

/**
 * Interface for loading puzzle data (abstracted for testing)
 */
export interface PuzzleLoader {
    loadPuzzleFromFile(filePath: string): Promise<BridgePuzzle>;
    loadPuzzleFromData(data: any): BridgePuzzle;
}

/**
 * Interface for persisting series progress
 */
export interface SeriesProgressStore {
    loadProgress(seriesId: string): Promise<SeriesProgress | null>;
    saveProgress(progress: SeriesProgress): Promise<void>;
}

/**
 * Factory class for creating PuzzleSeries from JSON data
 */
export class SeriesFactory {
    constructor(
        private puzzleLoader: PuzzleLoader,
        private progressStore: SeriesProgressStore
    ) { }

    /**
     * Create a PuzzleSeries from JSON data
     */
    async createFromJson(seriesJson: SeriesJson): Promise<PuzzleSeries> {
        const puzzleEntries = await this.createPuzzleEntries(seriesJson);
        const progress = await this.loadOrCreateProgress(seriesJson.id, puzzleEntries);

        return new PuzzleSeries(
            seriesJson.id,
            seriesJson.title,
            seriesJson.description,
            puzzleEntries,
            progress
        );
    }

    /**
     * Create puzzle entries from JSON, handling both embedded and referenced formats
     */
    private async createPuzzleEntries(seriesJson: SeriesJson): Promise<SeriesPuzzleEntry[]> {
        if (this.isEmbeddedFormat(seriesJson)) {
            return seriesJson.puzzles.map(puzzleJson => ({
                id: puzzleJson.id,
                title: puzzleJson.title,
                description: puzzleJson.description,
                unlocked: false, // Will be set based on progress/requirements
                completed: false, // Will be set based on progress
                requiredPuzzles: puzzleJson.requiredPuzzles || []
            }));
        } else {
            return seriesJson.puzzleRefs.map(puzzleRef => ({
                id: this.extractIdFromFilename(puzzleRef.puzzleFile),
                title: puzzleRef.title,
                description: puzzleRef.description,
                unlocked: puzzleRef.unlocked ?? false,
                completed: false, // Will be set based on progress
                requiredPuzzles: puzzleRef.requiredPuzzles || []
            }));
        }
    }

    /**
     * Load existing progress or create new progress for a series
     */
    private async loadOrCreateProgress(seriesId: string, puzzleEntries: SeriesPuzzleEntry[]): Promise<SeriesProgress> {
        const existingProgress = await this.progressStore.loadProgress(seriesId);

        if (existingProgress) {
            return existingProgress;
        }

        // Create new progress - unlock puzzles with no requirements
        const unlockedPuzzles = new Set<string>();
        for (const entry of puzzleEntries) {
            if (!entry.requiredPuzzles || entry.requiredPuzzles.length === 0) {
                unlockedPuzzles.add(entry.id);
            }
        }

        return {
            seriesId,
            currentPuzzleIndex: 0,
            completedPuzzles: new Set<string>(),
            unlockedPuzzles
        };
    }

    /**
     * Load a specific puzzle from the series
     */
    async loadPuzzle(seriesJson: SeriesJson, puzzleId: string): Promise<BridgePuzzle | null> {
        if (this.isEmbeddedFormat(seriesJson)) {
            const puzzleData = seriesJson.puzzles.find(p => p.id === puzzleId);
            if (!puzzleData) {
                return null;
            }
            return this.puzzleLoader.loadPuzzleFromData(puzzleData.puzzleData);
        } else {
            const puzzleRef = seriesJson.puzzleRefs.find(ref =>
                this.extractIdFromFilename(ref.puzzleFile) === puzzleId
            );
            if (!puzzleRef) {
                return null;
            }
            return this.puzzleLoader.loadPuzzleFromFile(puzzleRef.puzzleFile);
        }
    }

    /**
     * Type guard to check if series uses embedded format
     */
    private isEmbeddedFormat(seriesJson: SeriesJson): seriesJson is SeriesJsonEmbedded {
        return 'puzzles' in seriesJson;
    }

    /**
     * Extract puzzle ID from filename
     */
    private extractIdFromFilename(filePath: string): string {
        const filename = filePath.split('/').pop() || filePath;
        return filename.replace('.json', '');
    }
}

/**
 * Series manager for handling multiple puzzle series
 */
export class SeriesManager {
    private loadedSeries = new Map<string, PuzzleSeries>();

    constructor(
        private seriesFactory: SeriesFactory,
        private progressStore: SeriesProgressStore
    ) { }

    /**
     * Load a series by ID
     */
    async loadSeries(seriesJson: SeriesJson): Promise<PuzzleSeries> {
        const existingSeries = this.loadedSeries.get(seriesJson.id);
        if (existingSeries) {
            return existingSeries;
        }

        const series = await this.seriesFactory.createFromJson(seriesJson);
        this.loadedSeries.set(series.id, series);
        return series;
    }

    /**
     * Save progress for a series
     */
    async saveSeriesProgress(series: PuzzleSeries): Promise<void> {
        await this.progressStore.saveProgress(series.getProgress());
        // Update cached series with new progress
        this.loadedSeries.set(series.id, series);
    }

    /**
     * Get all loaded series
     */
    getLoadedSeries(): PuzzleSeries[] {
        return Array.from(this.loadedSeries.values());
    }

    /**
     * Clear cached series data
     */
    clearCache(): void {
        this.loadedSeries.clear();
    }
}