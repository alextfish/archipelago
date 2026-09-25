/**
 * Registry for NPC sprite appearances and expressions.
 * Maps NPC appearance IDs to sprite asset keys and expression frame names.
 */

/** A single frame in an NPC idle animation, with an explicit duration in milliseconds. */
export interface NPCAnimationFrame {
    frame: string | number;
    duration: number; // milliseconds
}

export type NPCExpressionName = 'neutral' | 'happy' | 'sad';

type NPCExpressionFrames = Partial<Record<NPCExpressionName, string | number>>;

export interface NPCAppearance {
    spriteKey: string;         // Phaser asset key for sprite sheet
    faceId?: string;           // Override for face texture lookup (e.g. 'Yan' for 'Farmer')
    defaultFaceTexture?: string;
    faceTextureOverrides?: Partial<Record<NPCExpressionName, string>>;
    expressions?: NPCExpressionFrames;
    /** Idle animation frames to loop when the NPC has `animate: true`. Omit for static sprites. */
    idleAnimation?: NPCAnimationFrame[];
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
                happy: 2,
                sad: 1,
            },
        });

        // Sailor facing East/West
        this.appearances.set('sailorEW', {
            spriteKey: 'sailorEW',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        // Mage4 appearance
        this.appearances.set('Mage4', {
            spriteKey: 'Mage4',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        // Lyuba appearance
        this.appearances.set('Lyuba', {
            spriteKey: 'Lyuba',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        // Ruby appearance
        this.appearances.set('Ruby', {
            spriteKey: 'Ruby',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        // Fisherman appearance (uses Evan face sprites)
        this.appearances.set('Fisherman', {
            spriteKey: 'Fisherman',
            faceId: 'Evan',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        // Farmer appearance (uses Yan face sprites)
        this.appearances.set('Farmer', {
            spriteKey: 'Farmer',
            faceId: 'Yan',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        // Town children appearances
        this.appearances.set('Child1', {
            spriteKey: 'Townfolk-Child-F-001 dark',
            defaultFaceTexture: 'faces/Townfolk-Child-F-001 dark',
        });

        this.appearances.set('Child2', {
            spriteKey: 'Townfolk-Child-M-002 light',
            defaultFaceTexture: 'faces/Townfolk-Child-M-002 light',
        });

        // Pirate-M appearance (IslandPassingBridgeCountConstraint, IslandDirectionalBridgeConstraint)
        this.appearances.set('Pirate-M', {
            spriteKey: 'Pirate-M',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        // Pirate-F appearance (IslandVisibilityConstraint)
        this.appearances.set('Pirate-F', {
            spriteKey: 'Pirate-F',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
            faceTextureOverrides: {
                happy: 'faces/Pirate-F happy',
            },
            idleAnimation: [
                { frame: 11, duration: 200 },
                { frame: 9, duration: 200 },
                { frame: 10, duration: 400 },
            ],
        });

        // Journal Cave disguise appearances
        this.appearances.set('Cultist-01', {
            spriteKey: 'Cultist-01',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        this.appearances.set('Cultist-02', {
            spriteKey: 'Cultist-02',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        this.appearances.set('Cultist-03', {
            spriteKey: 'Cultist-03',
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        this.appearances.set('Cultist-01-Pirate-M', {
            spriteKey: 'Cultist-01-Pirate-M',
            faceId: 'Pirate-M',
            faceTextureOverrides: {
                happy: 'faces/Pirate-M cultist happy',
            },
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        this.appearances.set('Cultist-02-Ruby', {
            spriteKey: 'Cultist-02-Ruby',
            faceId: 'Ruby',
            faceTextureOverrides: {
                happy: 'faces/Ruby cultist happy',
            },
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
            },
        });

        this.appearances.set('Cultist-03-Pirate-F', {
            spriteKey: 'Cultist-03-Pirate-F',
            faceId: 'Pirate-F',
            faceTextureOverrides: {
                happy: 'faces/Pirate-F cultist happy',
            },
            expressions: {
                neutral: 0,
                happy: 2,
                sad: 1,
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
     * Get the idle animation frames for a given appearance, or undefined if none.
     */
    getIdleAnimation(appearanceId: string): NPCAnimationFrame[] | undefined {
        return this.appearances.get(appearanceId)?.idleAnimation;
    }

    /**
     * Get all registered appearance IDs.
     */
    getAllAppearanceIDs(): string[] {
        return Array.from(this.appearances.keys());
    }

    /**
     * Resolve a spritesheet frame for a conversation expression.
     * Falls back to neutral when an appearance does not define a frame.
     */
    getExpressionFrame(appearanceId: string, expression: string): string | number {
        const appearance = this.getAppearance(appearanceId);
        const expressionKey = this.getSpriteExpressionName(expression);

        return appearance.expressions?.[expressionKey] ?? appearance.expressions?.neutral ?? 0;
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
        const appearance = this.getAppearance(appearanceId);
        const expressionKey = this.getSpriteExpressionName(expression);
        const overrideKey = appearance?.faceTextureOverrides?.[expressionKey];
        if (overrideKey) {
            return overrideKey;
        }

        if (appearance.defaultFaceTexture) {
            return appearance.defaultFaceTexture;
        }

        const faceId = appearance?.faceId ?? appearanceId;
        const faceKey = `faces/${faceId} ${expression}`;
        return faceKey;
    }

    private getSpriteExpressionName(expression: string): NPCExpressionName {
        switch (expression) {
            case 'happy':
                return 'happy';
            case 'sad':
            case 'frown':
                return 'sad';
            case 'neutral':
            default:
                return 'neutral';
        }
    }
}
