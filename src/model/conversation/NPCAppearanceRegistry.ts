/**
 * Registry for NPC sprite appearances and expressions.
 * Maps NPC appearance IDs to sprite asset keys and expression frame names.
 */

export interface NPCAppearance {
    spriteKey: string;         // Phaser asset key for sprite sheet
    faceId?: string;           // Override for face texture lookup (e.g. 'Yan' for 'Farmer')
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

        // Mage4 appearance
        this.appearances.set('Mage4', {
            spriteKey: 'Mage4',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });

        // Lyuba appearance
        this.appearances.set('Lyuba', {
            spriteKey: 'Lyuba',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });

        // Ruby appearance
        this.appearances.set('Ruby', {
            spriteKey: 'Ruby',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });

        // Fisherman appearance (uses Evan face sprites)
        this.appearances.set('Fisherman', {
            spriteKey: 'Fisherman',
            faceId: 'Evan',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });

        // Farmer appearance (uses Yan face sprites)
        this.appearances.set('Farmer', {
            spriteKey: 'Farmer',
            faceId: 'Yan',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });

        // Pirate-M appearance (IslandPassingBridgeCountConstraint, IslandDirectionalBridgeConstraint)
        this.appearances.set('Pirate-M', {
            spriteKey: 'Pirate-M',
            expressions: {
                neutral: 0,
                happy: 1,
                sad: 2,
            },
        });

        // Pirate-F appearance (IslandVisibilityConstraint)
        this.appearances.set('Pirate-F', {
            spriteKey: 'Pirate-F',
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

    /**
     * Get the high-resolution face texture key for a given appearance and expression.
     * Returns the texture key in format "faces/{appearanceId} {expression}" if it exists,
     * otherwise returns undefined (fallback to sprite-based portrait).
     * 
     * @param appearanceId - The NPC appearance ID (e.g., "Ruby", "Lyuba")
     * @param expression - The expression name (e.g., "neutral", "happy", "sad")
     * @returns The face texture key or undefined if not available
     */
    getFaceTextureKey(appearanceId: string, expression: string): string | undefined {
        // Use faceId override if present (e.g. Farmer → Yan, Fisherman → Evan)
        const appearance = this.appearances.get(appearanceId);
        const faceId = appearance?.faceId ?? appearanceId;
        const faceKey = `faces/${faceId} ${expression}`;
        return faceKey;
    }
}
