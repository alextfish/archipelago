/**
 * Renders a speech bubble with language glyphs.
 * Creates a 9-patch style bubble using corner, edge, and center tiles.
 */

import Phaser from 'phaser';
import type { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';
import type { ActiveGlyphTracker, GlyphScreenBounds } from '@model/translation/ActiveGlyphTracker';

export class SpeechBubble {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private backgroundTiles: Phaser.GameObjects.Image[] = [];
    private glyphSprites: Phaser.GameObjects.Image[] = [];
    /** Frame index for each entry in glyphSprites (same order). */
    private glyphFrameIndices: number[] = [];
    private tilesetKey: string;

    /** Unique ID used when registering with ActiveGlyphTracker. */
    private readonly registrationID: string;
    /** Tracker to register/unregister with, if provided. */
    private glyphTracker: ActiveGlyphTracker | null = null;
    /** Tile size (unscaled pixels) recorded at last create() call. */
    private currentTileSize: number = 32;

    /** Counter used to generate unique registration IDs per bubble instance. */
    private static nextID = 0;

    constructor(scene: Phaser.Scene, tilesetKey: string) {
        this.scene = scene;
        this.tilesetKey = tilesetKey;
        this.container = scene.add.container(0, 0);
        this.registrationID = `speech-bubble-${SpeechBubble.nextID++}`;
    }

    /**
     * Attach an ActiveGlyphTracker so that this bubble registers its glyphs
     * whenever create() is called and unregisters them on clear()/destroy().
     * Should be called once immediately after construction.
     */
    setGlyphTracker(tracker: ActiveGlyphTracker): void {
        this.glyphTracker = tracker;
    }

    /**
     * Create speech bubble with glyphs
     * @param glyphFrames Array of frame indices for glyphs
     * @param language Language ID (for getting speech bubble frames)
     * @param registry Glyph registry
     * @param scale Scale factor for the bubble (default 1)
     */
    create(glyphFrames: number[], language: string, registry: LanguageGlyphRegistry, scale: number = 1): void {
        // Clear existing content (also unregisters from tracker)
        this.clear();

        if (glyphFrames.length === 0) {
            return;
        }

        const bubbleFrames = registry.getSpeechBubbleFrames(language);
        const tileSize = 32; // Assuming 32x32 tiles
        const glyphCount = glyphFrames.length;

        // Calculate bubble dimensions
        const bubbleWidth = glyphCount + 2; // +2 for left/right edges
        const bubbleHeight = 3; // Top edge, middle (with glyphs), bottom edge

        // Build background
        this.buildBackground(bubbleFrames, bubbleWidth, bubbleHeight, tileSize);

        // Add glyphs
        this.addGlyphs(glyphFrames, tileSize);

        // Apply scale to the entire container
        this.container.setScale(scale);

        // Center the container's pivot
        this.container.setSize(bubbleWidth * tileSize, bubbleHeight * tileSize);

        // Record tile size for screen-bounds calculation
        this.currentTileSize = tileSize;

        // Register with tracker if one has been provided
        if (this.glyphTracker) {
            this.glyphTracker.registerGlyphSet({
                id: this.registrationID,
                language,
                glyphs: glyphFrames.map((f, i) => ({ frameIndex: f, indexInBubble: i })),
                getBounds: () => this.getGlyphScreenBounds(),
            });
        }
    }

    /**
     * Build the speech bubble background using 9-patch tiles
     */
    private buildBackground(
        frames: any,
        width: number,
        height: number,
        tileSize: number
    ): void {
        // Top row - use arrow for leftmost tile to point at speaker
        this.addBackgroundTile(frames.topLeft, 0, 0, tileSize);
        for (let x = 1; x < width - 1; x++) {
            this.addBackgroundTile(frames.topEdge, x, 0, tileSize);
        }
        this.addBackgroundTile(frames.topRight, width - 1, 0, tileSize);

        // Middle rows (where glyphs go)
        for (let y = 1; y < height - 1; y++) {
            // Middle row with glyphs
            if (y === 1) {
                this.addBackgroundTile(frames.arrow, 0, y, tileSize);
            } else {
                this.addBackgroundTile(frames.leftEdge, 0, y, tileSize);
            }
            for (let x = 1; x < width - 1; x++) {
                this.addBackgroundTile(frames.centre, x, y, tileSize);
            }
            this.addBackgroundTile(frames.rightEdge, width - 1, y, tileSize);
        }

        // Bottom row
        this.addBackgroundTile(frames.bottomLeft, 0, height - 1, tileSize);
        for (let x = 1; x < width - 1; x++) {
            this.addBackgroundTile(frames.bottomEdge, x, height - 1, tileSize);
        }
        this.addBackgroundTile(frames.bottomRight, width - 1, height - 1, tileSize);
    }

    /**
     * Add a single background tile
     */
    private addBackgroundTile(frameIndex: number, gridX: number, gridY: number, tileSize: number): void {
        const tile = this.scene.add.image(
            gridX * tileSize,
            gridY * tileSize,
            this.tilesetKey,
            frameIndex
        );
        tile.setOrigin(0, 0); // Top-left origin for grid alignment
        this.container.add(tile);
        this.backgroundTiles.push(tile);
    }

    /**
     * Add glyph sprites to the bubble
     */
    private addGlyphs(glyphFrames: number[], tileSize: number): void {
        const startX = tileSize; // Start after left edge
        const y = tileSize; // Middle row

        for (let i = 0; i < glyphFrames.length; i++) {
            const glyph = this.scene.add.image(
                startX + i * tileSize,
                y,
                this.tilesetKey,
                glyphFrames[i]
            );
            glyph.setOrigin(0, 0);
            this.container.add(glyph);
            this.glyphSprites.push(glyph);
            this.glyphFrameIndices.push(glyphFrames[i]);
        }
    }

    /**
     * Set the position of the speech bubble
     */
    setPosition(x: number, y: number): void {
        this.container.setPosition(x, y);
    }

    /**
     * Set the depth of the speech bubble
     */
    setDepth(depth: number): void {
        this.container.setDepth(depth);
    }

    /**
     * Set visibility
     */
    setVisible(visible: boolean): void {
        this.container.setVisible(visible);
    }

    /**
     * Get the container for additional manipulation
     */
    getContainer(): Phaser.GameObjects.Container {
        return this.container;
    }

    /**
     * Compute the current screen bounds for each glyph sprite.
     * Returns null if no glyphs are displayed.
     */
    getGlyphScreenBounds(): GlyphScreenBounds[] | null {
        if (this.glyphSprites.length === 0) {
            return null;
        }
        const scale = this.container.scaleX;
        const scaledTile = this.currentTileSize * scale;
        const matrix = this.container.getWorldTransformMatrix();
        return this.glyphSprites.map((sprite, i) => {
            // Compute screen position of the sprite's top-left corner
            const screenX = matrix.tx + sprite.x * matrix.a + sprite.y * matrix.c;
            const screenY = matrix.ty + sprite.x * matrix.b + sprite.y * matrix.d;
            return {
                frameIndex: this.glyphFrameIndices[i],
                indexInBubble: i,
                screenX,
                screenY,
                tileSize: scaledTile,
            };
        });
    }

    /**
     * Clear all content
     */
    clear(): void {
        // Unregister from tracker first
        if (this.glyphTracker) {
            this.glyphTracker.unregisterGlyphSet(this.registrationID);
        }

        // Destroy all background tiles
        for (const tile of this.backgroundTiles) {
            tile.destroy();
        }
        this.backgroundTiles = [];

        // Destroy all glyphs
        for (const glyph of this.glyphSprites) {
            glyph.destroy();
        }
        this.glyphSprites = [];
        this.glyphFrameIndices = [];
    }

    /**
     * Destroy the speech bubble
     */
    destroy(): void {
        this.clear();
        this.container.destroy();
    }
}

