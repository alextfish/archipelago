/**
 * Represents an NPC in the game world.
 * Pure model class - no Phaser dependencies.
 */

export interface NPCExpression {
    neutral: string;   // Sprite frame or animation key for neutral expression
    happy: string;     // Sprite frame or animation key for happy expression
    sad: string;       // Sprite frame or animation key for sad/frown expression
}

export class NPC {
    readonly id: string;
    readonly name: string;
    readonly tileX: number;
    readonly tileY: number;
    readonly language: string;           // 'grass' or 'fire'
    readonly conversationFile?: string;  // Filename in resources/conversations/
    readonly appearanceId: string;       // ID for looking up sprite in registry

    constructor(
        id: string,
        name: string,
        tileX: number,
        tileY: number,
        language: string,
        appearanceId: string,
        conversationFile?: string
    ) {
        this.id = id;
        this.name = name;
        this.tileX = tileX;
        this.tileY = tileY;
        this.language = language;
        this.appearanceId = appearanceId;
        this.conversationFile = conversationFile;
    }

    /**
     * Check if this NPC has a conversation
     */
    hasConversation(): boolean {
        return this.conversationFile !== undefined;
    }

    /**
     * Get the full path to the conversation JSON file
     */
    getConversationPath(): string {
        if (!this.conversationFile) {
            throw new Error(`NPC ${this.id} has no conversation file`);
        }
        return `resources/conversations/${this.conversationFile}`;
    }
}
