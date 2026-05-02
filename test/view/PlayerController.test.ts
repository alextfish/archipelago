import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Phaser from 'phaser';
import { PlayerController } from '@view/PlayerController';
import { CollisionType } from '@model/overworld/CollisionTypes';

// Mock Phaser types for testing
type MockSprite = {
    x: number;
    y: number;
    width: number;
    height: number;
    setPosition: ReturnType<typeof vi.fn>;
    anims: {
        play: ReturnType<typeof vi.fn>;
        currentAnim?: { key: string } | null;
    };
};

type MockCursors = {
    up?: { isDown: boolean };
    down?: { isDown: boolean };
    left?: { isDown: boolean };
    right?: { isDown: boolean };
};

type MockScene = {
    anims: {
        create: ReturnType<typeof vi.fn>;
        generateFrameNumbers: ReturnType<typeof vi.fn>;
    };
    game: {
        loop: { delta: number };
    };
};

describe('PlayerController', () => {
    let controller: PlayerController;
    let mockPlayer: MockSprite;
    let mockCursors: MockCursors;
    let mockScene: MockScene;

    beforeEach(() => {
        // Create mock player sprite
        mockPlayer = {
            x: 100,
            y: 100,
            width: 32,
            height: 32,
            setPosition: vi.fn(function (x: number, y: number) {
                mockPlayer.x = x;
                mockPlayer.y = y;
            }),
            anims: {
                play: vi.fn(),
                currentAnim: null
            }
        };

        // Create mock cursors
        mockCursors = {
            up: { isDown: false },
            down: { isDown: false },
            left: { isDown: false },
            right: { isDown: false }
        };

        // Create mock scene with game loop delta (16ms ≈ 60 fps)
        mockScene = {
            anims: {
                create: vi.fn(),
                generateFrameNumbers: vi.fn((_key: string, _config: any) => [])
            },
            game: {
                loop: { delta: 16 }
            }
        };

        controller = new PlayerController(
            mockScene as unknown as Phaser.Scene,
            mockPlayer as unknown as Phaser.GameObjects.Sprite,
            mockCursors as unknown as Phaser.Types.Input.Keyboard.CursorKeys
        );
    });

    describe('initialization', () => {
        it('should create player animations on construction', () => {
            // Animation creation happens in constructor
            expect(mockScene.anims.create).toHaveBeenCalled();
            // Should create 6 animations: 3 walking + 3 idle
            const callCount = mockScene.anims.create.mock.calls.length;
            expect(callCount).toBeGreaterThanOrEqual(6);
        });

        it('should be enabled by default', () => {
            expect(controller.isEnabled()).toBe(true);
        });
    });

    describe('update', () => {
        it('should not move player when no keys are pressed', () => {
            const initialX = mockPlayer.x;
            const initialY = mockPlayer.y;
            controller.update();
            expect(mockPlayer.x).toBe(initialX);
            expect(mockPlayer.y).toBe(initialY);
        });

        it('should move player left when left cursor is pressed', () => {
            mockCursors.left!.isDown = true;
            controller.update();
            // Player should have moved left (negative X direction)
            expect(mockPlayer.x).toBeLessThan(100);
            // Should play left walking animation
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-left', true);
        });

        it('should move player right when right cursor is pressed', () => {
            mockCursors.right!.isDown = true;
            controller.update();
            // Player should have moved right (positive X direction)
            expect(mockPlayer.x).toBeGreaterThan(100);
            // Should play right walking animation
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-right', true);
        });

        it('should move player up when up cursor is pressed', () => {
            mockCursors.up!.isDown = true;
            controller.update();
            // Player should have moved up (negative Y direction)
            expect(mockPlayer.y).toBeLessThan(100);
            // An animation should play (walk-up when no horizontal movement)
            expect(mockPlayer.anims.play).toHaveBeenCalled();
        });

        it('should move player down when down cursor is pressed', () => {
            mockCursors.down!.isDown = true;
            controller.update();
            // Player should have moved down (positive Y direction)
            expect(mockPlayer.y).toBeGreaterThan(100);
            // An animation should play (walk-down when no horizontal movement)
            expect(mockPlayer.anims.play).toHaveBeenCalled();
        });

        it('should play idle animation when player stops moving', () => {
            mockPlayer.anims.currentAnim = { key: 'walk-right' };

            controller.update();

            expect(mockPlayer.anims.play).toHaveBeenCalledWith('idle-right', true);
        });

        it('should not update when disabled', () => {
            const initialX = mockPlayer.x;
            const initialY = mockPlayer.y;
            controller.setEnabled(false);
            mockCursors.right!.isDown = true;

            controller.update();

            // Position should not change when disabled
            expect(mockPlayer.x).toBe(initialX);
            expect(mockPlayer.y).toBe(initialY);
        });
    });

    describe('setEnabled', () => {
        it('should enable player movement', () => {
            controller.setEnabled(false);
            controller.setEnabled(true);
            expect(controller.isEnabled()).toBe(true);
        });

        it('should disable player movement', () => {
            controller.setEnabled(false);
            expect(controller.isEnabled()).toBe(false);
        });
    });

    describe('getPosition', () => {
        it('should return current player position', () => {
            mockPlayer.x = 150;
            mockPlayer.y = 200;
            const pos = controller.getPosition();
            expect(pos).toEqual({ x: 150, y: 200 });
        });
    });

    describe('setPosition', () => {
        it('should set player position', () => {
            controller.setPosition(300, 400);
            expect(mockPlayer.setPosition).toHaveBeenCalledWith(300, 400);
            expect(mockPlayer.x).toBe(300);
            expect(mockPlayer.y).toBe(400);
        });
    });

    describe('getSprite', () => {
        it('should return the player sprite', () => {
            const sprite = controller.getSprite();
            expect(sprite).toBe(mockPlayer as unknown as Phaser.GameObjects.Sprite);
        });
    });

    // ---------------------------------------------------------------------------
    // Narrow-passage (NARROW_NS / NARROW_EW) movement tests
    //
    // These tests construct a controller with a getCollisionAt function so the
    // movement-validation path is exercised.  The player starts inside tile (3,3)
    // at world position (96+16, 96+16) = (112, 112) — i.e. the centre of tile
    // (3,3) when TILE_SIZE=32.  Adjacent tiles are WALKABLE unless overridden.
    // ---------------------------------------------------------------------------
    describe('narrow passage movement', () => {
        const TILE_SIZE = 32;
        // Centre of tile (3,3)
        const TILE_3_CENTRE = 3 * TILE_SIZE + TILE_SIZE / 2; // 112

        /** Build a controller whose collision map has one special tile at (3,3). */
        function makeControllerWithNarrow(narrowType: CollisionType): {
            ctrl: PlayerController;
            player: MockSprite;
        } {
            const player: MockSprite = {
                x: TILE_3_CENTRE,
                y: TILE_3_CENTRE,
                width: TILE_SIZE,
                height: TILE_SIZE,
                setPosition: vi.fn(function (x: number, y: number) {
                    player.x = x;
                    player.y = y;
                }),
                anims: { play: vi.fn(), currentAnim: null }
            };
            const scene: MockScene = {
                anims: { create: vi.fn(), generateFrameNumbers: vi.fn(() => []) },
                game: { loop: { delta: 16 } }
            };
            const cursors: MockCursors = {
                up: { isDown: false }, down: { isDown: false },
                left: { isDown: false }, right: { isDown: false }
            };

            const getCollisionAt = (tx: number, ty: number): CollisionType => {
                if (tx === 3 && ty === 3) return narrowType;
                return CollisionType.WALKABLE;
            };

            const ctrl = new PlayerController(
                scene as unknown as Phaser.Scene,
                player as unknown as Phaser.GameObjects.Sprite,
                cursors as unknown as Phaser.Types.Input.Keyboard.CursorKeys,
                getCollisionAt
            );
            return { ctrl, player };
        }

        describe('NARROW_NS (vertical passage)', () => {
            it('allows entering from the north (player moves downward into tile)', () => {
                // Player is just above tile (3,3), moving south (positive dy).
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_NS);
                // Place player at the bottom of tile (3,2) — about to cross into (3,3).
                player.x = TILE_3_CENTRE;
                player.y = 3 * TILE_SIZE - 2; // just inside row 2

                // Target is the tile centre — distance > TARGET_REACHED_THRESHOLD so movement fires.
                ctrl.setTargetPosition(player.x, TILE_3_CENTRE);
                ctrl.update();

                // Should have moved into row 3.
                expect(Math.floor(player.y / TILE_SIZE)).toBe(3);
            });

            it('blocks entering from the east (player moves leftward into tile)', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_NS);
                // Place player just to the right of tile (3,3) in tile (4,3), moving west.
                player.x = 4 * TILE_SIZE + TILE_SIZE / 2;
                player.y = TILE_3_CENTRE;

                const startX = player.x;
                ctrl.setTargetPosition(player.x - 60, player.y);
                ctrl.update();

                // Should NOT have crossed into tile (3,3) horizontally.
                expect(player.x).toBeLessThan(startX); // moves within tile 4
                expect(Math.floor(player.x / TILE_SIZE)).toBeGreaterThanOrEqual(3);
                // Player should not be inside tile 3 column (< 3*TILE_SIZE+TILE_SIZE = 4*TILE_SIZE)
                // when coming from the east they are blocked at the tile boundary.
                expect(Math.floor(player.x / TILE_SIZE)).not.toBe(3);
            });

            it('blocks entering from the west (player moves rightward into tile)', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_NS);
                player.x = 2 * TILE_SIZE + TILE_SIZE / 2;
                player.y = TILE_3_CENTRE;

                const startX = player.x;
                ctrl.setTargetPosition(player.x + 60, player.y);
                ctrl.update();

                expect(player.x).toBeGreaterThan(startX);
                // Should stop at tile 2 boundary, not enter tile 3.
                expect(Math.floor(player.x / TILE_SIZE)).toBe(2);
            });

            it('clamps x to the central band while inside the tile', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_NS);
                // Player is inside tile (3,3) but offset far to the right.
                player.x = TILE_3_CENTRE + 10; // well outside the ±6 px band
                player.y = TILE_3_CENTRE;

                // Try to move further right (sub-tile move, stays in same tile).
                ctrl.setTargetPosition(player.x + 5, player.y);
                ctrl.update();

                const centreX = TILE_3_CENTRE;
                expect(player.x).toBeGreaterThanOrEqual(centreX - 6);
                expect(player.x).toBeLessThanOrEqual(centreX + 6);
            });

            it('snaps x to tile centre when entering from north', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_NS);
                // Player slightly off-centre horizontally, just above tile boundary.
                player.x = TILE_3_CENTRE + 4; // offset but still above boundary
                player.y = 3 * TILE_SIZE - 1;

                ctrl.setTargetPosition(player.x, player.y + 8);
                ctrl.update();

                if (Math.floor(player.y / TILE_SIZE) === 3) {
                    // If the player crossed into tile 3, x should be snapped to centre.
                    expect(player.x).toBe(TILE_3_CENTRE);
                }
            });
        });

        describe('NARROW_EW (horizontal passage)', () => {
            it('allows entering from the west (player moves rightward into tile)', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_EW);
                player.x = 3 * TILE_SIZE - 2;
                player.y = TILE_3_CENTRE;

                // Target is the tile centre — distance > TARGET_REACHED_THRESHOLD so movement fires.
                ctrl.setTargetPosition(TILE_3_CENTRE, player.y);
                ctrl.update();

                expect(Math.floor(player.x / TILE_SIZE)).toBe(3);
            });

            it('blocks entering from the north (player moves downward into tile)', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_EW);
                player.x = TILE_3_CENTRE;
                player.y = 2 * TILE_SIZE + TILE_SIZE / 2;

                const startY = player.y;
                ctrl.setTargetPosition(player.x, player.y + 60);
                ctrl.update();

                expect(player.y).toBeGreaterThan(startY);
                expect(Math.floor(player.y / TILE_SIZE)).toBe(2);
            });

            it('blocks entering from the south (player moves upward into tile)', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_EW);
                player.x = TILE_3_CENTRE;
                player.y = 4 * TILE_SIZE + TILE_SIZE / 2;

                const startY = player.y;
                ctrl.setTargetPosition(player.x, player.y - 60);
                ctrl.update();

                expect(player.y).toBeLessThan(startY);
                expect(Math.floor(player.y / TILE_SIZE)).toBe(4);
            });

            it('clamps y to the central band while inside the tile', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_EW);
                player.x = TILE_3_CENTRE;
                player.y = TILE_3_CENTRE + 10; // outside ±6 band

                ctrl.setTargetPosition(player.x, player.y + 5);
                ctrl.update();

                const centreY = TILE_3_CENTRE;
                expect(player.y).toBeGreaterThanOrEqual(centreY - 6);
                expect(player.y).toBeLessThanOrEqual(centreY + 6);
            });

            it('snaps y to tile centre when entering from the west', () => {
                const { ctrl, player } = makeControllerWithNarrow(CollisionType.NARROW_EW);
                player.x = 3 * TILE_SIZE - 1;
                player.y = TILE_3_CENTRE + 4;

                ctrl.setTargetPosition(player.x + 8, player.y);
                ctrl.update();

                if (Math.floor(player.x / TILE_SIZE) === 3) {
                    expect(player.y).toBe(TILE_3_CENTRE);
                }
            });
        });
    });
});
