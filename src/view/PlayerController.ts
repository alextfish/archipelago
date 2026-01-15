import Phaser from 'phaser';

/**
 * PlayerController manages the player character in the overworld.
 * Handles player movement, animations, and collision setup.
 * 
 * This class is separated from OverworldScene to follow the single responsibility principle
 * and improve testability of player-specific logic.
 */
export class PlayerController {
    private player: Phaser.Physics.Arcade.Sprite;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    private scene: Phaser.Scene;
    private enabled: boolean = true;

    constructor(
        scene: Phaser.Scene,
        player: Phaser.Physics.Arcade.Sprite,
        cursors: Phaser.Types.Input.Keyboard.CursorKeys
    ) {
        this.scene = scene;
        this.player = player;
        this.cursors = cursors;
        this.createPlayerAnimations();
    }

    /**
     * Create animations for player character
     */
    private createPlayerAnimations(): void {
        // Walking down animations (frames 1-3, but Phaser is 0-indexed so 0-2)
        this.scene.anims.create({
            key: 'walk-down',
            frames: this.scene.anims.generateFrameNumbers('builder', { start: 0, end: 2 }),
            frameRate: 8,
            repeat: -1
        });

        // Walking right animations (frames 4-6, so 3-5 in 0-indexed)
        this.scene.anims.create({
            key: 'walk-right',
            frames: this.scene.anims.generateFrameNumbers('builder', { start: 3, end: 5 }),
            frameRate: 8,
            repeat: -1
        });

        // Walking up animations (frames 7-9, so 6-8 in 0-indexed)  
        this.scene.anims.create({
            key: 'walk-up',
            frames: this.scene.anims.generateFrameNumbers('builder', { start: 6, end: 8 }),
            frameRate: 8,
            repeat: -1
        });

        // Idle frames (first frame of each direction)
        this.scene.anims.create({
            key: 'idle-down',
            frames: [{ key: 'builder', frame: 0 }],
            frameRate: 1
        });

        this.scene.anims.create({
            key: 'idle-right',
            frames: [{ key: 'builder', frame: 3 }],
            frameRate: 1
        });

        this.scene.anims.create({
            key: 'idle-up',
            frames: [{ key: 'builder', frame: 6 }],
            frameRate: 1
        });
    }

    /**
     * Update player movement based on cursor input
     * Should be called from scene's update() method
     */
    update(): void {
        if (!this.enabled) {
            return;
        }

        const speed = 100;

        // Reset velocity
        this.player.setVelocity(0);

        // Horizontal movement
        if (this.cursors.left!.isDown) {
            this.player.setVelocityX(-speed);
            this.player.setFlipX(true);
            this.player.anims.play('walk-right', true);
        } else if (this.cursors.right!.isDown) {
            this.player.setVelocityX(speed);
            this.player.setFlipX(false);
            this.player.anims.play('walk-right', true);
        }

        // Vertical movement
        if (this.cursors.up!.isDown) {
            this.player.setVelocityY(-speed);
            if (this.player.body!.velocity.x === 0) {
                this.player.anims.play('walk-up', true);
            }
        } else if (this.cursors.down!.isDown) {
            this.player.setVelocityY(speed);
            if (this.player.body!.velocity.x === 0) {
                this.player.anims.play('walk-down', true);
            }
        }

        // Play idle animation if not moving
        if (this.player.body!.velocity.x === 0 && this.player.body!.velocity.y === 0) {
            // Determine which idle animation based on last direction
            if (this.player.anims.currentAnim) {
                const currentAnim = this.player.anims.currentAnim.key;
                if (currentAnim.includes('up')) {
                    this.player.anims.play('idle-up', true);
                } else if (currentAnim.includes('right')) {
                    this.player.anims.play('idle-right', true);
                } else {
                    this.player.anims.play('idle-down', true);
                }
            } else {
                this.player.anims.play('idle-down', true);
            }
        }
    }

    /**
     * Enable or disable player movement
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            // Stop movement when disabled
            this.player.setVelocity(0);
        }
    }

    /**
     * Check if player movement is currently enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Get the player sprite (for camera following, collision setup, etc.)
     */
    getSprite(): Phaser.Physics.Arcade.Sprite {
        return this.player;
    }

    /**
     * Get the player's current position
     */
    getPosition(): { x: number; y: number } {
        return { x: this.player.x, y: this.player.y };
    }

    /**
     * Set the player's position
     */
    setPosition(x: number, y: number): void {
        this.player.setPosition(x, y);
    }
}
