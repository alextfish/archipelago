import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';

/**
 * Manages state persistence for overworld puzzles
 * Tracks active puzzle, progress, and completion status
 */
export class OverworldGameState {
    private activePuzzleId?: string;
    private activePuzzleState?: BridgePuzzle;
    private puzzleProgress: Map<string, BridgePuzzle> = new Map();
    private completedPuzzles: Set<string> = new Set();

    /**
     * Set the currently active overworld puzzle
     */
    setActivePuzzle(puzzleId: string, puzzle: BridgePuzzle): void {
        console.log(`OverworldGameState: Setting active puzzle ${puzzleId}`);
        this.activePuzzleId = puzzleId;
        this.activePuzzleState = puzzle;
    }

    /**
     * Get the currently active puzzle
     */
    getActivePuzzle(): { id: string; puzzle: BridgePuzzle } | null {
        if (!this.activePuzzleId || !this.activePuzzleState) {
            return null;
        }
        return {
            id: this.activePuzzleId,
            puzzle: this.activePuzzleState
        };
    }

    /**
     * Clear the active puzzle
     */
    clearActivePuzzle(): void {
        if (this.activePuzzleId && this.activePuzzleState) {
            console.log(`OverworldGameState: Saving progress for puzzle ${this.activePuzzleId}`);
            this.puzzleProgress.set(this.activePuzzleId, this.activePuzzleState);
        }

        this.activePuzzleId = undefined;
        this.activePuzzleState = undefined;
    }

    /**
     * Save progress for a puzzle
     */
    saveOverworldPuzzleProgress(puzzleId: string, puzzle: BridgePuzzle): void {
        console.log(`OverworldGameState: Saving progress for puzzle ${puzzleId} (${puzzle.bridges.length} bridges)`);
        this.puzzleProgress.set(puzzleId, puzzle);

        // Update active puzzle if it matches
        if (this.activePuzzleId === puzzleId) {
            this.activePuzzleState = puzzle;
        }
    }

    /**
     * Load saved progress for a puzzle
     */
    loadOverworldPuzzleProgress(puzzleId: string): BridgePuzzle | null {
        const saved = this.puzzleProgress.get(puzzleId);
        if (saved) {
            console.log(`OverworldGameState: Loaded progress for puzzle ${puzzleId} (${saved.bridges.length} bridges)`);
            return saved;
        }
        return null;
    }

    /**
     * Mark a puzzle as completed
     */
    markPuzzleCompleted(puzzleId: string): void {
        console.log(`OverworldGameState: Marking puzzle ${puzzleId} as completed`);
        this.completedPuzzles.add(puzzleId);

        // Remove from progress since it's completed
        this.puzzleProgress.delete(puzzleId);
    }

    /**
     * Check if a puzzle is completed
     */
    isPuzzleCompleted(puzzleId: string): boolean {
        return this.completedPuzzles.has(puzzleId);
    }

    /**
     * Check if a puzzle has saved progress
     */
    hasSavedProgress(puzzleId: string): boolean {
        return this.puzzleProgress.has(puzzleId);
    }

    /**
     * Get all completed puzzle IDs
     */
    getCompletedPuzzles(): string[] {
        return Array.from(this.completedPuzzles);
    }

    /**
     * Get all puzzle IDs with saved progress
     */
    getPuzzlesWithProgress(): string[] {
        return Array.from(this.puzzleProgress.keys());
    }

    /**
     * Get debug information about current state
     */
    getDebugInfo(): {
        activePuzzle?: string;
        totalProgress: number;
        totalCompleted: number;
        progressPuzzles: string[];
        completedPuzzles: string[];
    } {
        return {
            activePuzzle: this.activePuzzleId,
            totalProgress: this.puzzleProgress.size,
            totalCompleted: this.completedPuzzles.size,
            progressPuzzles: this.getPuzzlesWithProgress(),
            completedPuzzles: this.getCompletedPuzzles()
        };
    }

    /**
     * Clear all state (for testing or reset)
     */
    reset(): void {
        console.log('OverworldGameState: Resetting all state');
        this.activePuzzleId = undefined;
        this.activePuzzleState = undefined;
        this.puzzleProgress.clear();
        this.completedPuzzles.clear();
    }

    /**
     * Export state for persistence to localStorage or file
     */
    exportState(): {
        activePuzzleId?: string;
        puzzleProgress: Record<string, any>;
        completedPuzzles: string[];
    } {
        const puzzleProgressObj: Record<string, any> = {};
        for (const [id, puzzle] of this.puzzleProgress) {
            puzzleProgressObj[id] = {
                id: puzzle.id,
                width: puzzle.width,
                height: puzzle.height,
                islands: puzzle.islands,
                bridges: puzzle.bridges,
                constraints: puzzle.constraints,
                inventory: puzzle.inventory
            };
        }

        return {
            activePuzzleId: this.activePuzzleId,
            puzzleProgress: puzzleProgressObj,
            completedPuzzles: Array.from(this.completedPuzzles)
        };
    }

    /**
     * Import state from persisted data
     * Note: This imports basic state only. Puzzle objects would need reconstruction.
     */
    importState(state: {
        activePuzzleId?: string;
        puzzleProgress: Record<string, any>;
        completedPuzzles: string[];
    }): void {
        console.log('OverworldGameState: Importing state');

        this.activePuzzleId = state.activePuzzleId;
        this.completedPuzzles = new Set(state.completedPuzzles);

        // Note: puzzleProgress would need to be reconstructed as BridgePuzzle objects
        // This is left as a future enhancement when persistence is fully implemented
    }
}