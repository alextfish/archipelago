import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Phaser from 'phaser';
import { PlayerController } from '@view/PlayerController';

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
});
