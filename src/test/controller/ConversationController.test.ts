/**
 * Unit tests for ConversationController
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationController, type ConversationHost } from '@controller/ConversationController';
import { NPC } from '@model/conversation/NPC';
import type { ConversationSpec, ConversationEffect } from '@model/conversation/ConversationData';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';
import { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';

describe('ConversationController', () => {
    // Sample conversation spec for testing
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

    const testNPC = new NPC(
        'sailor1',
        'Sailor',
        10,
        20,
        'grass',
        'sailorNS',
        'sailor1_vertical.json'
    );

    // Mock host implementation
    class MockHost implements ConversationHost {
        displayNPCLineCalls: Array<{
            expression: string;
            glyphFrames: number[];
            language: string;
        }> = [];

        displayChoicesCalls: Array<Array<{ text: string; index: number }>> = [];
        hideConversationCalls = 0;
        applyEffectsCalls: ConversationEffect[][] = [];
        onConversationEndCalls = 0;

        displayNPCLine(expression: string, glyphFrames: number[], language: string): void {
            this.displayNPCLineCalls.push({ expression, glyphFrames, language });
        }

        displayChoices(choices: Array<{ text: string; index: number }>): void {
            this.displayChoicesCalls.push(choices);
        }

        hideConversation(): void {
            this.hideConversationCalls++;
        }

        applyEffects(effects: ConversationEffect[]): void {
            this.applyEffectsCalls.push(effects);
        }

        onConversationEnd(): void {
            this.onConversationEndCalls++;
        }

        reset(): void {
            this.displayNPCLineCalls = [];
            this.displayChoicesCalls = [];
            this.hideConversationCalls = 0;
            this.applyEffectsCalls = [];
            this.onConversationEndCalls = 0;
        }
    }

    let mockHost: MockHost;
    let controller: ConversationController;

    beforeEach(() => {
        mockHost = new MockHost();
        controller = new ConversationController(mockHost);
    });

    describe('initialization', () => {
        it('should initialize with provided registries', () => {
            const glyphRegistry = new LanguageGlyphRegistry();
            const appearanceRegistry = new NPCAppearanceRegistry();

            const ctrl = new ConversationController(mockHost, glyphRegistry, appearanceRegistry);

            expect(ctrl.getGlyphRegistry()).toBe(glyphRegistry);
            expect(ctrl.getAppearanceRegistry()).toBe(appearanceRegistry);
        });

        it('should create default registries if not provided', () => {
            expect(controller.getGlyphRegistry()).toBeInstanceOf(LanguageGlyphRegistry);
            expect(controller.getAppearanceRegistry()).toBeInstanceOf(NPCAppearanceRegistry);
        });

        it('should not be active initially', () => {
            expect(controller.isActive()).toBe(false);
            expect(controller.getCurrentState()).toBeNull();
            expect(controller.getCurrentNPC()).toBeNull();
        });
    });

    describe('startConversation', () => {
        it('should initialize conversation state and display first node', () => {
            controller.startConversation(sampleSpec, testNPC);

            expect(controller.isActive()).toBe(true);
            expect(controller.getCurrentState()).not.toBeNull();
            expect(controller.getCurrentNPC()).toBe(testNPC);

            // Should display NPC line with parsed glyphs
            expect(mockHost.displayNPCLineCalls).toHaveLength(1);
            expect(mockHost.displayNPCLineCalls[0].expression).toBe('neutral');
            expect(mockHost.displayNPCLineCalls[0].language).toBe('grass');
            expect(mockHost.displayNPCLineCalls[0].glyphFrames).toEqual([32, 34, 33]); // me, want, bridge

            // Should display choices
            expect(mockHost.displayChoicesCalls).toHaveLength(1);
            expect(mockHost.displayChoicesCalls[0]).toEqual([
                { text: 'OK', index: 0 },
                { text: 'No', index: 1 },
            ]);
        });

        it('should reset conversation when starting a new one', () => {
            // Start first conversation
            controller.startConversation(sampleSpec, testNPC);
            const firstState = controller.getCurrentState();

            // Select choice to progress
            controller.selectChoice(0);

            mockHost.reset();

            // Start conversation again - should reset to beginning
            controller.startConversation(sampleSpec, testNPC);
            const secondState = controller.getCurrentState();

            expect(secondState).not.toBe(firstState);
            expect(secondState?.getCurrentNodeId()).toBe('intro');
            expect(secondState?.isEnded()).toBe(false);

            // Should display first node again
            expect(mockHost.displayNPCLineCalls).toHaveLength(1);
            expect(mockHost.displayNPCLineCalls[0].glyphFrames).toEqual([32, 34, 33]);
        });

        it('should warn when starting new conversation while previous is active', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            controller.startConversation(sampleSpec, testNPC);
            controller.startConversation(sampleSpec, testNPC);

            expect(consoleSpy).toHaveBeenCalledWith(
                'Starting new conversation while previous one is still active'
            );

            consoleSpy.mockRestore();
        });
    });

    describe('selectChoice', () => {
        it('should progress to next node', () => {
            controller.startConversation(sampleSpec, testNPC);
            mockHost.reset();

            controller.selectChoice(0); // Choose "OK"

            // Should display next node
            expect(mockHost.displayNPCLineCalls).toHaveLength(1);
            expect(mockHost.displayNPCLineCalls[0].expression).toBe('happy');
            expect(mockHost.displayNPCLineCalls[0].glyphFrames).toEqual([31, 35, 33]); // you, build, bridge
        });

        it('should end conversation when node has end: true', () => {
            controller.startConversation(sampleSpec, testNPC);
            mockHost.reset();

            controller.selectChoice(0); // Choose "OK" -> goes to 'accept' which has end: true

            // Should still display the final node
            expect(mockHost.displayNPCLineCalls).toHaveLength(1);

            // State should be marked as ended but not cleaned up yet
            expect(controller.getCurrentState()?.isEnded()).toBe(true);
            expect(controller.isActive()).toBe(false); // isActive checks if ended

            // Host must explicitly end to cleanup
            controller.endConversation();
            expect(mockHost.hideConversationCalls).toBe(1);
            expect(mockHost.onConversationEndCalls).toBe(1);
        });

        it('should end conversation when choice has end: true', () => {
            controller.startConversation(sampleSpec, testNPC);
            mockHost.reset();

            controller.selectChoice(1); // Choose "No" with end: true

            // Should mark as ended but not auto-cleanup
            expect(controller.getCurrentState()?.isEnded()).toBe(true);
            expect(controller.isActive()).toBe(false);

            // Host must explicitly end to cleanup
            controller.endConversation();
            expect(mockHost.hideConversationCalls).toBe(1);
            expect(mockHost.onConversationEndCalls).toBe(1);
        });

        it('should apply effects from choice', () => {
            const specWithEffects: ConversationSpec = {
                id: 'test',
                npcId: 'npc1',
                start: 'node1',
                nodes: {
                    node1: {
                        npc: { expression: 'neutral', glyphs: 'me want bridge' },
                        choices: [
                            {
                                text: 'Give item',
                                effects: [
                                    { type: 'giveItem', itemId: 'key' },
                                    { type: 'setExpression', expression: 'happy' },
                                ],
                                end: true,
                            },
                        ],
                    },
                },
            };

            controller.startConversation(specWithEffects, testNPC);
            mockHost.reset();

            controller.selectChoice(0);

            expect(mockHost.applyEffectsCalls).toHaveLength(1);
            expect(mockHost.applyEffectsCalls[0]).toHaveLength(2);
            expect(mockHost.applyEffectsCalls[0][0].type).toBe('giveItem');
            expect(mockHost.applyEffectsCalls[0][1].type).toBe('setExpression');
        });

        it('should throw error when no active conversation', () => {
            expect(() => controller.selectChoice(0)).toThrow('No active conversation');
        });

        it('should throw error when conversation already ended', () => {
            controller.startConversation(sampleSpec, testNPC);
            controller.selectChoice(1); // End conversation

            expect(() => controller.selectChoice(0)).toThrow('Conversation has already ended');
        });
    });

    describe('endConversation', () => {
        it('should hide conversation and notify host', () => {
            controller.startConversation(sampleSpec, testNPC);
            mockHost.reset();

            controller.endConversation();

            expect(controller.isActive()).toBe(false);
            expect(controller.getCurrentState()).toBeNull();
            expect(controller.getCurrentNPC()).toBeNull();
            expect(mockHost.hideConversationCalls).toBe(1);
            expect(mockHost.onConversationEndCalls).toBe(1);
        });

        it('should be safe to call when no active conversation', () => {
            expect(() => controller.endConversation()).not.toThrow();
            expect(mockHost.hideConversationCalls).toBe(0);
        });
    });

    describe('forceEnd', () => {
        it('should force end active conversation', () => {
            controller.startConversation(sampleSpec, testNPC);
            mockHost.reset();

            controller.forceEnd();

            expect(controller.isActive()).toBe(false);
            expect(mockHost.hideConversationCalls).toBe(1);
            expect(mockHost.onConversationEndCalls).toBe(1);
        });

        it('should be safe to call when no active conversation', () => {
            expect(() => controller.forceEnd()).not.toThrow();
        });
    });

    describe('conversation reset behavior', () => {
        it('should reset conversation to start when NPC is interacted with again', () => {
            // First conversation
            controller.startConversation(sampleSpec, testNPC);
            expect(controller.getCurrentState()?.getCurrentNodeId()).toBe('intro');

            // Progress to next node
            controller.selectChoice(0);
            expect(controller.getCurrentState()?.getCurrentNodeId()).toBe('accept');
            expect(controller.getCurrentState()?.isEnded()).toBe(true);

            // Explicitly end conversation to cleanup
            controller.endConversation();
            expect(controller.isActive()).toBe(false);

            mockHost.reset();

            // Start conversation again - should be back at start
            controller.startConversation(sampleSpec, testNPC);
            expect(controller.getCurrentState()?.getCurrentNodeId()).toBe('intro');
            expect(controller.isActive()).toBe(true);

            // Should display intro node again
            expect(mockHost.displayNPCLineCalls).toHaveLength(1);
            expect(mockHost.displayNPCLineCalls[0].glyphFrames).toEqual([32, 34, 33]);
        });

        it('should handle single-node conversations that end immediately', () => {
            const singleNodeSpec: ConversationSpec = {
                id: 'single',
                npcId: 'npc1',
                start: 'only',
                nodes: {
                    only: {
                        npc: { expression: 'neutral', glyphs: 'me bridge' },
                        choices: [
                            { text: 'OK', end: true },
                        ],
                    },
                },
            };

            // First time
            controller.startConversation(singleNodeSpec, testNPC);
            expect(controller.isActive()).toBe(true); // Conversation active after opening

            controller.selectChoice(0); // Mark as ended
            expect(controller.getCurrentState()?.isEnded()).toBe(true);
            expect(controller.isActive()).toBe(false);

            controller.endConversation(); // Cleanup
            expect(mockHost.onConversationEndCalls).toBe(1);

            mockHost.reset();

            // Second time - should reset and work the same way
            controller.startConversation(singleNodeSpec, testNPC);
            expect(controller.isActive()).toBe(true);
            expect(controller.getCurrentState()?.getCurrentNodeId()).toBe('only');

            controller.selectChoice(0);
            expect(controller.isActive()).toBe(false);

            controller.endConversation();
            expect(mockHost.onConversationEndCalls).toBe(1);
        });
    });
});
