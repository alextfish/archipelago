/**
 * Manages the state and flow of a conversation.
 * Pure model logic - no Phaser dependencies, fully testable.
 */

import type { ConversationSpec, ConversationNode, ConversationEffect } from './ConversationData';

export class ConversationState {
    private spec: ConversationSpec;
    private currentNodeId: string;
    private npcExpression: string;
    private ended: boolean;
    private effectsApplied: ConversationEffect[];
    private focusedChoiceIndex: number | null;

    constructor(spec: ConversationSpec) {
        this.spec = spec;
        this.currentNodeId = spec.start;
        this.ended = false;
        this.effectsApplied = [];
        this.focusedChoiceIndex = null;

        // Set initial expression from starting node, or default to neutral
        const startNode = this.spec.nodes[this.currentNodeId];
        this.npcExpression = startNode?.npc?.expression || 'neutral';
    }

    /**
     * Get the conversation ID
     */
    getId(): string {
        return this.spec.id;
    }

    /**
     * Get the NPC ID for this conversation
     */
    getNpcId(): string {
        return this.spec.npcId;
    }

    /**
     * Get the current conversation node
     */
    getCurrentNode(): ConversationNode {
        const node = this.spec.nodes[this.currentNodeId];
        if (!node) {
            throw new Error(`Invalid node ID: ${this.currentNodeId}`);
        }
        return node;
    }

    /**
     * Get the current node ID
     */
    getCurrentNodeId(): string {
        return this.currentNodeId;
    }

    /**
     * Get the current NPC expression
     */
    getCurrentExpression(): string {
        return this.npcExpression;
    }

    /**
     * Check if the conversation has ended
     */
    isEnded(): boolean {
        return this.ended;
    }

    /**
     * Get all effects applied during this conversation
     */
    getAppliedEffects(): ReadonlyArray<ConversationEffect> {
        return this.effectsApplied;
    }

    /**
     * Get the index of the currently keyboard-focused choice, or null if none is focused
     */
    getFocusedChoiceIndex(): number | null {
        return this.focusedChoiceIndex;
    }

    /**
     * Move keyboard focus to the next choice, cycling forward with wrapping.
     * If no choice is currently focused, focuses the first choice.
     * Does nothing if there are no choices on the current node.
     */
    focusNextChoice(): void {
        const choices = this.getCurrentNode().choices;
        if (!choices || choices.length === 0) return;

        if (this.focusedChoiceIndex === null) {
            this.focusedChoiceIndex = 0;
        } else {
            this.focusedChoiceIndex = (this.focusedChoiceIndex + 1) % choices.length;
        }
    }

    /**
     * Move keyboard focus to the previous choice, cycling backward with wrapping.
     * If no choice is currently focused, focuses the last choice.
     * Does nothing if there are no choices on the current node.
     */
    focusPreviousChoice(): void {
        const choices = this.getCurrentNode().choices;
        if (!choices || choices.length === 0) return;

        if (this.focusedChoiceIndex === null) {
            this.focusedChoiceIndex = choices.length - 1;
        } else {
            this.focusedChoiceIndex = (this.focusedChoiceIndex - 1 + choices.length) % choices.length;
        }
    }

    /**
     * Clear keyboard focus from all choices
     */
    clearFocus(): void {
        this.focusedChoiceIndex = null;
    }

    /**
     * Select a choice and advance to the next node
     * @param choiceIndex Index of the choice selected
     * @returns Effects to be applied by the controller
     */
    selectChoice(choiceIndex: number): ConversationEffect[] {
        if (this.ended) {
            throw new Error('Cannot select choice: conversation has ended');
        }

        this.focusedChoiceIndex = null;

        const currentNode = this.getCurrentNode();
        if (!currentNode.choices || choiceIndex < 0 || choiceIndex >= currentNode.choices.length) {
            throw new Error(`Invalid choice index: ${choiceIndex}`);
        }

        const choice = currentNode.choices[choiceIndex];
        const effects = choice.effects || [];

        // Apply effects to internal state
        this.applyEffectsToState(effects);

        // Track applied effects
        this.effectsApplied.push(...effects);

        // Transition to next node or end
        if (choice.end) {
            this.ended = true;
        } else if (choice.next) {
            this.currentNodeId = choice.next;

            // Update expression from new node if specified
            const nextNode = this.getCurrentNode();
            if (nextNode.npc?.expression) {
                this.npcExpression = nextNode.npc.expression;
            }

            // Check if new node ends conversation
            if (nextNode.end) {
                this.ended = true;
            }
        } else {
            // No next node and no explicit end - treat as conversation end
            this.ended = true;
        }

        return effects;
    }

    /**
     * Apply effects to conversation state
     * (External effects like giving items are handled by controller)
     */
    private applyEffectsToState(effects: ConversationEffect[]): void {
        for (const effect of effects) {
            if (effect.type === 'setExpression' && effect.expression) {
                this.npcExpression = effect.expression;
            }
            // Other effect types don't affect conversation state directly
        }
    }

    /**
     * Force the conversation to end
     * Useful for external events (e.g., player walks away)
     */
    forceEnd(): void {
        this.ended = true;
    }
}
