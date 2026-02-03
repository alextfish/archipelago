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
    readonly language: string;                  // 'grass' or 'fire'
    readonly conversationFile?: string;         // Filename in resources/conversations/
    readonly conversationFileSolved?: string;   // Conversation after series solved
    readonly seriesFile?: string;               // Filename in src/data/series/
    readonly appearanceId: string;              // ID for looking up sprite in registry

    constructor(
        id: string,
        name: string,
        tileX: number,
        tileY: number,
        language: string,
        appearanceId: string,
        conversationFile?: string,
        conversationFileSolved?: string,
        seriesFile?: string
    ) {
        this.id = id;
        this.name = name;
        this.tileX = tileX;
        this.tileY = tileY;
        this.language = language;
        this.appearanceId = appearanceId;
        this.conversationFile = conversationFile;
        this.conversationFileSolved = conversationFileSolved;
        this.seriesFile = seriesFile;
    }

    /**
     * Check if this NPC has a conversation
     */
    hasConversation(): boolean {
        return this.conversationFile !== undefined || this.conversationFileSolved !== undefined;
    }

    /**
     * Check if this NPC has a puzzle series
     */
    hasSeries(): boolean {
        return this.seriesFile !== undefined;
    }

    /**
     * Get the full path to the conversation JSON file
     * @param seriesSolved - Whether the series is solved (to select appropriate conversation)
     */
    getConversationPath(seriesSolved: boolean = false): string {
        const file = seriesSolved && this.conversationFileSolved 
            ? this.conversationFileSolved 
            : this.conversationFile;
        
        if (!file) {
            throw new Error(`NPC ${this.id} has no conversation file`);
        }
        return `resources/conversations/${file}`;
    }

    /**
     * Get the full path to the series JSON file
     */
    getSeriesPath(): string {
        if (!this.seriesFile) {
            throw new Error(`NPC ${this.id} has no series file`);
        }
        return `src/data/series/${this.seriesFile}`;
    }
}
