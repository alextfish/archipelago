import Phaser from 'phaser';
import { CollisionType } from '@model/overworld/CollisionManager';
import { isTestMode } from '@helpers/TestMarkers';

/**
 * Movement constants for player character
 */
const PLAYER_SPEED = 200; // Doubled from 100
const CORNER_NUDGE = 4; // Pixels to nudge in perpendicular direction when hitting a corner
const TARGET_REACHED_THRESHOLD = 5; // Pixels - how close is "close enough" to target
const TILE_SIZE = 32; // Must match the map's tilewidth/tileheight

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
    private collisionLayer?: Phaser.Tilemaps.TilemapLayer;
    private getCollisionAt?: (tileX: number, tileY: number) => CollisionType;

    // Tap-to-move state
    private targetPosition?: { x: number; y: number };
    private lastPlayerPosition?: { x: number; y: number };
    private stuckFrames: number = 0;
    private readonly MAX_STUCK_FRAMES = 10; // If stuck for this many frames, give up

    // Track facing direction for interaction cursor
    private facingDirection: 'up' | 'down' | 'left' | 'right' = 'down';

    // Player layer tracking for multi-layer collision system
    // 'upper' = normal ground level, 'lower' = riverbeds and lower areas
    // 'stairs' = in transition; both upper and lower collision layers are disabled,
    //            allowing free movement onto whichever level the stairs lead to.
    private playerLayer: 'upper' | 'lower' | 'stairs' = 'upper';

    constructor(
        scene: Phaser.Scene,
        player: Phaser.Physics.Arcade.Sprite,
        cursors: Phaser.Types.Input.Keyboard.CursorKeys,
        collisionLayer?: Phaser.Tilemaps.TilemapLayer,
        getCollisionAt?: (tileX: number, tileY: number) => CollisionType
    ) {
        this.scene = scene;
        this.player = player;
        this.cursors = cursors;
        this.collisionLayer = collisionLayer;
        this.getCollisionAt = getCollisionAt;
        this.setupCollisionBody();
        this.createPlayerAnimations();
    }

    /**
     * Set up player collision body to be smaller than sprite for smoother movement
     */
    private setupCollisionBody(): void {
        // Set collision body to half the tile size (16 pixels) for easier corner navigation
        // Assuming tile size is 32x32, collision body will be 16x16
        const bodySize = 16;
        this.player.body!.setSize(bodySize, bodySize);
        // Position collision body at bottom center (near character's feet)
        this.player.body!.setOffset(
            (this.player.width - bodySize) / 2,  // Centered horizontally
            this.player.height - bodySize        // At the bottom
        );
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
     * Update player movement based on cursor input or tap target
     * Should be called from scene's update() method
     */
    update(): void {
        if (!this.enabled) {
            return;
        }

        // Update player layer from current tile position BEFORE physics step,
        // so the collision callbacks (upperGround/lowerGround) see the correct layer.
        this.updatePlayerLayerFromTile();

        // Check if any keyboard input is being used
        const hasKeyboardInput =
            this.cursors.left!.isDown ||
            this.cursors.right!.isDown ||
            this.cursors.up!.isDown ||
            this.cursors.down!.isDown;

        // Keyboard input takes priority and cancels tap movement
        if (hasKeyboardInput) {
            this.clearTargetPosition();
            this.handleKeyboardMovement();
        } else if (this.targetPosition) {
            this.handleTapMovement();
        } else {
            // No input at all
            this.player.setVelocity(0);
        }

        // Handle animations based on final velocity
        this.updateAnimations();
    }

    /**
     * Update the player's ground layer ('upper' or 'lower') from the tile they currently occupy.
     * Must be called before the physics step so collision callbacks see the right layer.
     *
     * Rules (fully symmetrical):
     * - WALKABLE     → 'upper'
     * - WALKABLE_LOW → 'lower'
     * - STAIRS       → 'stairs'  (disables both upper and lower collision layers,
     *                             so the player can freely cross onto either ground type)
     * - BLOCKED / unknown → keep current layer
     *
     * The 'stairs' state is the key to avoiding look-ahead: when the player body is
     * on a STAIRS tile both collider process-callbacks return false (neither
     * `=== 'lower'` nor `=== 'upper'` matches), so the physics step can move onto
     * whichever adjacent tile the stairs connect to.  The following frame the player
     * body is on WALKABLE or WALKABLE_LOW and the layer snaps to the correct value.
     */
    private updatePlayerLayerFromTile(): void {
        if (!this.getCollisionAt) return;

        // Use centre of physics body (feet position) for tile lookup
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        const bodyX = body.x + body.width / 2;
        const bodyY = body.y + body.height / 2;
        const tileX = Math.floor(bodyX / TILE_SIZE);
        const tileY = Math.floor(bodyY / TILE_SIZE);

        const currentType = this.getCollisionAt(tileX, tileY);

        const previousLayer = this.playerLayer;
        if (currentType === CollisionType.WALKABLE) {
            this.playerLayer = 'upper';
        } else if (currentType === CollisionType.WALKABLE_LOW) {
            this.playerLayer = 'lower';
        } else if (currentType === CollisionType.STAIRS) {
            this.playerLayer = 'stairs';
        }
        // BLOCKED or unknown: leave playerLayer unchanged

        if (isTestMode()) {
            if (this.playerLayer !== previousLayer) {
                const typeNames: Record<number, string> = { 0: 'BLOCKED', 1: 'WALKABLE', 2: 'WALKABLE_LOW', 3: 'STAIRS' };
                console.log(`[PlayerLayer] ${previousLayer} -> ${this.playerLayer} (tile ${tileX},${tileY} type=${typeNames[currentType] ?? currentType})`);
            }
            this.updateLayerDebugDisplay(tileX, tileY);
        }
    }

    private updateLayerDebugDisplay(tileX: number, tileY: number): void {
        let el = document.getElementById('debug-player-layer') as HTMLElement | null;
        if (!el) {
            el = document.createElement('div');
            el.id = 'debug-player-layer';
            el.style.cssText = [
                'position:fixed', 'top:10px', 'left:10px',
                'background:rgba(0,0,0,0.7)', 'color:#0f0',
                'padding:6px 10px', 'border-radius:4px',
                'font:bold 13px monospace', 'z-index:10001',
                'pointer-events:none'
            ].join(';');
            document.body.appendChild(el);
        }
        el.textContent = `layer: ${this.playerLayer}  tile:(${tileX},${tileY})`;
    }

    /**
     * Handle keyboard-based movement (existing behavior)
     */
    private handleKeyboardMovement(): void {
        // Reset velocity
        this.player.setVelocity(0);

        // Determine desired movement direction
        let moveX = 0;
        let moveY = 0;

        if (this.cursors.left!.isDown) {
            moveX = -PLAYER_SPEED;
        } else if (this.cursors.right!.isDown) {
            moveX = PLAYER_SPEED;
        }

        if (this.cursors.up!.isDown) {
            moveY = -PLAYER_SPEED;
        } else if (this.cursors.down!.isDown) {
            moveY = PLAYER_SPEED;
        }

        // Apply movement with corner forgiveness
        this.applyMovementWithCornerForgiveness(moveX, moveY);
    }

    /**
     * Handle tap-to-move movement
     * Moves player towards target position, stopping when close or blocked
     */
    private handleTapMovement(): void {
        if (!this.targetPosition) {
            return;
        }

        const playerX = this.player.x;
        const playerY = this.player.y;
        const targetX = this.targetPosition.x;
        const targetY = this.targetPosition.y;

        // Calculate distance to target
        const distance = Phaser.Math.Distance.Between(playerX, playerY, targetX, targetY);

        // Check if we've reached the target
        if (distance < TARGET_REACHED_THRESHOLD) {
            this.player.setVelocity(0);
            this.clearTargetPosition();
            return;
        }

        // Calculate direction vector (normalized)
        const dirX = (targetX - playerX) / distance;
        const dirY = (targetY - playerY) / distance;

        // Set velocity towards target
        // Use integer velocities to avoid subpixel issues
        this.player.setVelocity(Math.round(dirX * PLAYER_SPEED), Math.round(dirY * PLAYER_SPEED));

        // Check if player is stuck (not moving despite velocity)
        this.checkIfStuck(playerX, playerY);
    }

    /**
     * Check if player has gotten stuck and can't reach target
     * This happens when running into walls or obstacles
     */
    private checkIfStuck(currentX: number, currentY: number): void {
        if (!this.lastPlayerPosition) {
            this.lastPlayerPosition = { x: currentX, y: currentY };
            return;
        }

        // Check if player has moved since last frame
        const movedDistance = Phaser.Math.Distance.Between(
            currentX, currentY,
            this.lastPlayerPosition.x, this.lastPlayerPosition.y
        );

        if (movedDistance < 0.5) {
            // Player hasn't moved much - increment stuck counter
            this.stuckFrames++;
            if (this.stuckFrames >= this.MAX_STUCK_FRAMES) {
                // Give up - player is blocked
                console.log('PlayerController: Player stuck, clearing target');
                this.player.setVelocity(0);
                this.clearTargetPosition();
            }
        } else {
            // Player is moving - reset stuck counter
            this.stuckFrames = 0;
        }

        this.lastPlayerPosition = { x: currentX, y: currentY };
    }

    /**
     * Set a target position for the player to move towards
     * Called when player taps/clicks a location
     */
    setTargetPosition(worldX: number, worldY: number): void {
        console.log(`[DIAGNOSTIC] PlayerController.setTargetPosition called: (${worldX.toFixed(0)}, ${worldY.toFixed(0)}), enabled: ${this.enabled}`);
        this.targetPosition = { x: worldX, y: worldY };
        this.stuckFrames = 0;
        this.lastPlayerPosition = undefined;
        console.log(`PlayerController: Moving to target (${worldX.toFixed(0)}, ${worldY.toFixed(0)})`);
    }

    /**
     * Clear the current target position
     */
    clearTargetPosition(): void {
        if (this.targetPosition) {
            this.targetPosition = undefined;
            this.lastPlayerPosition = undefined;
            this.stuckFrames = 0;
        }
    }

    /**
     * Check if player is currently moving towards a tap target
     */
    hasTarget(): boolean {
        return this.targetPosition !== undefined;
    }

    /**
     * Apply movement with corner forgiveness for smoother navigation
     * If movement in the primary direction is blocked, try nudging perpendicular
     */
    private applyMovementWithCornerForgiveness(moveX: number, moveY: number): void {
        // If no movement intended, nothing to do
        if (moveX === 0 && moveY === 0) {
            return;
        }

        // Try primary movement direction first
        this.player.setVelocity(moveX, moveY);

        // This felt quite bad - disabled.
        return;


        // We'll use Phaser's collision system, but add corner forgiveness
        // by trying perpendicular nudges if primary direction fails

        // For horizontal-primary movement (moving more horizontally than vertically)
        if (Math.abs(moveX) >= Math.abs(moveY) && moveX !== 0) {

            // Try primary direction
            this.player.setVelocity(moveX, moveY);

            // If we're moving purely horizontally and might be stuck, try vertical nudges
            if (moveY === 0) {
                // We'll rely on the collision system, but we can help by trying slight vertical adjustments
                // This is handled by allowing diagonal movement when one axis is blocked

                // Try nudging up
                const testUpY = -CORNER_NUDGE;
                if (this.canMoveToOffset(moveX / PLAYER_SPEED, testUpY / PLAYER_SPEED)) {
                    this.player.setVelocity(moveX, testUpY);
                    return;
                }

                // Try nudging down
                const testDownY = CORNER_NUDGE;
                if (this.canMoveToOffset(moveX / PLAYER_SPEED, testDownY / PLAYER_SPEED)) {
                    this.player.setVelocity(moveX, testDownY);
                    return;
                }
            }
        }
        // For vertical-primary movement
        else if (Math.abs(moveY) > Math.abs(moveX) && moveY !== 0) {
            this.player.setVelocity(moveX, moveY);

            // If we're moving purely vertically and might be stuck, try horizontal nudges
            if (moveX === 0) {
                // Try nudging left
                const testLeftX = -CORNER_NUDGE;
                if (this.canMoveToOffset(testLeftX / PLAYER_SPEED, moveY / PLAYER_SPEED)) {
                    this.player.setVelocity(testLeftX, moveY);
                    return;
                }

                // Try nudging right
                const testRightX = CORNER_NUDGE;
                if (this.canMoveToOffset(testRightX / PLAYER_SPEED, moveY / PLAYER_SPEED)) {
                    this.player.setVelocity(testRightX, moveY);
                    return;
                }
            }
        }
    }

    /**
     * Check if player can move to a position offset from current position
     * This checks the collision layer to see if the target position would be blocked
     */
    private canMoveToOffset(dx: number, dy: number): boolean {
        if (!this.collisionLayer) {
            // No collision layer, allow movement
            return true;
        }

        // Calculate the target position in world coordinates
        const targetX = this.player.x + dx;
        const targetY = this.player.y + dy;

        // Convert to tile coordinates
        const tileX = this.collisionLayer.worldToTileX(targetX);
        const tileY = this.collisionLayer.worldToTileY(targetY);

        if (tileX === null || tileY === null) {
            return false;
        }

        // Check if the tile at the target position has collision
        const tile = this.collisionLayer.getTileAt(tileX, tileY);

        // If there's no tile or the tile doesn't collide, movement is allowed
        return !tile || !tile.collides;
    }

    /**
     * Update animations based on current velocity
     */
    private updateAnimations(): void {
        const velX = this.player.body!.velocity.x;
        const velY = this.player.body!.velocity.y;

        // Horizontal movement animations
        if (velX < 0) {
            this.player.setFlipX(true);
            this.player.anims.play('walk-right', true);
            this.facingDirection = 'left';
        } else if (velX > 0) {
            this.player.setFlipX(false);
            this.player.anims.play('walk-right', true);
            this.facingDirection = 'right';
        }

        // Vertical movement animations (only if not moving horizontally)
        if (velY < 0 && velX === 0) {
            this.player.anims.play('walk-up', true);
            this.facingDirection = 'up';
        } else if (velY > 0 && velX === 0) {
            this.player.anims.play('walk-down', true);
            this.facingDirection = 'down';
        }

        // Play idle animation if not moving
        if (velX === 0 && velY === 0) {
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
        console.log('[DIAGNOSTIC] PlayerController.setEnabled:', enabled);
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

    /**
     * Get the direction the player is facing
     */
    getFacingDirection(): 'up' | 'down' | 'left' | 'right' {
        return this.facingDirection;
    }

    /**
     * Get the player's current layer
     */
    getPlayerLayer(): 'upper' | 'lower' | 'stairs' {
        return this.playerLayer;
    }

    /**
     * Set the player's layer (used when transitioning via stairs)
     */
    setPlayerLayer(layer: 'upper' | 'lower' | 'stairs'): void {
        if (this.playerLayer !== layer) {
            console.log(`Player layer changed: ${this.playerLayer} -> ${layer}`);
            this.playerLayer = layer;
        }
    }

    /**
     * Validate if player can move to a tile based on collision type and current layer
     * 
     * @param targetType - The collision type of the target tile
     * @param currentType - The collision type of the current tile (optional, for context)
     * @returns Object with 'allowed' boolean and optional 'newLayer' if layer transition occurs
     */
    canMoveToTile(
        targetType: CollisionType,
        currentType?: CollisionType
    ): { allowed: boolean; newLayer?: 'upper' | 'lower' } {
        // BLOCKED tiles are never walkable
        if (targetType === CollisionType.BLOCKED) {
            return { allowed: false };
        }

        // STAIRS are always accessible from any layer, no layer change
        if (targetType === CollisionType.STAIRS) {
            return { allowed: true };
        }

        // Exiting stairs sets layer based on target type
        if (currentType === CollisionType.STAIRS) {
            if (targetType === CollisionType.WALKABLE) {
                return { allowed: true, newLayer: 'upper' };
            }
            if (targetType === CollisionType.WALKABLE_LOW) {
                return { allowed: true, newLayer: 'lower' };
            }
        }

        // Normal tiles must match current layer
        if (targetType === CollisionType.WALKABLE) {
            return { allowed: this.playerLayer === 'upper' };
        }

        if (targetType === CollisionType.WALKABLE_LOW) {
            return { allowed: this.playerLayer === 'lower' };
        }

        // Unknown collision type - block movement
        return { allowed: false };
    }
}
