/**
 * Stores the player's guessed translations for language glyphs.
 * Maps glyph frame indices to the player's typed translation text.
 * Pure model – no Phaser dependencies.
 */
export class PlayerTranslationDictionary {
    private translations: Map<number, string> = new Map();

    /**
     * Record or update the player's translation for a glyph frame.
     * Passing an empty (or whitespace-only) string removes the entry.
     * @param frameIndex Tileset frame index of the glyph
     * @param text The player's guessed translation
     */
    setTranslation(frameIndex: number, text: string): void {
        const trimmed = text.trim();
        if (trimmed === '') {
            this.translations.delete(frameIndex);
        } else {
            this.translations.set(frameIndex, trimmed);
        }
    }

    /**
     * Get the player's current translation for a glyph frame.
     * Returns undefined if no translation has been set.
     */
    getTranslation(frameIndex: number): string | undefined {
        return this.translations.get(frameIndex);
    }

    /**
     * Check whether the player has set a translation for a given glyph frame.
     */
    hasTranslation(frameIndex: number): boolean {
        return this.translations.has(frameIndex);
    }

    /**
     * Read-only view of all stored translations.
     */
    getAllTranslations(): ReadonlyMap<number, string> {
        return this.translations;
    }

    /**
     * Remove the translation for a specific glyph frame.
     */
    deleteTranslation(frameIndex: number): void {
        this.translations.delete(frameIndex);
    }

    /**
     * Clear all stored translations.
     */
    clearAll(): void {
        this.translations.clear();
    }
}
