/**
 * Unit tests for NPC
 */

import { describe, it, expect } from 'vitest';
import { NPC } from '@model/conversation/NPC';

describe('NPC', () => {
    describe('construction', () => {
        it('should create NPC with all properties', () => {
            const npc = new NPC(
                'sailor1',
                'Sailor',
                10,
                20,
                'grass',
                'sailorNS',
                'sailor1_vertical.json',
                'sailor1_solved.json',
                'sailor-series.json'
            );

            expect(npc.id).toBe('sailor1');
            expect(npc.name).toBe('Sailor');
            expect(npc.tileX).toBe(10);
            expect(npc.tileY).toBe(20);
            expect(npc.language).toBe('grass');
            expect(npc.appearanceId).toBe('sailorNS');
            expect(npc.conversationFile).toBe('sailor1_vertical.json');
            expect(npc.conversationFileSolved).toBe('sailor1_solved.json');
            expect(npc.seriesFile).toBe('sailor-series.json');
        });

        it('should create NPC without conversation', () => {
            const npc = new NPC(
                'fisherman1',
                'Fisherman',
                5,
                15,
                'fire',
                'sailorEW'
            );

            expect(npc.id).toBe('fisherman1');
            expect(npc.conversationFile).toBeUndefined();
            expect(npc.conversationFileSolved).toBeUndefined();
            expect(npc.seriesFile).toBeUndefined();
        });

        it('should create NPC with series but no conversation', () => {
            const npc = new NPC(
                'guide1',
                'Guide',
                3,
                7,
                'grass',
                'sailorNS',
                undefined,
                undefined,
                'tutorial-series.json'
            );

            expect(npc.id).toBe('guide1');
            expect(npc.conversationFile).toBeUndefined();
            expect(npc.seriesFile).toBe('tutorial-series.json');
        });
    });

    describe('hasConversation', () => {
        it('should return true when conversation file exists', () => {
            const npc = new NPC(
                'sailor1',
                'Sailor',
                10,
                20,
                'grass',
                'sailorNS',
                'sailor1_vertical.json'
            );

            expect(npc.hasConversation()).toBe(true);
        });

        it('should return true when only solved conversation file exists', () => {
            const npc = new NPC(
                'sailor2',
                'Sailor',
                10,
                20,
                'grass',
                'sailorNS',
                undefined,
                'sailor2_solved.json'
            );

            expect(npc.hasConversation()).toBe(true);
        });

        it('should return false when conversation file is undefined', () => {
            const npc = new NPC(
                'fisherman1',
                'Fisherman',
                5,
                15,
                'fire',
                'sailorEW'
            );

            expect(npc.hasConversation()).toBe(false);
        });
    });

    describe('hasSeries', () => {
        it('should return true when series file exists', () => {
            const npc = new NPC(
                'guide1',
                'Guide',
                10,
                20,
                'grass',
                'sailorNS',
                undefined,
                undefined,
                'tutorial-series.json'
            );

            expect(npc.hasSeries()).toBe(true);
        });

        it('should return false when series file is undefined', () => {
            const npc = new NPC(
                'fisherman1',
                'Fisherman',
                5,
                15,
                'fire',
                'sailorEW'
            );

            expect(npc.hasSeries()).toBe(false);
        });
    });

    describe('getConversationPath', () => {
        it('should return correct path when conversation exists', () => {
            const npc = new NPC(
                'sailor1',
                'Sailor',
                10,
                20,
                'grass',
                'sailorNS',
                'sailor1_vertical.json'
            );

            expect(npc.getConversationPath()).toBe('resources/conversations/sailor1_vertical.json');
        });

        it('should return solved conversation path when series is solved', () => {
            const npc = new NPC(
                'sailor1',
                'Sailor',
                10,
                20,
                'grass',
                'sailorNS',
                'sailor1_vertical.json',
                'sailor1_solved.json'
            );

            expect(npc.getConversationPath(true)).toBe('resources/conversations/sailor1_solved.json');
        });

        it('should fall back to regular conversation if no solved conversation', () => {
            const npc = new NPC(
                'sailor1',
                'Sailor',
                10,
                20,
                'grass',
                'sailorNS',
                'sailor1_vertical.json'
            );

            expect(npc.getConversationPath(true)).toBe('resources/conversations/sailor1_vertical.json');
        });

        it('should throw error when conversation file is undefined', () => {
            const npc = new NPC(
                'fisherman1',
                'Fisherman',
                5,
                15,
                'fire',
                'sailorEW'
            );

            expect(() => npc.getConversationPath()).toThrow('NPC fisherman1 has no conversation file');
        });
    });

    describe('getSeriesPath', () => {
        it('should return correct path when series exists', () => {
            const npc = new NPC(
                'guide1',
                'Guide',
                10,
                20,
                'grass',
                'sailorNS',
                undefined,
                undefined,
                'tutorial-series.json'
            );

            expect(npc.getSeriesPath()).toBe('src/data/series/tutorial-series.json');
        });

        it('should throw error when series file is undefined', () => {
            const npc = new NPC(
                'fisherman1',
                'Fisherman',
                5,
                15,
                'fire',
                'sailorEW'
            );

            expect(() => npc.getSeriesPath()).toThrow('NPC fisherman1 has no series file');
        });
    });
});
