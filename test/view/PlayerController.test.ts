import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Phaser from 'phaser';
import { PlayerController } from '@view/PlayerController';

// Mock Phaser types for testing
type MockSprite = {
    x: number;
    y: number;
    width: number;
    height: number;
    setVelocity: ReturnType<typeof vi.fn>;
    setVelocityX: ReturnType<typeof vi.fn>;
    setVelocityY: ReturnType<typeof vi.fn>;
    setFlipX: ReturnType<typeof vi.fn>;
    setPosition: ReturnType<typeof vi.fn>;
    anims: {
        play: ReturnType<typeof vi.fn>;
        currentAnim?: { key: string } | null;
    };
    body: {
        velocity: { x: number; y: number };
        setSize: ReturnType<typeof vi.fn>;
        setOffset: ReturnType<typeof vi.fn>;
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
            setVelocity: vi.fn(function (x: number, y?: number) {
                mockPlayer.body.velocity.x = x;
                mockPlayer.body.velocity.y = y ?? 0;
            }),
            setVelocityX: vi.fn(),
            setVelocityY: vi.fn(),
            setFlipX: vi.fn(),
            setPosition: vi.fn(function (x: number, y: number) {
                mockPlayer.x = x;
                mockPlayer.y = y;
            }),
            anims: {
                play: vi.fn(),
                currentAnim: null
            },
            body: {
                velocity: { x: 0, y: 0 },
                setSize: vi.fn(),
                setOffset: vi.fn()
            }
        };

        // Create mock cursors
        mockCursors = {
            up: { isDown: false },
            down: { isDown: false },
            left: { isDown: false },
            right: { isDown: false }
        };

        // Create mock scene
        mockScene = {
            anims: {
                create: vi.fn(),
                generateFrameNumbers: vi.fn((_key: string, _config: any) => [])
            }
        };

        controller = new PlayerController(
            mockScene as unknown as Phaser.Scene,
            mockPlayer as unknown as Phaser.Physics.Arcade.Sprite,
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
            controller.update();
            // Velocity should be reset to 0, 0
            expect(mockPlayer.body.velocity.x).toBe(0);
            expect(mockPlayer.body.velocity.y).toBe(0);
        });

        it('should move player left when left cursor is pressed', () => {
            mockCursors.left!.isDown = true;
            controller.update();
            expect(mockPlayer.setVelocity).toHaveBeenCalled();
            // Velocity should be negative X
            expect(mockPlayer.body.velocity.x).toBeLessThan(0);
            // Should flip sprite and play walking animation
            expect(mockPlayer.setFlipX).toHaveBeenCalledWith(true);
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-right', true);
        });

        it('should move player right when right cursor is pressed', () => {
            mockCursors.right!.isDown = true;
            controller.update();
            expect(mockPlayer.setVelocity).toHaveBeenCalled();
            // Velocity should be positive X
            expect(mockPlayer.body.velocity.x).toBeGreaterThan(0);
            // Should not flip sprite and play walking animation
            expect(mockPlayer.setFlipX).toHaveBeenCalledWith(false);
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-right', true);
        });

        it('should move player up when up cursor is pressed', () => {
            mockCursors.up!.isDown = true;
            controller.update();
            expect(mockPlayer.setVelocity).toHaveBeenCalled();
            // Velocity should be negative Y
            expect(mockPlayer.body.velocity.y).toBeLessThan(0);
            // An animation should play (walk-up when no horizontal movement)
            expect(mockPlayer.anims.play).toHaveBeenCalled();
        });

        it('should move player down when down cursor is pressed', () => {
            mockCursors.down!.isDown = true;
            controller.update();
            expect(mockPlayer.setVelocity).toHaveBeenCalled();
            // Velocity should be positive Y
            expect(mockPlayer.body.velocity.y).toBeGreaterThan(0);
            // An animation should play (walk-down when no horizontal movement)
            expect(mockPlayer.anims.play).toHaveBeenCalled();
        });

        it('should play idle animation when player stops moving', () => {
            mockPlayer.body.velocity.x = 0;
            mockPlayer.body.velocity.y = 0;
            mockPlayer.anims.currentAnim = { key: 'walk-right' };

            controller.update();

            expect(mockPlayer.anims.play).toHaveBeenCalledWith('idle-right', true);
        });

        it('should not update when disabled', () => {
            controller.setEnabled(false);
            mockCursors.right!.isDown = true;

            controller.update();

            // Should not set velocity when disabled
            expect(mockPlayer.setVelocityX).not.toHaveBeenCalled();
        });
    });

    describe('setEnabled', () => {
        it('should enable player movement', () => {
            controller.setEnabled(false);
            controller.setEnabled(true);
            expect(controller.isEnabled()).toBe(true);
        });

        it('should disable player movement and stop velocity', () => {
            controller.setEnabled(false);
            expect(controller.isEnabled()).toBe(false);
            expect(mockPlayer.setVelocity).toHaveBeenCalledWith(0);
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
            expect(sprite).toBe(mockPlayer as unknown as Phaser.Physics.Arcade.Sprite);
        });
    });
});
