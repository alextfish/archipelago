import Phaser from 'phaser';
import { CollisionType } from '@model/overworld/CollisionManager';
import { isTestMode } from '@helpers/TestMarkers';

/**
 * Movement constants for player character
 */
const PLAYER_SPEED = 200;
const TARGET_REACHED_THRESHOLD = 5; // Pixels - how close is "close enough" to target
const TILE_SIZE = 32; // Must match the map's tilewidth/tileheight
/**
 * Half-width of the walkable central band inside a narrow-passage tile.
 * The player's constrained axis is clamped within (tileCentre ± NARROW_HALF_WIDTH).
 * At TILE_SIZE=32 this gives a 12-pixel walkable band centred on the tile.
 */
const NARROW_HALF_WIDTH = 6;

/** Returns the world-space centre of the tile at the given tile coordinate. */
function tileCentre(tileCoord: number): number {
    return (tileCoord + 0.5) * TILE_SIZE;
}

/**
 * PlayerController manages the player character in the overworld.
 * Handles player movement, animations, and collision setup.
 *
 * Movement is implemented as "attempted move + validation": each frame the
 * desired displacement is validated against collisionArray before being applied,
 * with no Phaser ArcadePhysics body or colliders.
 *
 * This class is separated from OverworldScene to follow the single responsibility
 * principle and improve testability of player-specific logic.
 */
export class PlayerController {
    private player: Phaser.GameObjects.Sprite;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    private scene: Phaser.Scene;
    private enabled: boolean = true;
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
    // 'stairs' = in transition, passable from/to any non-blocked tile
    private playerLayer: 'upper' | 'lower' | 'stairs' = 'upper';

    // Current-frame movement deltas — used by updateAnimations() instead of body.velocity
    private moveX: number = 0;
    private moveY: number = 0;

    constructor(
        scene: Phaser.Scene,
        player: Phaser.GameObjects.Sprite,
        cursors: Phaser.Types.Input.Keyboard.CursorKeys,
        getCollisionAt?: (tileX: number, tileY: number) => CollisionType
    ) {
        this.scene = scene;
        this.player = player;
        this.cursors = cursors;
        this.getCollisionAt = getCollisionAt;
        this.createPlayerAnimations();
    }

    /**
     * Create animations for player character
     */
    private createPlayerAnimations(): void {
        // Walking up animations (frames 0-2)
        this.scene.anims.create({
            key: 'walk-up',
            frames: this.scene.anims.generateFrameNumbers('player', { start: 0, end: 2 }),
            frameRate: 8,
            repeat: -1
        });

        // Walking right animations (frames 3-5)
        this.scene.anims.create({
            key: 'walk-right',
            frames: this.scene.anims.generateFrameNumbers('player', { start: 3, end: 5 }),
            frameRate: 8,
            repeat: -1
        });

        // Walking down animations (frames 6-8)
        this.scene.anims.create({
            key: 'walk-down',
            frames: this.scene.anims.generateFrameNumbers('player', { start: 6, end: 8 }),
            frameRate: 8,
            repeat: -1
        });

        // Walking left animations (frames 9-11)
        this.scene.anims.create({
            key: 'walk-left',
            frames: this.scene.anims.generateFrameNumbers('player', { start: 9, end: 11 }),
            frameRate: 8,
            repeat: -1
        });

        // Idle frames (first frame of each direction)
        this.scene.anims.create({
            key: 'idle-up',
            frames: [{ key: 'player', frame: 0 }],
            frameRate: 1
        });

        this.scene.anims.create({
            key: 'idle-right',
            frames: [{ key: 'player', frame: 3 }],
            frameRate: 1
        });

        this.scene.anims.create({
            key: 'idle-down',
            frames: [{ key: 'player', frame: 6 }],
            frameRate: 1
        });

        this.scene.anims.create({
            key: 'idle-left',
            frames: [{ key: 'player', frame: 9 }],
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

        // Reset current-frame movement deltas; updated by tryMove on success.
        this.moveX = 0;
        this.moveY = 0;

        // Sync player layer from tile before deciding movement.
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
        }

        // Handle animations based on current-frame movement
        this.updateAnimations();
    }

    /**
     * Update the player's ground layer ('upper' or 'lower') from the tile they currently occupy.
     *
     * Rules (fully symmetrical):
     * - WALKABLE     → 'upper'
     * - WALKABLE_LOW → 'lower'
     * - STAIRS       → 'stairs'
     * - ALWAYS_HIGH  → 'upper'
     * - BLOCKED / unknown → keep current layer
     */
    private updatePlayerLayerFromTile(): void {
        if (!this.getCollisionAt) return;

        const tileX = Math.floor(this.player.x / TILE_SIZE);
        const tileY = Math.floor(this.player.y / TILE_SIZE);

        const currentType = this.getCollisionAt(tileX, tileY);

        const previousLayer = this.playerLayer;
        if (currentType === CollisionType.WALKABLE) {
            this.playerLayer = 'upper';
        } else if (currentType === CollisionType.WALKABLE_LOW) {
            this.playerLayer = 'lower';
        } else if (currentType === CollisionType.STAIRS) {
            this.playerLayer = 'stairs';
        } else if (currentType === CollisionType.ALWAYS_HIGH) {
            this.playerLayer = 'upper';
        } else if (currentType === CollisionType.NARROW_NS || currentType === CollisionType.NARROW_EW) {
            this.playerLayer = 'upper';
        }
        // BLOCKED or unknown: leave playerLayer unchanged

        if (isTestMode()) {
            if (this.playerLayer !== previousLayer) {
                const typeNames: Record<number, string> = { 0: 'BLOCKED', 1: 'WALKABLE', 2: 'WALKABLE_LOW', 3: 'STAIRS', 4: 'ALWAYS_HIGH', 5: 'NARROW_NS', 6: 'NARROW_EW' };
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
     * Handle keyboard-based movement
     */
    private handleKeyboardMovement(): void {
        let dirX = 0;
        let dirY = 0;

        if (this.cursors.left!.isDown) {
            dirX = -1;
        } else if (this.cursors.right!.isDown) {
            dirX = 1;
        }

        if (this.cursors.up!.isDown) {
            dirY = -1;
        } else if (this.cursors.down!.isDown) {
            dirY = 1;
        }

        if (dirX === 0 && dirY === 0) return;

        // Normalise diagonal movement so speed is consistent in all directions
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        const delta = this.scene.game.loop.delta / 1000;
        const dx = (dirX / len) * PLAYER_SPEED * delta;
        const dy = (dirY / len) * PLAYER_SPEED * delta;

        this.tryMove(dx, dy);
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
            this.clearTargetPosition();
            return;
        }

        // Calculate normalised direction vector and per-frame displacement
        const dirX = (targetX - playerX) / distance;
        const dirY = (targetY - playerY) / distance;
        const delta = this.scene.game.loop.delta / 1000;

        this.tryMove(dirX * PLAYER_SPEED * delta, dirY * PLAYER_SPEED * delta);

        // Check if player is stuck (not moving despite having a target)
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
     * Attempt to move the player by (dx, dy).  If the diagonal move is blocked,
     * falls back to moving along each axis independently so the player slides
     * along walls rather than stopping dead.
     */
    private tryMove(dx: number, dy: number): void {
        // Try the full diagonal first
        if (this.attemptMove(dx, dy)) return;

        // Diagonal blocked — try each axis alone so the player slides along walls
        if (dx !== 0 && dy !== 0) {
            if (this.attemptMove(dx, 0)) return;
            this.attemptMove(0, dy);
        }
    }

    /**
     * Try to move the player by (dx, dy).
     * Returns true and applies the move if the target tile is passable;
     * returns false and leaves the player position unchanged otherwise.
     *
     * Narrow-passage tiles (NARROW_NS / NARROW_EW) have directional constraints:
     * - NARROW_NS: entry and exit are only permitted from north or south (no east/west crossing).
     *   While the player occupies the tile their x is clamped to the central band.
     * - NARROW_EW: entry and exit are only permitted from east or west (no north/south crossing).
     *   While the player occupies the tile their y is clamped to the central band.
     * On crossing into a narrow passage the player is snapped to the tile's centre on the
     * constrained axis, so they walk onto the bridge rather than off its edge.
     */
    private attemptMove(dx: number, dy: number): boolean {
        if (dx === 0 && dy === 0) return false;

        const originalX = this.player.x;
        const originalY = this.player.y;
        const nextX = originalX + dx;
        const nextY = originalY + dy;

        const currentTileX = Math.floor(originalX / TILE_SIZE);
        const currentTileY = Math.floor(originalY / TILE_SIZE);
        const nextTileX = Math.floor(nextX / TILE_SIZE);
        const nextTileY = Math.floor(nextY / TILE_SIZE);

        const crossesX = nextTileX !== currentTileX;
        const crossesY = nextTileY !== currentTileY;

        // Sub-tile movement within the same tile.
        if (!crossesX && !crossesY) {
            let finalX = nextX;
            let finalY = nextY;

            if (this.getCollisionAt) {
                const currentType = this.getCollisionAt(currentTileX, currentTileY);
                if (currentType === CollisionType.NARROW_NS) {
                    // Clamp x to the central band; allow y freely.
                    const centreX = tileCentre(currentTileX);
                    finalX = Math.max(centreX - NARROW_HALF_WIDTH, Math.min(centreX + NARROW_HALF_WIDTH, nextX));
                } else if (currentType === CollisionType.NARROW_EW) {
                    // Clamp y to the central band; allow x freely.
                    const centreY = tileCentre(currentTileY);
                    finalY = Math.max(centreY - NARROW_HALF_WIDTH, Math.min(centreY + NARROW_HALF_WIDTH, nextY));
                }
            }

            this.player.x = finalX;
            this.player.y = finalY;
            this.moveX = finalX - originalX;
            this.moveY = finalY - originalY;
            return true;
        }

        if (!this.getCollisionAt) {
            // No collision data — allow movement freely
            this.player.x = nextX;
            this.player.y = nextY;
            this.moveX = dx;
            this.moveY = dy;
            return true;
        }

        const currentType = this.getCollisionAt(currentTileX, currentTileY);
        const targetType = this.getCollisionAt(nextTileX, nextTileY);

        // For diagonal moves, also validate the two orthogonal intermediate tiles.
        // If either intermediate is impassable, return false so tryMove's axis-separation
        // can slide the player along the open axis instead (e.g. up+left → just left when
        // there's a wall above). This also prevents squeezing through an infinitely thin
        // corner gap where both intermediates are blocked.
        if (crossesX && crossesY) {
            const hType = this.getCollisionAt(nextTileX, currentTileY); // horizontal step
            const vType = this.getCollisionAt(currentTileX, nextTileY); // vertical step
            if (!this.canEnter(currentType, hType) || this.isNarrowEntryBlocked(currentType, hType, true, false)) {
                return false;
            }
            if (!this.canEnter(currentType, vType) || this.isNarrowEntryBlocked(currentType, vType, false, true)) {
                return false;
            }
        }

        if (!this.canEnter(currentType, targetType)) return false;
        if (this.isNarrowEntryBlocked(currentType, targetType, crossesX, crossesY)) return false;

        // Move is valid — apply it.
        this.player.x = nextX;
        this.player.y = nextY;
        this.moveX = dx;
        this.moveY = dy;

        // Snap the constrained axis to the tile centre when entering a narrow passage,
        // nudging the player onto the bridge rather than leaving them near the edge.
        if (targetType === CollisionType.NARROW_NS) {
            this.player.x = tileCentre(nextTileX);
            this.moveX = this.player.x - originalX;
        } else if (targetType === CollisionType.NARROW_EW) {
            this.player.y = tileCentre(nextTileY);
            this.moveY = this.player.y - originalY;
        }

        // Keep playerLayer in sync immediately (also synced at the top of each update())
        if (targetType === CollisionType.WALKABLE ||
            targetType === CollisionType.NARROW_NS ||
            targetType === CollisionType.NARROW_EW) {
            this.playerLayer = 'upper';
        } else if (targetType === CollisionType.WALKABLE_LOW) {
            this.playerLayer = 'lower';
        } else if (targetType === CollisionType.STAIRS) {
            this.playerLayer = 'stairs';
        } else if (targetType === CollisionType.ALWAYS_HIGH) {
            this.playerLayer = 'upper';
        }
        return true;
    }

    /**
     * Return true when a tile crossing is forbidden by a narrow-passage constraint,
     * regardless of layer compatibility.
     *
     * - NARROW_NS tiles may only be entered or exited via a north/south crossing
     *   (i.e. the move must not cross a tile boundary in x).
     * - NARROW_EW tiles may only be entered or exited via an east/west crossing
     *   (i.e. the move must not cross a tile boundary in y).
     */
    private isNarrowEntryBlocked(
        from: CollisionType, to: CollisionType,
        crossesX: boolean, crossesY: boolean
    ): boolean {
        if (to === CollisionType.NARROW_NS && crossesX) return true;
        if (from === CollisionType.NARROW_NS && crossesX) return true;
        if (to === CollisionType.NARROW_EW && crossesY) return true;
        if (from === CollisionType.NARROW_EW && crossesY) return true;
        return false;
    }

    /**
     * Determine whether the player can step from a tile of type `from` onto a
     * tile of type `to`, using the simple rules:
     *   - BLOCKED is never enterable
     *   - STAIRS can be entered from any layer (transition tile)
     *   - When leaving STAIRS, any non-blocked tile is allowed
     *   - Otherwise the player must stay on matching ground level
     *   - NARROW_NS and NARROW_EW are treated as upper-ground (same layer as WALKABLE)
     */
    private canEnter(from: CollisionType, to: CollisionType): boolean {
        if (to === CollisionType.BLOCKED) return false;
        if (to === CollisionType.STAIRS) return true;
        if (from === CollisionType.STAIRS) return true;
        // ALWAYS_HIGH and narrow passages are upper-ground; normalise to WALKABLE for layer matching.
        const normFrom = (from === CollisionType.ALWAYS_HIGH ||
            from === CollisionType.NARROW_NS || from === CollisionType.NARROW_EW)
            ? CollisionType.WALKABLE : from;
        const normTo = (to === CollisionType.ALWAYS_HIGH ||
            to === CollisionType.NARROW_NS || to === CollisionType.NARROW_EW)
            ? CollisionType.WALKABLE : to;
        return normFrom === normTo;
    }

    /**
     * Update animations based on current-frame movement deltas
     */
    private updateAnimations(): void {
        const velX = this.moveX;
        const velY = this.moveY;

        // Horizontal movement animations
        if (velX < 0) {
            this.player.anims.play('walk-left', true);
            this.facingDirection = 'left';
        } else if (velX > 0) {
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
                } else if (currentAnim.includes('left')) {
                    this.player.anims.play('idle-left', true);
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
     * Clear the tap-to-move target and snap the player to their idle animation.
     * Call this when an external system (e.g. conversation) takes over from movement.
     */
    stopAndIdle(): void {
        this.clearTargetPosition();
        this.moveX = 0;
        this.moveY = 0;
        if (this.player.anims.currentAnim) {
            const currentAnim = this.player.anims.currentAnim.key;
            if (currentAnim.includes('up')) {
                this.player.anims.play('idle-up', true);
            } else if (currentAnim.includes('left')) {
                this.player.anims.play('idle-left', true);
            } else if (currentAnim.includes('right')) {
                this.player.anims.play('idle-right', true);
            } else {
                this.player.anims.play('idle-down', true);
            }
        } else {
            this.player.anims.play('idle-down', true);
        }
    }

    /**
     * Enable or disable player movement
     */
    setEnabled(enabled: boolean): void {
        console.log('[DIAGNOSTIC] PlayerController.setEnabled:', enabled);
        this.enabled = enabled;
        if (!enabled) {
            this.moveX = 0;
            this.moveY = 0;
        }
    }

    /**
     * Check if player movement is currently enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Get the player sprite (for camera following, position queries, etc.)
     */
    getSprite(): Phaser.GameObjects.Sprite {
        return this.player;
    }

    /**
     * Get the player's current position. With origin (0.5, 0.75), player.y is
     * the feet/ground position — no additional offset is needed for tile lookups.
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
     * Set the player's layer
     */
    setPlayerLayer(layer: 'upper' | 'lower' | 'stairs'): void {
        if (this.playerLayer !== layer) {
            console.log(`Player layer changed: ${this.playerLayer} -> ${layer}`);
            this.playerLayer = layer;
        }
    }
}
