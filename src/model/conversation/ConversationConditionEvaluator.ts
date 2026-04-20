/**
 * Pure model class that evaluates conversation conditions against player state
 * and resolves which starting node to use.
 *
 * No Phaser dependencies – fully unit-testable.
 */

import type { ConversationSpec, ConversationCondition } from './ConversationData';

/**
 * Provides read access to the parts of player state that conversation
 * conditions can query.
 */
export interface ConditionContext {
    /**
     * Return how many jewels of the given colour the player has collected.
     * Should return 0 if the colour is unknown.
     */
    getJewelCount(colour: string): number;
}

export class ConversationConditionEvaluator {
    /**
     * Determine the starting node ID for a conversation.
     *
     * If `spec.conditionalStart` is defined, the conditions are tested in
     * order; the `start` of the first passing condition is returned.
     * Falls back to `spec.start` when no condition matches (or when there are
     * no conditional branches).
     *
     * @param spec    The conversation specification.
     * @param context Current player state used for condition evaluation.
     * @returns The node ID that the conversation should begin at.
     */
    static resolveStartNode(spec: ConversationSpec, context: ConditionContext): string {
        if (!spec.conditionalStart || spec.conditionalStart.length === 0) {
            return spec.start;
        }

        for (const branch of spec.conditionalStart) {
            if (ConversationConditionEvaluator.evaluate(branch.condition, context)) {
                return branch.start;
            }
        }

        return spec.start;
    }

    /**
     * Evaluate a single condition against the given context.
     */
    private static evaluate(condition: ConversationCondition, context: ConditionContext): boolean {
        switch (condition.type) {
            case 'hasJewels':
                return context.getJewelCount(condition.colour) >= condition.count;
        }
    }
}
