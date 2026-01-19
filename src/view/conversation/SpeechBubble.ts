/**
 * Renders a speech bubble with language glyphs.
 * Creates a 9-patch style bubble using corner, edge, and center tiles.
 */

import Phaser from 'phaser';
import type { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';

export class SpeechBubble {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private backgroundTiles: Phaser.GameObjects.Image[] = [];
    private glyphSprites: Phaser.GameObjects.Image[] = [];
    private tilesetKey: string;

    constructor(scene: Phaser.Scene, tilesetKey: string) {
        this.scene = scene;
        this.tilesetKey = tilesetKey;
        this.container = scene.add.container(0, 0);
    }

    /**
     * Create speech bubble with glyphs
     * @param glyphFrames Array of frame indices for glyphs
     * @param language Language ID (for getting speech bubble frames)
     * @param registry Glyph registry
     * @param scale Scale factor for the bubble (default 1)
     */
    create(glyphFrames: number[], language: string, registry: LanguageGlyphRegistry, scale: number = 1): void {
        // Clear existing content
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
     * Clear all content
     */
    clear(): void {
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
    }

    /**
     * Destroy the speech bubble
     */
    destroy(): void {
        this.clear();
        this.container.destroy();
    }
}
