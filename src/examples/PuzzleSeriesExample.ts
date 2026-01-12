import { SeriesFactory, SeriesManager } from '@model/series/SeriesFactory';
import { FilePuzzleLoader, LocalStorageProgressStore } from '@model/series/SeriesLoaders';
import type { PuzzleSeries } from '@model/series/PuzzleSeries';

/**
 * Example integration showing how to use the puzzle series system
 * This would typically be used in a game controller or scene manager
 */
export class PuzzleSeriesController {
    private seriesManager: SeriesManager;
    private currentSeries: PuzzleSeries | null = null;

    constructor() {
        const puzzleLoader = new FilePuzzleLoader();
        const progressStore = new LocalStorageProgressStore();
        const seriesFactory = new SeriesFactory(puzzleLoader, progressStore);

        this.seriesManager = new SeriesManager(seriesFactory, progressStore);
    }

    /**
     * Load a puzzle series from a JSON file
     */
    async loadSeries(seriesJsonPath: string): Promise<PuzzleSeries> {
        try {
            const response = await fetch(seriesJsonPath);
            if (!response.ok) {
                throw new Error(`Failed to load series: ${seriesJsonPath} (${response.status})`);
            }

            const seriesJson = await response.json();
            const series = await this.seriesManager.loadSeries(seriesJson);
            this.currentSeries = series;

            console.log(`Loaded series: ${series.title}`);
            console.log(`Progress: ${series.getCompletionPercentage()}% complete`);
            console.log(`Current puzzle: ${series.getCurrentPuzzle()?.title || 'None'}`);

            return series;
        } catch (error) {
            console.error(`Error loading series from ${seriesJsonPath}:`, error);
            throw error;
        }
    }

    /**
     * Get the current puzzle in the active series
     */
    getCurrentPuzzle(): string | null {
        if (!this.currentSeries) {
            return null;
        }

        const currentEntry = this.currentSeries.getCurrentPuzzle();
        return currentEntry?.id || null;
    }

    /**
     * Complete the current puzzle and advance to the next
     */
    async completePuzzle(puzzleId: string): Promise<{
        success: boolean;
        newlyUnlocked: string[];
        nextPuzzle?: string;
        seriesCompleted: boolean;
    }> {
        if (!this.currentSeries) {
            return { success: false, newlyUnlocked: [], seriesCompleted: false };
        }

        const result = this.currentSeries.completePuzzle(puzzleId);

        if (result.success) {
            // Save progress
            await this.seriesManager.saveSeriesProgress(this.currentSeries);

            // Try to advance to next puzzle if current is completed
            let nextPuzzle: string | undefined;
            if (this.currentSeries.canNavigateToNext()) {
                this.currentSeries.navigateToNext();
                nextPuzzle = this.currentSeries.getCurrentPuzzle()?.id;
            }

            const seriesCompleted = this.currentSeries.isCompleted();

            console.log(`Completed puzzle: ${puzzleId}`);
            if (result.newlyUnlockedPuzzles.length > 0) {
                console.log(`Unlocked puzzles: ${result.newlyUnlockedPuzzles.join(', ')}`);
            }
            if (nextPuzzle) {
                console.log(`Next puzzle: ${nextPuzzle}`);
            }
            if (seriesCompleted) {
                console.log('🎉 Series completed!');
            }

            return {
                success: true,
                newlyUnlocked: result.newlyUnlockedPuzzles,
                nextPuzzle,
                seriesCompleted
            };
        }

        return { success: false, newlyUnlocked: [], seriesCompleted: false };
    }

    /**
     * Navigate to a specific puzzle in the series
     */
    navigateToPuzzle(puzzleId: string): boolean {
        if (!this.currentSeries) {
            return false;
        }

        const puzzle = this.currentSeries.getPuzzleById(puzzleId);
        if (!puzzle || !puzzle.unlocked) {
            console.warn(`Cannot navigate to puzzle ${puzzleId}: not found or not unlocked`);
            return false;
        }

        const success = this.currentSeries.setCurrentPuzzle(puzzleId);
        if (success) {
            console.log(`Navigated to puzzle: ${puzzle.title}`);
        }

        return success;
    }

    /**
     * Get series overview for UI display
     */
    getSeriesOverview(): {
        title: string;
        description: string;
        progress: number;
        puzzles: Array<{
            id: string;
            title: string;
            description?: string;
            unlocked: boolean;
            completed: boolean;
            isCurrent: boolean;
        }>;
    } | null {
        if (!this.currentSeries) {
            return null;
        }

        const currentPuzzleId = this.currentSeries.getCurrentPuzzle()?.id;
        const puzzles = this.currentSeries.getPuzzleEntries().map(entry => ({
            id: entry.id,
            title: entry.title,
            description: entry.description,
            unlocked: entry.unlocked,
            completed: entry.completed,
            isCurrent: entry.id === currentPuzzleId
        }));

        return {
            title: this.currentSeries.title,
            description: this.currentSeries.description,
            progress: this.currentSeries.getCompletionPercentage(),
            puzzles
        };
    }

    /**
     * Get available next actions for UI
     */
    getAvailableActions(): {
        canNavigatePrevious: boolean;
        canNavigateNext: boolean;
        canStartCurrent: boolean;
        currentPuzzleTitle?: string;
    } {
        if (!this.currentSeries) {
            return {
                canNavigatePrevious: false,
                canNavigateNext: false,
                canStartCurrent: false
            };
        }

        const currentPuzzle = this.currentSeries.getCurrentPuzzle();

        return {
            canNavigatePrevious: this.currentSeries.canNavigateToPrevious(),
            canNavigateNext: this.currentSeries.canNavigateToNext(),
            canStartCurrent: currentPuzzle?.unlocked || false,
            currentPuzzleTitle: currentPuzzle?.title
        };
    }

    /**
     * Clear all series progress (for testing or reset functionality)
     */
    async clearAllProgress(): Promise<void> {
        const progressStore = new LocalStorageProgressStore();
        await progressStore.clearAllProgress();
        this.seriesManager.clearCache();
        console.log('Cleared all series progress');
    }
}

// Example usage
export async function demonstratePuzzleSeriesUsage() {
    console.log('=== Puzzle Series System Demonstration ===');

    const controller = new PuzzleSeriesController();

    try {
        // Load the tutorial series
        await controller.loadSeries('src/data/series/tutorial-series.json');

        // Display series overview
        const overview = controller.getSeriesOverview();
        console.log('\nSeries Overview:', overview);

        // Show available actions
        const actions = controller.getAvailableActions();
        console.log('\nAvailable Actions:', actions);

        // Simulate completing puzzles
        console.log('\n=== Simulating Puzzle Completion ===');

        // Complete first puzzle
        const result1 = await controller.completePuzzle('tutorial-1');
        console.log('Completion Result 1:', result1);

        // Complete second puzzle
        const result2 = await controller.completePuzzle('tutorial-2');
        console.log('Completion Result 2:', result2);

        // Complete final puzzle
        const result3 = await controller.completePuzzle('tutorial-3');
        console.log('Completion Result 3:', result3);

        // Final overview
        const finalOverview = controller.getSeriesOverview();
        console.log('\nFinal Series Overview:', finalOverview);

        console.log('\n🎉 Demonstration completed successfully!');

    } catch (error) {
        console.error('Error in demonstration:', error);
    }
}

// Auto-run demonstration if this module is executed directly
if (typeof window === 'undefined') {
    demonstratePuzzleSeriesUsage();
}