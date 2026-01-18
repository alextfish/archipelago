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
                'sailor1_vertical.json'
            );

            expect(npc.id).toBe('sailor1');
            expect(npc.name).toBe('Sailor');
            expect(npc.tileX).toBe(10);
            expect(npc.tileY).toBe(20);
            expect(npc.language).toBe('grass');
            expect(npc.appearanceId).toBe('sailorNS');
            expect(npc.conversationFile).toBe('sailor1_vertical.json');
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
});
