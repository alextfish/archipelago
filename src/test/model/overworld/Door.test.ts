/**
 * Unit tests for Door
 */

import { describe, it, expect } from 'vitest';
import { Door } from '@model/overworld/Door';

describe('Door', () => {
    describe('construction', () => {
        it('should create door with single position', () => {
            const door = new Door('door1', [{ tileX: 5, tileY: 10 }]);

            expect(door.id).toBe('door1');
            expect(door.getPositions()).toHaveLength(1);
            expect(door.getPositions()[0]).toEqual({ tileX: 5, tileY: 10 });
            expect(door.isLocked()).toBe(true);
        });

        it('should create door with multiple positions', () => {
            const positions = [
                { tileX: 5, tileY: 10 },
                { tileX: 5, tileY: 11 }
            ];
            const door = new Door('door1', positions);

            expect(door.getPositions()).toHaveLength(2);
            expect(door.getPositions()).toEqual(positions);
        });

        it('should create unlocked door when specified', () => {
            const door = new Door('door1', [{ tileX: 5, tileY: 10 }], false);

            expect(door.isLocked()).toBe(false);
        });

        it('should store optional seriesId and spriteId', () => {
            const door = new Door(
                'door1',
                [{ tileX: 5, tileY: 10 }],
                true,
                'tutorial-series',
                'wooden-door'
            );

            expect(door.seriesId).toBe('tutorial-series');
            expect(door.spriteId).toBe('wooden-door');
        });

        it('should throw error when no positions provided', () => {
            expect(() => new Door('door1', [])).toThrow('Door must have at least one position');
        });
    });

    describe('lock/unlock', () => {
        it('should unlock door', () => {
            const door = new Door('door1', [{ tileX: 5, tileY: 10 }]);

            expect(door.isLocked()).toBe(true);
            door.unlock();
            expect(door.isLocked()).toBe(false);
        });

        it('should lock door', () => {
            const door = new Door('door1', [{ tileX: 5, tileY: 10 }], false);

            expect(door.isLocked()).toBe(false);
            door.lock();
            expect(door.isLocked()).toBe(true);
        });
    });

    describe('occupiesTile', () => {
        it('should return true for tile it occupies', () => {
            const door = new Door('door1', [
                { tileX: 5, tileY: 10 },
                { tileX: 5, tileY: 11 }
            ]);

            expect(door.occupiesTile(5, 10)).toBe(true);
            expect(door.occupiesTile(5, 11)).toBe(true);
        });

        it('should return false for tile it does not occupy', () => {
            const door = new Door('door1', [
                { tileX: 5, tileY: 10 }
            ]);

            expect(door.occupiesTile(5, 11)).toBe(false);
            expect(door.occupiesTile(6, 10)).toBe(false);
        });
    });

    describe('fromTiledObject', () => {
        it('should create door from simple Tiled object', () => {
            const tiledObj = {
                name: 'door1',
                x: 160,
                y: 320,
                width: 32,
                height: 32
            };

            const door = Door.fromTiledObject(tiledObj, 32, 32);

            expect(door.id).toBe('door1');
            expect(door.getPositions()).toHaveLength(1);
            expect(door.getPositions()[0]).toEqual({ tileX: 5, tileY: 10 });
            expect(door.isLocked()).toBe(true);
        });

        it('should create door from Tiled object with multiple tiles', () => {
            const tiledObj = {
                name: 'door2',
                x: 160,
                y: 320,
                width: 32,
                height: 64  // 2 tiles high
            };

            const door = Door.fromTiledObject(tiledObj, 32, 32);

            expect(door.getPositions()).toHaveLength(2);
            expect(door.getPositions()).toContainEqual({ tileX: 5, tileY: 10 });
            expect(door.getPositions()).toContainEqual({ tileX: 5, tileY: 11 });
        });

        it('should extract seriesId from properties', () => {
            const tiledObj = {
                name: 'door1',
                x: 160,
                y: 320,
                width: 32,
                height: 32,
                properties: [
                    { name: 'seriesId', value: 'tutorial-series' }
                ]
            };

            const door = Door.fromTiledObject(tiledObj, 32, 32);

            expect(door.seriesId).toBe('tutorial-series');
        });

        it('should extract spriteId from properties', () => {
            const tiledObj = {
                name: 'door1',
                x: 160,
                y: 320,
                width: 32,
                height: 32,
                properties: [
                    { name: 'spriteId', value: 'wooden-door' }
                ]
            };

            const door = Door.fromTiledObject(tiledObj, 32, 32);

            expect(door.spriteId).toBe('wooden-door');
        });

        it('should extract both seriesId and spriteId', () => {
            const tiledObj = {
                name: 'door1',
                x: 160,
                y: 320,
                width: 32,
                height: 32,
                properties: [
                    { name: 'seriesId', value: 'tutorial-series' },
                    { name: 'spriteId', value: 'wooden-door' }
                ]
            };

            const door = Door.fromTiledObject(tiledObj, 32, 32);

            expect(door.seriesId).toBe('tutorial-series');
            expect(door.spriteId).toBe('wooden-door');
        });

        it('should use id as fallback when name is missing', () => {
            const tiledObj = {
                id: 42,
                x: 160,
                y: 320,
                width: 32,
                height: 32
            };

            const door = Door.fromTiledObject(tiledObj, 32, 32);

            expect(door.id).toBe('42');
        });

        it('should handle object with non-standard tile size', () => {
            const tiledObj = {
                name: 'door1',
                x: 128,
                y: 256,
                width: 64,
                height: 64
            };

            const door = Door.fromTiledObject(tiledObj, 64, 64);

            expect(door.getPositions()).toHaveLength(1);
            expect(door.getPositions()[0]).toEqual({ tileX: 2, tileY: 4 });
        });
    });
});
