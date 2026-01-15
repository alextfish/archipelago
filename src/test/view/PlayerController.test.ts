import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Phaser from 'phaser';
import { PlayerController } from '@view/PlayerController';

// Mock Phaser types for testing
type MockSprite = {
    x: number;
    y: number;
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
            setVelocity: vi.fn(),
            setVelocityX: vi.fn(),
            setVelocityY: vi.fn(),
            setFlipX: vi.fn(),
            setPosition: vi.fn(function(x: number, y: number) {
                mockPlayer.x = x;
                mockPlayer.y = y;
            }),
            anims: {
                play: vi.fn(),
                currentAnim: null
            },
            body: {
                velocity: { x: 0, y: 0 }
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
                generateFrameNumbers: vi.fn((key: string, config: any) => [])
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
            expect(mockPlayer.setVelocity).toHaveBeenCalledWith(0);
        });

        it('should move player left when left cursor is pressed', () => {
            mockCursors.left!.isDown = true;
            controller.update();
            expect(mockPlayer.setVelocityX).toHaveBeenCalledWith(-100);
            expect(mockPlayer.setFlipX).toHaveBeenCalledWith(true);
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-right', true);
        });

        it('should move player right when right cursor is pressed', () => {
            mockCursors.right!.isDown = true;
            controller.update();
            expect(mockPlayer.setVelocityX).toHaveBeenCalledWith(100);
            expect(mockPlayer.setFlipX).toHaveBeenCalledWith(false);
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-right', true);
        });

        it('should move player up when up cursor is pressed', () => {
            mockCursors.up!.isDown = true;
            mockPlayer.body.velocity.x = 0; // Not moving horizontally
            controller.update();
            expect(mockPlayer.setVelocityY).toHaveBeenCalledWith(-100);
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-up', true);
        });

        it('should move player down when down cursor is pressed', () => {
            mockCursors.down!.isDown = true;
            mockPlayer.body.velocity.x = 0; // Not moving horizontally
            controller.update();
            expect(mockPlayer.setVelocityY).toHaveBeenCalledWith(100);
            expect(mockPlayer.anims.play).toHaveBeenCalledWith('walk-down', true);
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
