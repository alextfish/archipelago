/**
 * Data structures for conversation specifications loaded from JSON.
 * Pure TypeScript interfaces - no game logic.
 */

// ---------------------------------------------------------------------------
// Conversation conditions – used to pick a non-default start node at runtime
// ---------------------------------------------------------------------------

/**
 * Condition that passes when the player holds at least `count` jewels of the
 * specified `colour`.
 */
export interface HasJewelsCondition {
    type: 'hasJewels';
    /** Jewel colour key, e.g. 'red'. */
    colour: string;
    /** Minimum number of jewels required. */
    count: number;
}

/** Union of all supported condition types (extend as needed). */
export type ConversationCondition = HasJewelsCondition;

/**
 * A conditional branch for the conversation start node.
 * When `condition` evaluates to true at runtime the conversation begins at
 * `start` instead of `ConversationSpec.start`.
 */
export interface ConditionalStart {
    condition: ConversationCondition;
    /** Node ID to jump to when the condition is met. */
    start: string;
}

// ---------------------------------------------------------------------------

export interface ConversationEffect {
    type: 'setExpression' | 'giveItem' | 'setFlag' | 'startPuzzle' | 'startSeries' | 'unlockDoor';
    expression?: string;      // For setExpression
    durationMs?: number;       // Duration for temporary effects
    itemId?: string;          // For giveItem
    flagId?: string;          // For setFlag
    flagValue?: boolean;      // For setFlag
    puzzleId?: string;        // For startPuzzle
    seriesId?: string;        // For startSeries
    doorId?: string;          // For unlockDoor
}

export interface ConversationChoice {
    text: string;              // English text for player response
    glyphs?: string;          // Optional: if player learns to speak language
    next?: string;            // Next node ID to transition to
    effects?: ConversationEffect[];  // Effects to apply when chosen
    end?: boolean;            // If true, ends conversation after this choice
}

export interface ConversationNode {
    npc?: {
        expression: string;     // NPC expression: 'neutral', 'happy', 'sad'
        glyphs: string;         // Space-separated glyph words
        frame?: string;         // Optional: custom sprite key (e.g., 'faces/Lyuba neutral')
    };
    player?: {
        glyphs?: string;        // If player somehow speaks language
    };
    choices?: ConversationChoice[];  // Player response options
    end?: boolean;            // If true, conversation ends at this node
}

export interface ConversationSpec {
    id: string;               // Unique conversation identifier
    npcId: string;            // Which NPC this conversation belongs to
    start: string;            // Default starting node ID
    /**
     * Optional list of conditional branches evaluated in order at conversation
     * start.  The first condition that passes overrides `start`.
     */
    conditionalStart?: ConditionalStart[];
    nodes: Record<string, ConversationNode>;  // Map of node IDs to nodes
}
