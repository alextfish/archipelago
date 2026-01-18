/**
 * Registry for NPC sprite appearances and expressions.
 * Maps NPC appearance IDs to sprite asset keys and expression frame names.
 */

export interface NPCAppearance {
    spriteKey: string;         // Phaser asset key for sprite sheet
    expressions: {
        neutral: string | number;  // Frame name or index
        happy: string | number;
        sad: string | number;
    };
}

export class NPCAppearanceRegistry {
    private appearances: Map<string, NPCAppearance>;

    constructor() {
        this.appearances = new Map();
        this.initializeAppearances();
    }

    /**
     * Initialize built-in NPC appearances
     */
    private initializeAppearances(): void {
        // Sailor facing North/South
        this.appearances.set('sailorNS', {
            spriteKey: 'sailorNS',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });

        // Sailor facing East/West
        this.appearances.set('sailorEW', {
            spriteKey: 'sailorEW',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });
    }

    /**
     * Get appearance data for an NPC
     */
    getAppearance(appearanceId: string): NPCAppearance {
        const appearance = this.appearances.get(appearanceId);
        if (!appearance) {
            throw new Error(`Unknown NPC appearance: ${appearanceId}`);
        }
        return appearance;
    }

    /**
     * Get the sprite asset path for loading
     */
    getSpritePath(appearanceId: string): string {
        // Verify appearance exists
        this.getAppearance(appearanceId);
        return `resources/sprites/${appearanceId}.png`;
    }

    /**
     * Register a new NPC appearance
     * Useful for testing or runtime expansion
     */
    registerAppearance(appearanceId: string, appearance: NPCAppearance): void {
        this.appearances.set(appearanceId, appearance);
    }

    /**
     * Check if an appearance is registered
     */
    hasAppearance(appearanceId: string): boolean {
        return this.appearances.has(appearanceId);
    }
}
