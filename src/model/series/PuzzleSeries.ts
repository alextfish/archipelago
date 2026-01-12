/**
 * Represents a puzzle entry within a series, including metadata and unlock status
 */
export interface SeriesPuzzleEntry {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    unlocked: boolean;
    completed: boolean;
    readonly requiredPuzzles: string[]; // IDs of puzzles that must be completed first
}

/**
 * Represents progress through a puzzle series
 */
export interface SeriesProgress {
    readonly seriesId: string;
    readonly currentPuzzleIndex: number;
    readonly completedPuzzles: Set<string>; // Set of completed puzzle IDs
    readonly unlockedPuzzles: Set<string>; // Set of unlocked puzzle IDs
}

/**
 * Core class representing a series of related bridge puzzles with progression logic
 */
export class PuzzleSeries {
    constructor(
        public readonly id: string,
        public readonly title: string,
        public readonly description: string,
        private readonly puzzleEntries: SeriesPuzzleEntry[],
        private progress: SeriesProgress
    ) {
        if (puzzleEntries.length === 0) {
            throw new Error('PuzzleSeries must contain at least one puzzle');
        }

        // Sync puzzle entry states with progress
        this.syncPuzzleEntryStates();
    }

    /**
     * Get the current puzzle index within the series
     */
    getCurrentPuzzleIndex(): number {
        return this.progress.currentPuzzleIndex;
    }

    /**
     * Get the current puzzle entry
     */
    getCurrentPuzzleEntry(): SeriesPuzzleEntry | null {
        const index = this.getCurrentPuzzleIndex();
        return index >= 0 && index < this.puzzleEntries.length ? this.puzzleEntries[index] : null;
    }

    /**
     * Get all puzzle entries in the series
     */
    getAllPuzzleEntries(): readonly SeriesPuzzleEntry[] {
        return [...this.puzzleEntries];
    }

    /**
     * Check if we can navigate to the previous puzzle
     */
    canNavigateToPrevious(): boolean {
        return this.getCurrentPuzzleIndex() > 0;
    }

    /**
     * Check if we can navigate to the next puzzle
     */
    canNavigateToNext(): boolean {
        const currentIndex = this.getCurrentPuzzleIndex();
        const nextIndex = currentIndex + 1;

        if (nextIndex >= this.puzzleEntries.length) {
            return false; // No more puzzles
        }

        const currentEntry = this.puzzleEntries[currentIndex];
        return this.progress.completedPuzzles.has(currentEntry.id);
    }

    /**
     * Navigate to the previous puzzle in the series
     * @returns The new current puzzle entry, or null if navigation failed
     */
    navigateToPrevious(): SeriesPuzzleEntry | null {
        if (!this.canNavigateToPrevious()) {
            return null;
        }

        this.progress = {
            ...this.progress,
            currentPuzzleIndex: this.progress.currentPuzzleIndex - 1
        };

        return this.getCurrentPuzzleEntry();
    }

    /**
     * Navigate to the next puzzle in the series
     * @returns The new current puzzle entry, or null if navigation failed
     */
    navigateToNext(): SeriesPuzzleEntry | null {
        if (!this.canNavigateToNext()) {
            return null;
        }

        this.progress = {
            ...this.progress,
            currentPuzzleIndex: this.progress.currentPuzzleIndex + 1
        };

        return this.getCurrentPuzzleEntry();
    }

    /**
     * Mark the current puzzle as completed and update unlock status
     */
    markCurrentPuzzleCompleted(): void {
        const currentEntry = this.getCurrentPuzzleEntry();
        if (!currentEntry) {
            return;
        }

        // Add to completed set
        const newCompleted = new Set(this.progress.completedPuzzles);
        newCompleted.add(currentEntry.id);

        // Check which puzzles should be unlocked based on requirements
        const newUnlocked = new Set(this.progress.unlockedPuzzles);
        for (const entry of this.puzzleEntries) {
            if (this.shouldUnlockPuzzle(entry, newCompleted)) {
                newUnlocked.add(entry.id);
            }
        }

        this.progress = {
            ...this.progress,
            completedPuzzles: newCompleted,
            unlockedPuzzles: newUnlocked
        };
    }

    /**
     * Check if a puzzle should be unlocked based on completed requirements
     */
    private shouldUnlockPuzzle(entry: SeriesPuzzleEntry, completedPuzzles: Set<string>): boolean {
        if (!entry.requiredPuzzles || entry.requiredPuzzles.length === 0) {
            return true; // No requirements, always unlocked
        }

        // All required puzzles must be completed
        return entry.requiredPuzzles.every(requiredId => completedPuzzles.has(requiredId));
    }

    /**
     * Check if the entire series is completed
     */
    isSeriesCompleted(): boolean {
        return this.puzzleEntries.every(entry => this.progress.completedPuzzles.has(entry.id));
    }

    /**
     * Get series progress as percentage (0-100)
     */
    getProgressPercentage(): number {
        const totalPuzzles = this.puzzleEntries.length;
        const completedCount = this.progress.completedPuzzles.size;
        return Math.round((completedCount / totalPuzzles) * 100);
    }

    /**
     * Get the current progress state (for serialization)
     */
    getProgress(): SeriesProgress {
        return {
            seriesId: this.progress.seriesId,
            currentPuzzleIndex: this.progress.currentPuzzleIndex,
            completedPuzzles: new Set(this.progress.completedPuzzles),
            unlockedPuzzles: new Set(this.progress.unlockedPuzzles)
        };
    }

    /**
     * Create a new PuzzleSeries with updated progress
     */
    withProgress(newProgress: SeriesProgress): PuzzleSeries {
        return new PuzzleSeries(
            this.id,
            this.title,
            this.description,
            this.puzzleEntries,
            newProgress
        );
    }

    // Additional methods for compatibility and completeness

    /**
     * Alias for isSeriesCompleted (for test compatibility)
     */
    isCompleted(): boolean {
        return this.isSeriesCompleted();
    }

    /**
     * Complete a specific puzzle by ID and unlock newly available puzzles
     */
    completePuzzle(puzzleId: string): { success: boolean; newlyUnlockedPuzzles: string[] } {
        const puzzleEntry = this.puzzleEntries.find(p => p.id === puzzleId);
        if (!puzzleEntry) {
            return { success: false, newlyUnlockedPuzzles: [] };
        }

        const wasAlreadyCompleted = this.progress.completedPuzzles.has(puzzleId);

        // Add to completed set
        const newCompleted = new Set(this.progress.completedPuzzles);
        newCompleted.add(puzzleId);

        // Check which puzzles should be newly unlocked
        const currentUnlocked = new Set(this.progress.unlockedPuzzles);
        const newUnlocked = new Set(currentUnlocked);
        const newlyUnlockedPuzzles: string[] = [];

        for (const entry of this.puzzleEntries) {
            if (!currentUnlocked.has(entry.id) && this.shouldUnlockPuzzle(entry, newCompleted)) {
                newUnlocked.add(entry.id);
                newlyUnlockedPuzzles.push(entry.id);
            }
        }

        // Update progress
        this.progress = {
            ...this.progress,
            completedPuzzles: newCompleted,
            unlockedPuzzles: newUnlocked
        };

        // Sync puzzle entry states
        this.syncPuzzleEntryStates();

        return {
            success: true,
            newlyUnlockedPuzzles: wasAlreadyCompleted ? [] : newlyUnlockedPuzzles
        };
    }

    /**
     * Check if a puzzle's requirements are met
     */
    areRequirementsMet(puzzleId: string): boolean {
        const puzzleEntry = this.puzzleEntries.find(p => p.id === puzzleId);
        if (!puzzleEntry) {
            return false;
        }

        return this.shouldUnlockPuzzle(puzzleEntry, this.progress.completedPuzzles);
    }

    /**
     * Get all puzzle entries (alias for compatibility)
     */
    getPuzzleEntries(): readonly SeriesPuzzleEntry[] {
        return this.getAllPuzzleEntries();
    }

    /**
     * Get current puzzle entry (alias for compatibility)
     */
    getCurrentPuzzle(): SeriesPuzzleEntry | null {
        return this.getCurrentPuzzleEntry();
    }

    /**
     * Get next puzzle entry
     */
    getNextPuzzle(): SeriesPuzzleEntry | null {
        const nextIndex = this.getCurrentPuzzleIndex() + 1;
        return nextIndex < this.puzzleEntries.length ? this.puzzleEntries[nextIndex] : null;
    }

    /**
     * Get previous puzzle entry
     */
    getPreviousPuzzle(): SeriesPuzzleEntry | null {
        const prevIndex = this.getCurrentPuzzleIndex() - 1;
        return prevIndex >= 0 ? this.puzzleEntries[prevIndex] : null;
    }

    /**
     * Navigate to next puzzle (boolean result for test compatibility)
     */
    navigateToNextPuzzle(): boolean {
        if (!this.canNavigateToNext()) {
            return false;
        }

        this.progress = {
            ...this.progress,
            currentPuzzleIndex: this.progress.currentPuzzleIndex + 1
        };

        return true;
    }

    /**
     * Navigate to previous puzzle (boolean result for test compatibility)
     */
    navigateToPreviousPuzzle(): boolean {
        if (!this.canNavigateToPrevious()) {
            return false;
        }

        this.progress = {
            ...this.progress,
            currentPuzzleIndex: this.progress.currentPuzzleIndex - 1
        };

        return true;
    }

    /**
     * Set current puzzle index
     */
    setCurrentPuzzleIndex(index: number): boolean {
        if (index < 0 || index >= this.puzzleEntries.length) {
            return false;
        }

        this.progress = {
            ...this.progress,
            currentPuzzleIndex: index
        };

        return true;
    }

    /**
     * Set current puzzle by ID
     */
    setCurrentPuzzle(puzzleId: string): boolean {
        const index = this.puzzleEntries.findIndex(p => p.id === puzzleId);
        if (index === -1) {
            return false;
        }

        return this.setCurrentPuzzleIndex(index);
    }

    /**
     * Get puzzle by ID
     */
    getPuzzleById(puzzleId: string): SeriesPuzzleEntry | null {
        return this.puzzleEntries.find(p => p.id === puzzleId) || null;
    }

    /**
     * Get all unlocked puzzles
     */
    getUnlockedPuzzles(): SeriesPuzzleEntry[] {
        return this.puzzleEntries.filter(p => this.progress.unlockedPuzzles.has(p.id));
    }

    /**
     * Get all completed puzzles
     */
    getCompletedPuzzles(): SeriesPuzzleEntry[] {
        return this.puzzleEntries.filter(p => this.progress.completedPuzzles.has(p.id));
    }

    /**
     * Get completion percentage (alias for getProgressPercentage)
     */
    getCompletionPercentage(): number {
        return this.getProgressPercentage();
    }

    /**
     * Sync puzzle entry unlocked/completed states with progress
     */
    private syncPuzzleEntryStates(): void {
        for (const entry of this.puzzleEntries) {
            entry.unlocked = this.progress.unlockedPuzzles.has(entry.id);
            entry.completed = this.progress.completedPuzzles.has(entry.id);
        }
    }
}