/**
 * Renders a speech bubble with language glyphs.
 * Creates a 9-patch style bubble using corner, edge, and center tiles.
 */

import Phaser from 'phaser';
import type { LanguageGlyphRegistry, SpeechBubbleFrames } from '@model/conversation/LanguageGlyphRegistry';
import type { ActiveGlyphTracker, GlyphScreenBounds } from '@model/translation/ActiveGlyphTracker';

/**
 * Which side of the speech bubble points toward the NPC speaker.
 * Determines which border tile is replaced with a directional arrow.
 */
export type BubbleDirection = 'right' | 'left' | 'above' | 'below';

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
     * @param direction Which side of the bubble has the arrow pointing toward the NPC (default 'right')
     */
    create(glyphFrames: number[], language: string, registry: LanguageGlyphRegistry, scale: number = 1, direction: BubbleDirection = 'right'): void {
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
        this.buildBackground(bubbleFrames, bubbleWidth, bubbleHeight, tileSize, direction);

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
     * Build the speech bubble background using 9-patch tiles.
     *
     * The directional arrow tile is placed on the border facing the NPC:
     *  - 'right':  left edge of the middle row  (NPC is to the left)
     *  - 'left':   right edge of the middle row (NPC is to the right), flipped horizontally
     *  - 'above':  first tile of the bottom row  (NPC is below), rotated 90° CCW → ↓
     *  - 'below':  first tile of the top row     (NPC is above), rotated 90° CW  → ↑
     */
    private buildBackground(
        frames: SpeechBubbleFrames,
        width: number,
        height: number,
        tileSize: number,
        direction: BubbleDirection,
    ): void {
        // Top row
        this.addBackgroundTile(frames.topLeft, 0, 0, tileSize);
        for (let x = 1; x < width - 1; x++) {
            if (direction === 'below' && x === 1) {
                // Arrow pointing up (↑) toward NPC above
                this.addArrowTile(frames.arrow, x, 0, tileSize, false, false, Math.PI / 2);
            } else {
                this.addBackgroundTile(frames.topEdge, x, 0, tileSize);
            }
        }
        this.addBackgroundTile(frames.topRight, width - 1, 0, tileSize);

        // Middle rows (where glyphs go)
        for (let y = 1; y < height - 1; y++) {
            if (y === 1 && direction === 'right') {
                this.addArrowTile(frames.arrow, 0, y, tileSize, false, false, 0);
            } else {
                this.addBackgroundTile(frames.leftEdge, 0, y, tileSize);
            }
            for (let x = 1; x < width - 1; x++) {
                this.addBackgroundTile(frames.centre, x, y, tileSize);
            }
            if (y === 1 && direction === 'left') {
                // Arrow pointing right (→) toward NPC to the right, flipped horizontally
                this.addArrowTile(frames.arrow, width - 1, y, tileSize, true, false, 0);
            } else {
                this.addBackgroundTile(frames.rightEdge, width - 1, y, tileSize);
            }
        }

        // Bottom row
        this.addBackgroundTile(frames.bottomLeft, 0, height - 1, tileSize);
        for (let x = 1; x < width - 1; x++) {
            if (direction === 'above' && x === 1) {
                // Arrow pointing down (↓) toward NPC below
                this.addArrowTile(frames.arrow, x, height - 1, tileSize, false, false, -Math.PI / 2);
            } else {
                this.addBackgroundTile(frames.bottomEdge, x, height - 1, tileSize);
            }
        }
        this.addBackgroundTile(frames.bottomRight, width - 1, height - 1, tileSize);
    }

    /**
     * Add the directional arrow tile at the specified grid position.
     * Uses centre-origin so that rotation and flipping work in-place.
     */
    private addArrowTile(
        frameIndex: number,
        gridX: number,
        gridY: number,
        tileSize: number,
        flipX: boolean,
        flipY: boolean,
        rotation: number,
    ): void {
        const tile = this.scene.add.image(
            (gridX + 0.5) * tileSize,
            (gridY + 0.5) * tileSize,
            this.tilesetKey,
            frameIndex,
        );
        tile.setOrigin(0.5, 0.5);
        tile.setFlipX(flipX);
        tile.setFlipY(flipY);
        tile.setRotation(rotation);
        this.container.add(tile);
        this.backgroundTiles.push(tile);
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
        const matrix = this.container.getWorldTransformMatrix();
        const camera = this.scene.cameras.main;

        // Diagnostics: log camera state once per call
        console.log(
            `[SpeechBubble.getGlyphScreenBounds] scene=${this.scene.sys.settings.key}` +
            ` zoom=${camera.zoom.toFixed(3)}` +
            ` scroll=(${camera.scrollX.toFixed(1)},${camera.scrollY.toFixed(1)})` +
            ` cam.xy=(${camera.x},${camera.y})` +
            ` matrix.a=${matrix.a.toFixed(3)} tx=${matrix.tx.toFixed(1)}`
        );

        // Tile size in screen pixels: base size × world-space scale × camera zoom
        const screenTileSize = this.currentTileSize * matrix.a * camera.zoom;

        return this.glyphSprites.map((sprite, i) => {
            // World position of the sprite's top-left corner
            const worldX = matrix.tx + sprite.x * matrix.a + sprite.y * matrix.c;
            const worldY = matrix.ty + sprite.x * matrix.b + sprite.y * matrix.d;
            // Project world coordinates to viewport (screen) coordinates
            const screenX = (worldX - camera.scrollX) * camera.zoom + camera.x;
            const screenY = (worldY - camera.scrollY) * camera.zoom + camera.y;
            if (i === 0) {
                console.log(`  sprite[0] world=(${worldX.toFixed(1)},${worldY.toFixed(1)}) screen=(${screenX.toFixed(1)},${screenY.toFixed(1)})`);
            }
            return {
                frameIndex: this.glyphFrameIndices[i],
                indexInBubble: i,
                screenX,
                screenY,
                tileSize: screenTileSize,
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

