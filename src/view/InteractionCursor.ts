import Phaser from 'phaser';

/**
 * Type of interactable object
 */
export type InteractableType = 'puzzle' | 'npc' | 'lever';

/**
 * Represents an interactable object in the world
 */
export interface Interactable {
    type: InteractableType;
    tileX: number;
    tileY: number;
    data?: any; // Additional data specific to the interactable type
}

/**
 * InteractionCursor manages the pulsing cursor that appears over interactable objects
 * when the player is within range.
 */
export class InteractionCursor {
    private scene: Phaser.Scene;
    private cursorSprites: Phaser.GameObjects.Sprite[] = [];
    private currentTarget?: Interactable;
    private tileWidth: number;
    private tileHeight: number;
    private lastFacing: 'up' | 'down' | 'left' | 'right' = 'down';

    constructor(scene: Phaser.Scene, tileWidth: number = 32, tileHeight: number = 32) {
        this.scene = scene;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.createCursorSprites();
    }

    /**
     * Create the cursor sprites and animation
     */
    private createCursorSprites(): void {
        // Load cursor sprites if not already loaded
        if (!this.scene.textures.exists('cursor-out')) {
            this.scene.load.image('cursor-out', 'resources/square_cursor_out.png');
            this.scene.load.image('cursor-in', 'resources/square_cursor_in.png');
            this.scene.load.once('complete', () => {
                this.setupCursorAnimation();
            });
            this.scene.load.start();
        } else {
            this.setupCursorAnimation();
        }
    }

    /**
     * Set up the cursor sprites and animation
     */
    private setupCursorAnimation(): void {
        // Create two sprites for the two frames
        const sprite1 = this.scene.add.sprite(0, 0, 'cursor-out');
        const sprite2 = this.scene.add.sprite(0, 0, 'cursor-in');

        sprite1.setVisible(false);
        sprite2.setVisible(false);
        sprite1.setDepth(1000); // High depth to appear above everything
        sprite2.setDepth(1000);

        this.cursorSprites = [sprite1, sprite2];

        // Create pulsing animation by toggling between sprites
        let currentFrame = 0;
        this.scene.time.addEvent({
            delay: 400, // Pulse every 400ms
            callback: () => {
                if (this.currentTarget) {
                    this.cursorSprites[currentFrame].setVisible(false);
                    currentFrame = (currentFrame + 1) % 2;
                    this.cursorSprites[currentFrame].setVisible(true);
                }
            },
            loop: true
        });
    }

    /**
     * Update player's facing direction
     * Used to prioritise targets in the direction the player is facing
     */
    setFacing(direction: 'up' | 'down' | 'left' | 'right'): void {
        this.lastFacing = direction;
    }

    /**
     * Get the player's current facing direction
     */
    getFacing(): 'up' | 'down' | 'left' | 'right' {
        return this.lastFacing;
    }

    /**
     * Update the cursor based on player position and available interactables
     */
    update(playerTileX: number, playerTileY: number, interactables: Interactable[]): void {
        // Find all interactables within range (1 tile)
        const inRange = interactables.filter(interactable => {
            const dx = Math.abs(interactable.tileX - playerTileX);
            const dy = Math.abs(interactable.tileY - playerTileY);
            return dx <= 1 && dy <= 1;
        });

        if (inRange.length === 0) {
            // No interactables in range - hide cursor
            this.hide();
            return;
        }

        // If multiple in range, choose the one closest in the facing direction
        const target = this.selectBestTarget(playerTileX, playerTileY, inRange);

        if (target !== this.currentTarget) {
            this.setTarget(target);
        }
    }

    /**
     * Select the best target from multiple interactables
     * Prioritises the one in the direction the player is facing
     */
    private selectBestTarget(
        playerTileX: number,
        playerTileY: number,
        candidates: Interactable[]
    ): Interactable {
        if (candidates.length === 1) {
            return candidates[0];
        }

        // Score each candidate based on facing direction
        const scored = candidates.map(candidate => {
            const dx = candidate.tileX - playerTileX;
            const dy = candidate.tileY - playerTileY;
            let score = 0;

            // Higher score if in facing direction
            switch (this.lastFacing) {
                case 'up':
                    if (dy < 0) score += 10;
                    break;
                case 'down':
                    if (dy > 0) score += 10;
                    break;
                case 'left':
                    if (dx < 0) score += 10;
                    break;
                case 'right':
                    if (dx > 0) score += 10;
                    break;
            }

            // Lower score for distance (closer is better)
            const distance = Math.abs(dx) + Math.abs(dy);
            score -= distance;

            return { candidate, score };
        });

        // Sort by score (highest first) and return best
        scored.sort((a, b) => b.score - a.score);
        return scored[0].candidate;
    }

    /**
     * Set the current target and show cursor
     */
    private setTarget(target: Interactable): void {
        this.currentTarget = target;

        // Position cursor at target tile (centered)
        const worldX = target.tileX * this.tileWidth + this.tileWidth / 2;
        const worldY = target.tileY * this.tileHeight + this.tileHeight / 2;

        for (const sprite of this.cursorSprites) {
            sprite.setPosition(worldX, worldY);
        }

        // Show first frame
        this.cursorSprites[0].setVisible(true);
        this.cursorSprites[1].setVisible(false);
    }

    /**
     * Hide the cursor
     */
    hide(): void {
        this.currentTarget = undefined;
        for (const sprite of this.cursorSprites) {
            sprite.setVisible(false);
        }
    }

    /**
     * Get the current target, if any
     */
    getCurrentTarget(): Interactable | undefined {
        return this.currentTarget;
    }

    /**
     * Check if a specific tile is the current target
     */
    isTargeting(tileX: number, tileY: number): boolean {
        return this.currentTarget !== undefined &&
            this.currentTarget.tileX === tileX &&
            this.currentTarget.tileY === tileY;
    }

    /**
     * Destroy the cursor and clean up
     */
    destroy(): void {
        for (const sprite of this.cursorSprites) {
            sprite.destroy();
        }
        this.cursorSprites = [];
        this.currentTarget = undefined;
    }
}
