/**
 * Unit tests for the jewel guard conversation system.
 *
 * Covers:
 * - ConversationConditionEvaluator correctly routing to the "notEnough" start
 *   node when the player has fewer than 10 red jewels.
 * - ConversationConditionEvaluator correctly routing to the "hasEnough" start
 *   node when the player has exactly 10 (or more) red jewels.
 * - ConversationState advancing through the correct nodes in each case.
 * - The "hasEnough" path exposes a startSeries effect when the player helps.
 */

import { describe, it, expect } from 'vitest';
import { ConversationConditionEvaluator } from '@model/conversation/ConversationConditionEvaluator';
import type { ConditionContext } from '@model/conversation/ConversationConditionEvaluator';
import { ConversationState } from '@model/conversation/ConversationState';
import type { ConversationSpec } from '@model/conversation/ConversationData';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

/** Mirrors resources/conversations/guardJewelTest.json */
const guardSpec: ConversationSpec = {
    id: 'guardJewelTest',
    npcId: 'guardJewelTest1',
    conditionalStart: [
        {
            condition: { type: 'hasJewels', colour: 'red', count: 10 },
            start: 'hasEnough',
        },
    ],
    start: 'notEnough',
    nodes: {
        notEnough: {
            npc: {
                expression: 'neutral',
                glyphs: 'not-enough red jewel',
            },
            end: true,
        },
        hasEnough: {
            npc: {
                expression: 'happy',
                glyphs: 'you 10 red jewel exclamation you help',
            },
            choices: [
                {
                    text: 'Help',
                    effects: [{ type: 'startSeries', seriesId: 'guardSeries1' }],
                    end: true,
                },
                {
                    text: 'Leave',
                    end: true,
                },
            ],
        },
    },
};

/** Create a ConditionContext that returns a fixed jewel count. */
function makeContext(redCount: number): ConditionContext {
    return {
        getJewelCount: (colour: string) => (colour === 'red' ? redCount : 0),
    };
}

// ---------------------------------------------------------------------------
// ConversationConditionEvaluator
// ---------------------------------------------------------------------------

describe('ConversationConditionEvaluator', () => {
    describe('resolveStartNode', () => {
        it('returns the default start node when player has 0 red jewels', () => {
            const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(0));
            expect(startNode).toBe('notEnough');
        });

        it('returns the default start node when player has 9 red jewels', () => {
            const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(9));
            expect(startNode).toBe('notEnough');
        });

        it('returns the conditional start node when player has exactly 10 red jewels', () => {
            const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(10));
            expect(startNode).toBe('hasEnough');
        });

        it('returns the conditional start node when player has more than 10 red jewels', () => {
            const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(15));
            expect(startNode).toBe('hasEnough');
        });

        it('returns spec.start when there are no conditionalStart branches', () => {
            const specWithoutCondition: ConversationSpec = {
                id: 'simple',
                npcId: 'npc1',
                start: 'intro',
                nodes: { intro: { npc: { expression: 'neutral', glyphs: 'hello' }, end: true } },
            };
            const startNode = ConversationConditionEvaluator.resolveStartNode(specWithoutCondition, makeContext(99));
            expect(startNode).toBe('intro');
        });

        it('ignores non-matching jewel colours', () => {
            // Player has 20 blue jewels but only 0 red – condition requires red
            const context: ConditionContext = {
                getJewelCount: (colour) => (colour === 'blue' ? 20 : 0),
            };
            const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, context);
            expect(startNode).toBe('notEnough');
        });
    });
});

// ---------------------------------------------------------------------------
// ConversationState – "not enough jewels" path
// ---------------------------------------------------------------------------

describe('Guard conversation – not enough jewels', () => {
    it('starts at the notEnough node', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(0));
        const state = new ConversationState(guardSpec, startNode);

        expect(state.getCurrentNodeId()).toBe('notEnough');
    });

    it('notEnough node ends the conversation immediately (no choices)', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(5));
        const state = new ConversationState(guardSpec, startNode);

        expect(state.getCurrentNode().end).toBe(true);
        expect(state.isEnded()).toBe(false); // Not ended until a choice is made or forceEnd

        state.forceEnd();
        expect(state.isEnded()).toBe(true);
    });

    it('notEnough node shows the correct glyphs', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(0));
        const state = new ConversationState(guardSpec, startNode);

        expect(state.getCurrentNode().npc?.glyphs).toBe('not-enough red jewel');
    });
});

// ---------------------------------------------------------------------------
// ConversationState – "has enough jewels" path
// ---------------------------------------------------------------------------

describe('Guard conversation – has enough jewels', () => {
    it('starts at the hasEnough node', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(10));
        const state = new ConversationState(guardSpec, startNode);

        expect(state.getCurrentNodeId()).toBe('hasEnough');
    });

    it('hasEnough node shows the correct glyphs', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(10));
        const state = new ConversationState(guardSpec, startNode);

        expect(state.getCurrentNode().npc?.glyphs).toBe('you 10 red jewel exclamation you help');
    });

    it('hasEnough node offers two choices', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(10));
        const state = new ConversationState(guardSpec, startNode);

        expect(state.getCurrentNode().choices).toHaveLength(2);
        expect(state.getCurrentNode().choices![0].text).toBe('Help');
        expect(state.getCurrentNode().choices![1].text).toBe('Leave');
    });

    it('choosing Help applies startSeries effect and ends conversation', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(10));
        const state = new ConversationState(guardSpec, startNode);

        const effects = state.selectChoice(0); // "Help"

        expect(state.isEnded()).toBe(true);
        expect(effects).toHaveLength(1);
        expect(effects[0].type).toBe('startSeries');
        expect((effects[0] as any).seriesId).toBe('guardSeries1');
    });

    it('choosing Leave applies no effects and ends conversation', () => {
        const startNode = ConversationConditionEvaluator.resolveStartNode(guardSpec, makeContext(10));
        const state = new ConversationState(guardSpec, startNode);

        const effects = state.selectChoice(1); // "Leave"

        expect(state.isEnded()).toBe(true);
        expect(effects).toHaveLength(0);
    });
});
