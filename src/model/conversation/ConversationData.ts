/**
 * Data structures for conversation specifications loaded from JSON.
 * Pure TypeScript interfaces - no game logic.
 */

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
    start: string;            // Starting node ID
    nodes: Record<string, ConversationNode>;  // Map of node IDs to nodes
}
