import { describe, it, expect } from 'vitest';
import { Portal } from '@model/overworld/Portal';

describe('Portal', () => {
    describe('construction', () => {
        it('should store all fields', () => {
            const portal = new Portal('exit1', 3, 7, 'house', 'entrance');

            expect(portal.id).toBe('exit1');
            expect(portal.tileX).toBe(3);
            expect(portal.tileY).toBe(7);
            expect(portal.targetMapKey).toBe('house');
            expect(portal.targetSpawnID).toBe('entrance');
        });
    });

    describe('fromTiledObject', () => {
        it('should create a portal from a valid Tiled object', () => {
            const obj = {
                id: 10,
                name: 'shopDoor',
                x: 96,
                y: 224,
                properties: [
                    { name: 'targetMapKey', value: 'shop' },
                    { name: 'targetSpawnID', value: 'main_entrance' },
                ],
            };

            const portal = Portal.fromTiledObject(obj, 32, 32);

            expect(portal).not.toBeNull();
            expect(portal!.id).toBe('shopDoor');
            expect(portal!.tileX).toBe(3);
            expect(portal!.tileY).toBe(7);
            expect(portal!.targetMapKey).toBe('shop');
            expect(portal!.targetSpawnID).toBe('main_entrance');
        });

        it('should use numeric id as fallback when name is absent', () => {
            const obj = {
                id: 42,
                x: 64,
                y: 32,
                properties: [
                    { name: 'targetMapKey', value: 'inn' },
                    { name: 'targetSpawnID', value: 'door' },
                ],
            };

            const portal = Portal.fromTiledObject(obj, 32, 32);

            expect(portal).not.toBeNull();
            expect(portal!.id).toBe('42');
        });

        it('should convert pixel coords to tile coords using tileWidth and tileHeight', () => {
            const obj = {
                id: 1,
                x: 128,
                y: 64,
                properties: [
                    { name: 'targetMapKey', value: 'cellar' },
                    { name: 'targetSpawnID', value: 'ladder' },
                ],
            };

            const portal = Portal.fromTiledObject(obj, 32, 32);

            expect(portal!.tileX).toBe(4);
            expect(portal!.tileY).toBe(2);
        });

        it('should return null when x or y is missing', () => {
            const obj = {
                id: 1,
                properties: [
                    { name: 'targetMapKey', value: 'house' },
                    { name: 'targetSpawnID', value: 'door' },
                ],
            };

            const portal = Portal.fromTiledObject(obj as any, 32, 32);

            expect(portal).toBeNull();
        });

        it('should return null when targetMapKey property is absent', () => {
            const obj = {
                id: 1,
                x: 32,
                y: 32,
                properties: [
                    { name: 'targetSpawnID', value: 'door' },
                ],
            };

            const portal = Portal.fromTiledObject(obj, 32, 32);

            expect(portal).toBeNull();
        });

        it('should return null when targetSpawnID property is absent', () => {
            const obj = {
                id: 1,
                x: 32,
                y: 32,
                properties: [
                    { name: 'targetMapKey', value: 'house' },
                ],
            };

            const portal = Portal.fromTiledObject(obj, 32, 32);

            expect(portal).toBeNull();
        });

        it('should return null when properties array is absent entirely', () => {
            const obj = { id: 1, x: 32, y: 32 };

            const portal = Portal.fromTiledObject(obj, 32, 32);

            expect(portal).toBeNull();
        });

        it('should handle non-square tiles correctly', () => {
            const obj = {
                id: 1,
                x: 64,
                y: 96,
                properties: [
                    { name: 'targetMapKey', value: 'house' },
                    { name: 'targetSpawnID', value: 'door' },
                ],
            };

            const portal = Portal.fromTiledObject(obj, 32, 48);

            expect(portal!.tileX).toBe(2);
            expect(portal!.tileY).toBe(2);
        });

        it('should accept the overworld sentinel value for targetMapKey', () => {
            const obj = {
                id: 5,
                x: 32,
                y: 64,
                properties: [
                    { name: 'targetMapKey', value: 'overworld' },
                    { name: 'targetSpawnID', value: 'house_exit' },
                ],
            };

            const portal = Portal.fromTiledObject(obj, 32, 32);

            expect(portal).not.toBeNull();
            expect(portal!.targetMapKey).toBe('overworld');
        });
    });
});
