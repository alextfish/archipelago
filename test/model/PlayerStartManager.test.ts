import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerStartManager, type TiledMapData } from '@model/overworld/PlayerStartManager';

describe('PlayerStartManager', () => {
    let mockMapData: TiledMapData;
    let manager: PlayerStartManager;

    beforeEach(() => {
        // Create mock Tiled map data with multiple player starts
        mockMapData = {
            layers: [
                {
                    name: 'sceneTransitions',
                    objects: [
                        {
                            name: 'player start',
                            x: 1952,
                            y: 1760,
                            properties: [
                                { name: 'id', type: 'string', value: 'forest' },
                                { name: 'default', type: 'bool', value: true }
                            ]
                        },
                        {
                            name: 'player start',
                            x: 1440,
                            y: 2624,
                            properties: [
                                { name: 'id', type: 'string', value: 'beach' },
                                { name: 'default', type: 'bool', value: false }
                            ]
                        },
                        {
                            name: 'other object',
                            x: 100,
                            y: 100,
                            properties: []
                        }
                    ]
                },
                {
                    name: 'collision',
                    objects: []
                }
            ]
        };

        manager = new PlayerStartManager(mockMapData);
    });

    describe('getDefaultStart', () => {
        it('should return the start position marked as default', () => {
            const defaultStart = manager.getDefaultStart();

            expect(defaultStart).not.toBeNull();
            expect(defaultStart?.id).toBe('forest');
            expect(defaultStart?.x).toBe(1952);
            expect(defaultStart?.y).toBe(1760);
            expect(defaultStart?.isDefault).toBe(true);
        });

        it('should return null if no default start exists', () => {
            const noDefaultMap: TiledMapData = {
                layers: [
                    {
                        name: 'sceneTransitions',
                        objects: [
                            {
                                name: 'player start',
                                x: 100,
                                y: 100,
                                properties: [
                                    { name: 'id', type: 'string', value: 'test' },
                                    { name: 'default', type: 'bool', value: false }
                                ]
                            }
                        ]
                    }
                ]
            };

            const emptyManager = new PlayerStartManager(noDefaultMap);
            const defaultStart = emptyManager.getDefaultStart();

            expect(defaultStart).toBeNull();
        });
    });

    describe('getStartByID', () => {
        it('should return the correct start position by ID', () => {
            const beachStart = manager.getStartByID('beach');

            expect(beachStart).not.toBeNull();
            expect(beachStart?.id).toBe('beach');
            expect(beachStart?.x).toBe(1440);
            expect(beachStart?.y).toBe(2624);
            expect(beachStart?.isDefault).toBe(false);
        });

        it('should return the forest start when requested', () => {
            const forestStart = manager.getStartByID('forest');

            expect(forestStart).not.toBeNull();
            expect(forestStart?.id).toBe('forest');
            expect(forestStart?.x).toBe(1952);
            expect(forestStart?.y).toBe(1760);
            expect(forestStart?.isDefault).toBe(true);
        });

        it('should return null for non-existent ID', () => {
            const nonExistent = manager.getStartByID('nonexistent');

            expect(nonExistent).toBeNull();
        });
    });

    describe('getAllStarts', () => {
        it('should return all player start positions', () => {
            const allStarts = manager.getAllStarts();

            expect(allStarts).toHaveLength(2);
            expect(allStarts.map(s => s.id)).toContain('forest');
            expect(allStarts.map(s => s.id)).toContain('beach');
        });

        it('should return empty array when no starts exist', () => {
            const emptyMap: TiledMapData = {
                layers: [
                    {
                        name: 'sceneTransitions',
                        objects: []
                    }
                ]
            };

            const emptyManager = new PlayerStartManager(emptyMap);
            const allStarts = emptyManager.getAllStarts();

            expect(allStarts).toHaveLength(0);
        });

        it('should return a copy, not the original array', () => {
            const allStarts1 = manager.getAllStarts();
            const allStarts2 = manager.getAllStarts();

            expect(allStarts1).not.toBe(allStarts2);
            expect(allStarts1).toEqual(allStarts2);
        });
    });

    describe('getStart', () => {
        it('should return start by ID when ID is provided', () => {
            const start = manager.getStart('beach');

            expect(start).not.toBeNull();
            expect(start?.id).toBe('beach');
        });

        it('should return default start when no ID is provided', () => {
            const start = manager.getStart();

            expect(start).not.toBeNull();
            expect(start?.id).toBe('forest');
            expect(start?.isDefault).toBe(true);
        });

        it('should return null when provided ID does not exist', () => {
            const start = manager.getStart('invalid');

            expect(start).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('should handle map with no sceneTransitions layer', () => {
            const noLayerMap: TiledMapData = {
                layers: [
                    {
                        name: 'collision',
                        objects: []
                    }
                ]
            };

            const emptyManager = new PlayerStartManager(noLayerMap);
            const defaultStart = emptyManager.getDefaultStart();

            expect(defaultStart).toBeNull();
            expect(emptyManager.getAllStarts()).toHaveLength(0);
        });

        it('should handle player start with missing properties', () => {
            const minimalMap: TiledMapData = {
                layers: [
                    {
                        name: 'sceneTransitions',
                        objects: [
                            {
                                name: 'player start',
                                x: 100,
                                y: 200
                                // No properties array
                            }
                        ]
                    }
                ]
            };

            const minimalManager = new PlayerStartManager(minimalMap);
            const allStarts = minimalManager.getAllStarts();

            expect(allStarts).toHaveLength(1);
            expect(allStarts[0].x).toBe(100);
            expect(allStarts[0].y).toBe(200);
            expect(allStarts[0].id).toBe('');
            expect(allStarts[0].isDefault).toBe(false);
        });

        it('should handle player start with missing x/y coordinates', () => {
            const noCoordMap: TiledMapData = {
                layers: [
                    {
                        name: 'sceneTransitions',
                        objects: [
                            {
                                name: 'player start',
                                properties: [
                                    { name: 'id', type: 'string', value: 'test' }
                                ]
                            }
                        ]
                    }
                ]
            };

            const noCoordManager = new PlayerStartManager(noCoordMap);
            const start = noCoordManager.getStartByID('test');

            expect(start).not.toBeNull();
            expect(start?.x).toBe(0);
            expect(start?.y).toBe(0);
        });
    });
});
