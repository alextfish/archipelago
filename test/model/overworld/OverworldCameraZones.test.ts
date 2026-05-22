import { describe, expect, it } from 'vitest';
import { OverworldCameraZones } from '@model/overworld/OverworldCameraZones';

function property(name: string, value: unknown): { name: string; value: unknown } {
    return { name, value };
}

describe('OverworldCameraZones', () => {
    it('resolves the highest-priority scope and ignores zoom rectangles while scoped', () => {
        const zones = OverworldCameraZones.fromTiledLayers([
            {
                name: 'camera',
                type: 'objectgroup',
                objects: [
                    {
                        id: 1,
                        name: 'focus',
                        x: 100,
                        y: 200,
                        width: 320,
                        height: 160,
                        properties: [property('tag', 'baysandbanks')]
                    },
                    {
                        id: 2,
                        name: 'scope',
                        x: 0,
                        y: 0,
                        width: 128,
                        height: 128,
                        properties: [property('tag', 'baysandbanks'), property('priority', 3)]
                    },
                    {
                        id: 3,
                        name: 'scope',
                        x: 32,
                        y: 32,
                        width: 128,
                        height: 128,
                        properties: [property('tag', 'baysandbanks'), property('priority', 7)]
                    },
                    {
                        id: 4,
                        name: 'zoom',
                        x: 0,
                        y: 0,
                        width: 256,
                        height: 256,
                        properties: [property('zoom', 3), property('priority', 100)]
                    }
                ]
            }
        ]);

        const target = zones.resolveAt(64, 64, 2);

        expect(target.mode).toBe('scope');
        expect(target.scopeZone?.priority).toBe(7);
        expect(target.focusBounds).toEqual({ x: 100, y: 200, width: 320, height: 160 });
        expect(target.followZoom).toBe(2);
    });

    it('uses the highest-priority zoom rectangle when no scope matches', () => {
        const zones = OverworldCameraZones.fromTiledLayers([
            {
                name: 'camera',
                type: 'objectgroup',
                objects: [
                    {
                        id: 10,
                        name: 'zoom',
                        x: 0,
                        y: 0,
                        width: 200,
                        height: 200,
                        properties: [property('zoom', 2.5), property('priority', 1)]
                    },
                    {
                        id: 11,
                        name: 'zoom',
                        x: 50,
                        y: 50,
                        width: 120,
                        height: 120,
                        properties: [property('zoom', 3), property('priority', 4)]
                    }
                ]
            }
        ]);

        const target = zones.resolveAt(60, 60, 2);

        expect(target.mode).toBe('follow');
        expect(target.followZoom).toBe(3);
        expect(target.zoomZone?.priority).toBe(4);
    });

    it('falls back to the default zoom when camera objects are incomplete', () => {
        const zones = OverworldCameraZones.fromTiledLayers([
            {
                name: 'camera',
                type: 'objectgroup',
                objects: [
                    {
                        id: 20,
                        name: 'scope',
                        x: 0,
                        y: 0,
                        width: 64,
                        height: 64,
                        properties: [property('tag', 'missing-focus'), property('priority', 5)]
                    },
                    {
                        id: 21,
                        name: 'zoom',
                        x: 0,
                        y: 0,
                        width: 64,
                        height: 64,
                        properties: [property('priority', 1)]
                    }
                ]
            }
        ]);

        const target = zones.resolveAt(10, 10, 2);

        expect(target.mode).toBe('follow');
        expect(target.followZoom).toBe(2);
        expect(target.zoomZone).toBeUndefined();
        expect(zones.getScopeZones()).toHaveLength(0);
        expect(zones.getZoomZones()).toHaveLength(0);
    });
});