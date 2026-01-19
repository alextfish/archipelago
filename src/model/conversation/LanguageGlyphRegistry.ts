/**
 * Registry for language glyphs and speech bubble frames.
 * Pure data structure - no Phaser dependencies.
 * 
 * Each language (e.g., "grass", "fire") has:
 * - Speech bubble frame indices (9 tiles for corners, edges, center)
 * - Glyph mappings (word -> tile index)
 * - Missing glyph fallback tile index
 */

export interface SpeechBubbleFrames {
    topLeft: number;
    topEdge: number;
    topRight: number;
    leftEdge: number;
    centre: number;
    rightEdge: number;
    bottomLeft: number;
    bottomEdge: number;
    bottomRight: number;
    arrow: number;
}

export interface LanguageDefinition {
    name: string;
    speechBubbleFrames: SpeechBubbleFrames;
    glyphs: Map<string, number>;  // word -> frame index in tileset
    missingGlyphFrame: number;     // Fallback for unknown words
}

export class LanguageGlyphRegistry {
    private languages: Map<string, LanguageDefinition>;
    private tilesetPath: string;

    constructor() {
        this.languages = new Map();
        this.tilesetPath = 'resources/tilesets/language.png';
        this.initializeLanguages();
    }

    /**
     * Initialize built-in languages (grass and fire)
     */
    private initializeLanguages(): void {
        // Grass language
        const grassGlyphs = new Map<string, number>([
            ['you', 30],
            ['me', 31],
            ['bridge', 32],
            ['want', 33],
            ['build', 34],
            ['adjacent', 35],
            ['not', 36],
            ['vertical', 37],
            ['horizontal', 38],
            ['question', 39],
        ]);

        this.languages.set('grass', {
            name: 'grass',
            speechBubbleFrames: {
                topLeft: 0,
                topEdge: 1,
                topRight: 2,
                leftEdge: 10,
                centre: 11,
                rightEdge: 12,
                bottomLeft: 20,
                bottomEdge: 21,
                bottomRight: 22,
                arrow: 16,
            },
            glyphs: grassGlyphs,
            missingGlyphFrame: 6,
        });

        // Fire language
        const fireGlyphs = new Map<string, number>([
            // TODO: Add fire language glyphs when available
        ]);

        this.languages.set('fire', {
            name: 'fire',
            speechBubbleFrames: {
                topLeft: 3,
                topEdge: 4,
                topRight: 5,
                leftEdge: 13,
                centre: 14,
                rightEdge: 15,
                bottomLeft: 23,
                bottomEdge: 24,
                bottomRight: 25,
                arrow: 17,
            },
            glyphs: fireGlyphs,
            missingGlyphFrame: 7,
        });
    }

    /**
     * Get the tileset path for loading in Phaser
     */
    getTilesetPath(): string {
        return this.tilesetPath;
    }

    /**
     * Get speech bubble frame indices for a language
     */
    getSpeechBubbleFrames(language: string): SpeechBubbleFrames {
        const lang = this.languages.get(language);
        if (!lang) {
            throw new Error(`Unknown language: ${language}`);
        }
        return lang.speechBubbleFrames;
    }

    /**
     * Get the frame index for a specific glyph word
     * Returns missing glyph frame if word not found
     */
    getGlyphFrame(language: string, word: string): number {
        const lang = this.languages.get(language);
        if (!lang) {
            throw new Error(`Unknown language: ${language}`);
        }

        const frame = lang.glyphs.get(word.toLowerCase());
        return frame !== undefined ? frame : lang.missingGlyphFrame;
    }

    /**
     * Parse a glyph string (space-separated words) into frame indices
     */
    parseGlyphs(language: string, glyphText: string): number[] {
        const words = glyphText.trim().split(/\s+/);
        return words.map(word => this.getGlyphFrame(language, word));
    }

    /**
     * Calculate speech bubble dimensions needed for text
     * @param glyphText Space-separated words
     * @returns Width in characters and number of rows
     */
    calculateBubbleSize(glyphText: string): { width: number; rows: number } {
        const words = glyphText.trim().split(/\s+/);

        // For now, assume single row
        // TODO: Implement word wrapping for multi-line bubbles if needed
        return {
            width: words.length,
            rows: 1,
        };
    }

    /**
     * Add or update a glyph in a language
     * Useful for testing or runtime expansion
     */
    addGlyph(language: string, word: string, frameIndex: number): void {
        const lang = this.languages.get(language);
        if (!lang) {
            throw new Error(`Unknown language: ${language}`);
        }
        lang.glyphs.set(word.toLowerCase(), frameIndex);
    }

    /**
     * Check if a language is registered
     */
    hasLanguage(language: string): boolean {
        return this.languages.has(language);
    }
}
