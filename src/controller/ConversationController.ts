/**
 * Controller for managing NPC conversations.
 * Orchestrates conversation state, scene rendering, and game state integration.
 */

import { ConversationState } from '@model/conversation/ConversationState';
import type { ConversationSpec, ConversationEffect } from '@model/conversation/ConversationData';
import type { NPC } from '@model/conversation/NPC';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';
import { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';
import { emitTestEvent } from '@helpers/TestEvents';

export interface ConversationHost {
    /**
     * Display NPC dialogue with glyphs
     */
    displayNPCLine(expression: string, glyphFrames: number[], language: string): void;

    /**
     * Display player choice options
     */
    displayChoices(choices: Array<{ text: string; index: number }>): void;

    /**
     * Hide the conversation UI
     */
    hideConversation(): void;

    /**
     * Apply conversation effects (e.g., give items, set flags)
     */
    applyEffects(effects: ConversationEffect[]): void;

    /**
     * Notify that conversation has ended
     */
    onConversationEnd(): void;
}

export class ConversationController {
    private state: ConversationState | null = null;
    private host: ConversationHost;
    private glyphRegistry: LanguageGlyphRegistry;
    private appearanceRegistry: NPCAppearanceRegistry;
    private currentNPC: NPC | null = null;
    private currentConversationId: string | null = null;

    constructor(
        host: ConversationHost,
        glyphRegistry?: LanguageGlyphRegistry,
        appearanceRegistry?: NPCAppearanceRegistry
    ) {
        this.host = host;
        this.glyphRegistry = glyphRegistry || new LanguageGlyphRegistry();
        this.appearanceRegistry = appearanceRegistry || new NPCAppearanceRegistry();
    }

    /**
     * Start a conversation with an NPC
     * Conversations always reset to the beginning, even if previously completed
     */
    startConversation(spec: ConversationSpec, npc: NPC): void {
        if (this.state && !this.state.isEnded()) {
            console.warn('Starting new conversation while previous one is still active');
        }

        console.log(`ConversationController: Starting conversation with ${npc.name}, spec:`, spec);

        // Always create a fresh state - conversations reset each time
        this.state = new ConversationState(spec);
        this.currentNPC = npc;
        this.currentConversationId = spec.id;

        // Emit test event
        emitTestEvent('conversation_started', {
            conversationId: spec.id,
            npcId: spec.npcId,
            npcName: npc.name
        });

        // Display the first node
        this.displayCurrentNode();

        console.log(`ConversationController: First node displayed. Conversation's ended status: ${this.state.isEnded()}`);
    }

    /**
     * Handle player selecting a choice
     */
    selectChoice(choiceIndex: number): void {
        if (!this.state) {
            throw new Error('No active conversation');
        }

        if (this.state.isEnded()) {
            throw new Error('Conversation has already ended');
        }

        // Remember the current node before selecting choice
        const previousNodeId = this.state.getCurrentNodeId();

        // Apply choice and get effects
        const effects = this.state.selectChoice(choiceIndex);

        // Let host apply effects (items, flags, etc.)
        if (effects.length > 0) {
            this.host.applyEffects(effects);
        }

        // Check if conversation ended after selecting choice
        if (this.state.isEnded()) {
            const currentNodeId = this.state.getCurrentNodeId();
            const transitionedToNewNode = currentNodeId !== previousNodeId;

            // Only display final node if we actually transitioned to a new node
            if (transitionedToNewNode) {
                const node = this.state.getCurrentNode();
                if (node.npc) {
                    console.log('ConversationController: Displaying final node, will wait for dismissal');
                    this.displayCurrentNode();
                    // Don't call onConversationEnd yet - wait for player to dismiss
                    return;
                }
            }

            // No transition to new node, or no final NPC line - end immediately
            console.log('ConversationController: Ending conversation immediately');
            this.endConversation(); // Emit test event and clear state
            this.host.hideConversation();
            this.host.onConversationEnd();
        } else {
            // Display next node
            this.displayCurrentNode();
        }
    }

    /**
     * Display the current conversation node
     */
    private displayCurrentNode(): void {
        if (!this.state || !this.currentNPC) {
            throw new Error('No active conversation');
        }

        const node = this.state.getCurrentNode();
        const expression = this.state.getCurrentExpression();

        console.log(`ConversationController: Displaying node`, node);

        // Display NPC line if present
        if (node.npc) {
            const glyphFrames = this.glyphRegistry.parseGlyphs(
                this.currentNPC.language,
                node.npc.glyphs
            );

            console.log(`ConversationController: Displaying NPC line with ${glyphFrames.length} glyphs`);
            this.host.displayNPCLine(expression, glyphFrames, this.currentNPC.language);
        }

        // Always display choices (even if empty) to clear old buttons
        const choiceData = node.choices ? node.choices.map((choice, index) => ({
            text: choice.text,
            index,
        })) : [];

        console.log(`ConversationController: Displaying ${choiceData.length} choices`);
        this.host.displayChoices(choiceData);
    }

    /**
     * End the current conversation
     * Emits test event and clears internal state
     * Note: Does NOT call host methods - caller should do that
     */
    endConversation(): void {
        if (!this.state) {
            return;
        }

        // Emit test event before clearing state
        emitTestEvent('conversation_ended', {
            conversationId: this.currentConversationId,
            npcId: this.currentNPC?.id,
            completed: this.state.isEnded()
        });

        // Clear state
        this.state = null;
        this.currentNPC = null;
        this.currentConversationId = null;
    }

    /**
     * Force end conversation (e.g., player walks away)
     */
    forceEnd(): void {
        if (this.state && !this.state.isEnded()) {
            this.state.forceEnd();
        }
        this.endConversation();
    }

    /**
     * Check if a conversation is currently active
     */
    isActive(): boolean {
        return this.state !== null && !this.state.isEnded();
    }

    /**
     * Get the current conversation state (for testing/debugging)
     */
    getCurrentState(): ConversationState | null {
        return this.state;
    }

    /**
     * Get the current NPC (for testing/debugging)
     */
    getCurrentNPC(): NPC | null {
        return this.currentNPC;
    }

    /**
     * Get the glyph registry
     */
    getGlyphRegistry(): LanguageGlyphRegistry {
        return this.glyphRegistry;
    }

    /**
     * Get the appearance registry
     */
    getAppearanceRegistry(): NPCAppearanceRegistry {
        return this.appearanceRegistry;
    }
}
