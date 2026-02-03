/**
 * Manages the state of an NPC's puzzle series.
 * Determines the visual icon state based on series completion.
 * Pure model logic - no Phaser dependencies, fully testable.
 */

import type { NPC } from './NPC';
import type { PuzzleSeries } from '@model/series/PuzzleSeries';

/**
 * Icon state for an NPC based on their series completion
 */
export type NPCIconState = 'incomplete' | 'complete' | 'none';

/**
 * State manager for an NPC's associated puzzle series
 */
export class NPCSeriesState {
    constructor(
        private npc: NPC,
        private series: PuzzleSeries | null
    ) {}

    /**
     * Get the NPC associated with this state
     */
    getNPC(): NPC {
        return this.npc;
    }

    /**
     * Get the series associated with this NPC (if any)
     */
    getSeries(): PuzzleSeries | null {
        return this.series;
    }

    /**
     * Determine the icon state to display for this NPC
     * - 'none': NPC has no series
     * - 'incomplete': Series exists but not completed
     * - 'complete': Series is completed
     */
    getIconState(): NPCIconState {
        if (!this.series) {
            return 'none';
        }
        return this.series.isSeriesCompleted() ? 'complete' : 'incomplete';
    }

    /**
     * Check if the series is completed
     */
    isSeriesCompleted(): boolean {
        return this.series?.isSeriesCompleted() ?? false;
    }

    /**
     * Get the first unsolved puzzle ID in the series
     * Returns null if no series or all puzzles are solved
     */
    getFirstUnsolvedPuzzleId(): string | null {
        if (!this.series) {
            return null;
        }

        const entries = this.series.getAllPuzzleEntries();
        for (const entry of entries) {
            if (entry.unlocked && !entry.completed) {
                return entry.id;
            }
        }

        // If no unlocked incomplete puzzle found, return first unlocked one
        // (covers edge case of completed series or just starting)
        const firstUnlocked = entries.find(e => e.unlocked);
        return firstUnlocked?.id ?? null;
    }

    /**
     * Update the series (e.g., after progress changes)
     */
    updateSeries(series: PuzzleSeries | null): void {
        this.series = series;
    }
}
