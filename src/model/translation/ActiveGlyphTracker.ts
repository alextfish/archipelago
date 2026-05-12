/**
 * Tracks all glyph sets currently displayed on screen.
 * Pure model – no Phaser dependencies and no screen-coordinate logic.
 *
 * When a speech bubble (or any other view component) renders glyphs it calls
 * registerGlyphSet(); when the glyphs are hidden or destroyed it calls
 * unregisterGlyphSet().  The Translation Mode overlay reads from this tracker
 * to know which glyphs exist, then obtains screen positions via the
 * getBounds callback stored with each registration.
 */

/** A single glyph within a registered set. */
export interface TrackedGlyph {
    /** Tileset frame index identifying the glyph tile. */
    frameIndex: number;
    /** Zero-based position of this glyph inside the bubble (left → right). */
    indexInBubble: number;
}

/**
 * Callback provided by the view layer.  Returns the current screen bounds for
 * every glyph in the set, or null when the glyphs are not visible / positions
 * cannot be determined.
 */
export type GlyphBoundsProvider = () => GlyphScreenBounds[] | null;

/** Screen-space bounds for a single glyph tile. */
export interface GlyphScreenBounds {
    frameIndex: number;
    indexInBubble: number;
    /** Pixel X of the top-left corner of the glyph in screen (viewport) coordinates. */
    screenX: number;
    /** Pixel Y of the top-left corner of the glyph in screen (viewport) coordinates. */
    screenY: number;
    /** Side length of the glyph tile in pixels (already accounting for scale). */
    tileSize: number;
}

/** One registered glyph set (typically one speech bubble). */
export interface GlyphRegistration {
    /** Unique identifier assigned by the caller when registering. */
    id: string;
    /** Language key (e.g. "grass", "fire"). */
    language: string;
    /** Logical glyphs in this set. */
    glyphs: TrackedGlyph[];
    /**
     * View-layer callback that returns current screen positions.
     * Stored here so translation-mode code can obtain coordinates without
     * the model importing Phaser.
     */
    getBounds: GlyphBoundsProvider;
}

export class ActiveGlyphTracker {
    private registrations: Map<string, GlyphRegistration> = new Map();

    /**
     * Register a set of glyphs that are now being displayed.
     * Replaces any existing registration with the same id.
     */
    registerGlyphSet(registration: GlyphRegistration): void {
        this.registrations.set(registration.id, registration);
    }

    /**
     * Remove a glyph set registration (call when the bubble is
     * cleared or destroyed).
     */
    unregisterGlyphSet(id: string): void {
        this.registrations.delete(id);
    }

    /** Check whether a registration exists for the given id. */
    hasRegistration(id: string): boolean {
        return this.registrations.has(id);
    }

    /** Return all current glyph registrations. */
    getRegistrations(): ReadonlyMap<string, GlyphRegistration> {
        return this.registrations;
    }

    /**
     * Collect screen bounds for every visible glyph across all registrations.
     * Registrations whose getBounds() returns null are skipped.
     */
    getAllGlyphBounds(): GlyphScreenBounds[] {
        const result: GlyphScreenBounds[] = [];
        for (const reg of this.registrations.values()) {
            const bounds = reg.getBounds();
            if (bounds) {
                result.push(...bounds);
            }
        }
        return result;
    }

    /** Remove all registrations (e.g. on scene teardown). */
    clearAll(): void {
        this.registrations.clear();
    }
}
