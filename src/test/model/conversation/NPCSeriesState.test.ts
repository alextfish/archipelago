/**
 * Unit tests for NPCSeriesState
 */

import { describe, it, expect } from 'vitest';
import { NPCSeriesState } from '@model/conversation/NPCSeriesState';
import { NPC } from '@model/conversation/NPC';
import { PuzzleSeries, type SeriesPuzzleEntry, type SeriesProgress } from '@model/series/PuzzleSeries';

describe('NPCSeriesState', () => {
    describe('construction', () => {
        it('should create state with NPC and series', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series = createTestSeries('series1', false);
            const state = new NPCSeriesState(npc, series);

            expect(state.getNPC()).toBe(npc);
            expect(state.getSeries()).toBe(series);
        });

        it('should create state with NPC but no series', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const state = new NPCSeriesState(npc, null);

            expect(state.getNPC()).toBe(npc);
            expect(state.getSeries()).toBeNull();
        });
    });

    describe('getIconState', () => {
        it('should return "none" when no series exists', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const state = new NPCSeriesState(npc, null);

            expect(state.getIconState()).toBe('none');
        });

        it('should return "incomplete" when series exists but not completed', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series = createTestSeries('series1', false);
            const state = new NPCSeriesState(npc, series);

            expect(state.getIconState()).toBe('incomplete');
        });

        it('should return "complete" when series is completed', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series = createTestSeries('series1', true);
            const state = new NPCSeriesState(npc, series);

            expect(state.getIconState()).toBe('complete');
        });
    });

    describe('isSeriesCompleted', () => {
        it('should return false when no series exists', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const state = new NPCSeriesState(npc, null);

            expect(state.isSeriesCompleted()).toBe(false);
        });

        it('should return false when series is incomplete', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series = createTestSeries('series1', false);
            const state = new NPCSeriesState(npc, series);

            expect(state.isSeriesCompleted()).toBe(false);
        });

        it('should return true when series is completed', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series = createTestSeries('series1', true);
            const state = new NPCSeriesState(npc, series);

            expect(state.isSeriesCompleted()).toBe(true);
        });
    });

    describe('getFirstUnsolvedPuzzleId', () => {
        it('should return null when no series exists', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const state = new NPCSeriesState(npc, null);

            expect(state.getFirstUnsolvedPuzzleId()).toBeNull();
        });

        it('should return first unlocked incomplete puzzle', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            
            const puzzleEntries: SeriesPuzzleEntry[] = [
                { id: 'p1', title: 'Puzzle 1', unlocked: true, completed: true, requiredPuzzles: [] },
                { id: 'p2', title: 'Puzzle 2', unlocked: true, completed: false, requiredPuzzles: ['p1'] },
                { id: 'p3', title: 'Puzzle 3', unlocked: false, completed: false, requiredPuzzles: ['p2'] }
            ];
            
            const progress: SeriesProgress = {
                seriesId: 'series1',
                currentPuzzleIndex: 1,
                completedPuzzles: new Set(['p1']),
                unlockedPuzzles: new Set(['p1', 'p2'])
            };
            
            const series = new PuzzleSeries('series1', 'Test Series', 'Description', puzzleEntries, progress);
            const state = new NPCSeriesState(npc, series);

            expect(state.getFirstUnsolvedPuzzleId()).toBe('p2');
        });

        it('should return first unlocked puzzle when all are completed', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series = createTestSeries('series1', true);
            const state = new NPCSeriesState(npc, series);

            const firstUnlocked = series.getAllPuzzleEntries().find(e => e.unlocked);
            expect(state.getFirstUnsolvedPuzzleId()).toBe(firstUnlocked?.id);
        });
    });

    describe('updateSeries', () => {
        it('should update the series', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series1 = createTestSeries('series1', false);
            const state = new NPCSeriesState(npc, series1);

            expect(state.getSeries()).toBe(series1);

            const series2 = createTestSeries('series2', true);
            state.updateSeries(series2);

            expect(state.getSeries()).toBe(series2);
            expect(state.getIconState()).toBe('complete');
        });

        it('should allow updating to null', () => {
            const npc = new NPC('npc1', 'Guide', 5, 5, 'grass', 'sailorNS');
            const series = createTestSeries('series1', false);
            const state = new NPCSeriesState(npc, series);

            state.updateSeries(null);

            expect(state.getSeries()).toBeNull();
            expect(state.getIconState()).toBe('none');
        });
    });
});

/**
 * Helper function to create a test puzzle series
 */
function createTestSeries(seriesId: string, completed: boolean): PuzzleSeries {
    const puzzleEntries: SeriesPuzzleEntry[] = [
        { id: 'p1', title: 'Puzzle 1', unlocked: true, completed: completed, requiredPuzzles: [] },
        { id: 'p2', title: 'Puzzle 2', unlocked: completed, completed: completed, requiredPuzzles: ['p1'] }
    ];
    
    const progress: SeriesProgress = {
        seriesId,
        currentPuzzleIndex: 0,
        completedPuzzles: completed ? new Set(['p1', 'p2']) : new Set(),
        unlockedPuzzles: completed ? new Set(['p1', 'p2']) : new Set(['p1'])
    };
    
    return new PuzzleSeries(seriesId, 'Test Series', 'Test Description', puzzleEntries, progress);
}
