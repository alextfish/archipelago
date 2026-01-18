/**
 * Unit tests for ConversationState
 */

import { describe, it, expect } from 'vitest';
import { ConversationState } from '@model/conversation/ConversationState';
import type { ConversationSpec } from '@model/conversation/ConversationData';

describe('ConversationState', () => {
    const sampleSpec: ConversationSpec = {
        id: 'test_conversation',
        npcId: 'sailor1',
        start: 'intro',
        nodes: {
            intro: {
                npc: {
                    expression: 'neutral',
                    glyphs: 'me want bridge',
                },
                choices: [
                    {
                        text: 'OK',
                        next: 'accept',
                    },
                    {
                        text: 'No',
                        end: true,
                    },
                ],
            },
            accept: {
                npc: {
                    expression: 'happy',
                    glyphs: 'you build bridge',
                },
                end: true,
            },
        },
    };

    describe('initialization', () => {
        it('should initialize with start node', () => {
            const state = new ConversationState(sampleSpec);

            expect(state.getCurrentNodeId()).toBe('intro');
            expect(state.getCurrentExpression()).toBe('neutral');
            expect(state.isEnded()).toBe(false);
        });

        it('should return conversation metadata', () => {
            const state = new ConversationState(sampleSpec);

            expect(state.getId()).toBe('test_conversation');
            expect(state.getNpcId()).toBe('sailor1');
        });
    });

    describe('getCurrentNode', () => {
        it('should return current node data', () => {
            const state = new ConversationState(sampleSpec);
            const node = state.getCurrentNode();

            expect(node.npc?.glyphs).toBe('me want bridge');
            expect(node.choices).toHaveLength(2);
        });

        it('should throw error for invalid node', () => {
            const invalidSpec: ConversationSpec = {
                ...sampleSpec,
                start: 'nonexistent',
            };

            const state = new ConversationState(invalidSpec);

            expect(() => state.getCurrentNode()).toThrow('Invalid node ID: nonexistent');
        });
    });

    describe('selectChoice', () => {
        it('should transition to next node', () => {
            const state = new ConversationState(sampleSpec);

            state.selectChoice(0); // Choose "OK"

            expect(state.getCurrentNodeId()).toBe('accept');
            expect(state.getCurrentExpression()).toBe('happy');
            expect(state.isEnded()).toBe(true); // accept node has end: true
        });

        it('should end conversation when choice has end: true', () => {
            const state = new ConversationState(sampleSpec);

            state.selectChoice(1); // Choose "No"

            expect(state.isEnded()).toBe(true);
            expect(state.getCurrentNodeId()).toBe('intro'); // Stays at current node
        });

        it('should throw error if conversation already ended', () => {
            const state = new ConversationState(sampleSpec);

            state.selectChoice(1); // End conversation

            expect(() => state.selectChoice(0)).toThrow('Cannot select choice: conversation has ended');
        });

        it('should throw error for invalid choice index', () => {
            const state = new ConversationState(sampleSpec);

            expect(() => state.selectChoice(5)).toThrow('Invalid choice index: 5');
            expect(() => state.selectChoice(-1)).toThrow('Invalid choice index: -1');
        });

        it('should end conversation if no next node and no explicit end', () => {
            const spec: ConversationSpec = {
                id: 'test',
                npcId: 'npc1',
                start: 'node1',
                nodes: {
                    node1: {
                        npc: { expression: 'neutral', glyphs: 'hello' },
                        choices: [
                            { text: 'Bye' }, // No next, no end
                        ],
                    },
                },
            };

            const state = new ConversationState(spec);
            state.selectChoice(0);

            expect(state.isEnded()).toBe(true);
        });
    });

    describe('effects', () => {
        it('should apply setExpression effect', () => {
            const spec: ConversationSpec = {
                id: 'test',
                npcId: 'npc1',
                start: 'node1',
                nodes: {
                    node1: {
                        npc: { expression: 'neutral', glyphs: 'hello' },
                        choices: [
                            {
                                text: 'Make them sad',
                                effects: [
                                    { type: 'setExpression', expression: 'sad', durationMs: 2000 },
                                ],
                                next: 'node2',
                            },
                        ],
                    },
                    node2: {
                        npc: { expression: 'sad', glyphs: 'me sad' },
                        end: true,
                    },
                },
            };

            const state = new ConversationState(spec);
            const effects = state.selectChoice(0);

            expect(state.getCurrentExpression()).toBe('sad');
            expect(effects).toHaveLength(1);
            expect(effects[0].type).toBe('setExpression');
        });

        it('should return all effects from choice', () => {
            const spec: ConversationSpec = {
                id: 'test',
                npcId: 'npc1',
                start: 'node1',
                nodes: {
                    node1: {
                        npc: { expression: 'neutral', glyphs: 'hello' },
                        choices: [
                            {
                                text: 'Multiple effects',
                                effects: [
                                    { type: 'setExpression', expression: 'happy' },
                                    { type: 'giveItem', itemId: 'key' },
                                    { type: 'setFlag', flagId: 'met_npc', flagValue: true },
                                ],
                                end: true,
                            },
                        ],
                    },
                },
            };

            const state = new ConversationState(spec);
            const effects = state.selectChoice(0);

            expect(effects).toHaveLength(3);
            expect(effects[0].type).toBe('setExpression');
            expect(effects[1].type).toBe('giveItem');
            expect(effects[2].type).toBe('setFlag');
        });

        it('should track applied effects', () => {
            const spec: ConversationSpec = {
                id: 'test',
                npcId: 'npc1',
                start: 'node1',
                nodes: {
                    node1: {
                        npc: { expression: 'neutral', glyphs: 'hello' },
                        choices: [
                            {
                                text: 'Choice 1',
                                effects: [{ type: 'setFlag', flagId: 'flag1', flagValue: true }],
                                next: 'node2',
                            },
                        ],
                    },
                    node2: {
                        npc: { expression: 'neutral', glyphs: 'bye' },
                        choices: [
                            {
                                text: 'Choice 2',
                                effects: [{ type: 'giveItem', itemId: 'item1' }],
                                end: true,
                            },
                        ],
                    },
                },
            };

            const state = new ConversationState(spec);
            state.selectChoice(0);
            state.selectChoice(0);

            const applied = state.getAppliedEffects();
            expect(applied).toHaveLength(2);
            expect(applied[0].type).toBe('setFlag');
            expect(applied[1].type).toBe('giveItem');
        });
    });

    describe('forceEnd', () => {
        it('should end conversation immediately', () => {
            const state = new ConversationState(sampleSpec);

            expect(state.isEnded()).toBe(false);

            state.forceEnd();

            expect(state.isEnded()).toBe(true);
        });
    });
});
