import { describe, it, expect } from 'vitest';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';

describe('TiledLayerUtils', () => {
    describe('getLayerSuffix', () => {
        it('returns the full name when there is no slash', () => {
            expect(TiledLayerUtils.getLayerSuffix('collision')).toBe('collision');
        });

        it('returns the part after the last slash for a single-level path', () => {
            expect(TiledLayerUtils.getLayerSuffix('Beach/collision')).toBe('collision');
        });

        it('returns the part after the last slash for a multi-level path', () => {
            expect(TiledLayerUtils.getLayerSuffix('World/Forest/npcs')).toBe('npcs');
        });

        it('handles a name that is just a slash', () => {
            expect(TiledLayerUtils.getLayerSuffix('/')).toBe('');
        });

        it('handles an empty string', () => {
            expect(TiledLayerUtils.getLayerSuffix('')).toBe('');
        });

        it('handles different suffixes correctly', () => {
            expect(TiledLayerUtils.getLayerSuffix('Beach/npcs')).toBe('npcs');
            expect(TiledLayerUtils.getLayerSuffix('Beach/doors')).toBe('doors');
            expect(TiledLayerUtils.getLayerSuffix('Forest/roofs')).toBe('roofs');
            expect(TiledLayerUtils.getLayerSuffix('Island/water')).toBe('water');
        });
    });

    describe('findObjectLayersByName', () => {
        it('returns an empty array when given an empty layers list', () => {
            expect(TiledLayerUtils.findObjectLayersByName([], 'npcs')).toEqual([]);
        });

        it('finds a top-level objectgroup layer whose name matches the suffix', () => {
            const layers = [
                { name: 'npcs', type: 'objectgroup', objects: [] }
            ];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'npcs');
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('npcs');
            expect(results[0].fullPath).toBe('npcs');
        });

        it('does NOT match a tilelayer even when the name matches the suffix', () => {
            const layers = [
                { name: 'npcs', type: 'tilelayer', data: [] }
            ];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'npcs');
            expect(results).toHaveLength(0);
        });

        it('finds object layers nested inside a group', () => {
            const layers = [
                {
                    name: 'Beach',
                    type: 'group',
                    layers: [
                        { name: 'ground', type: 'tilelayer', data: [] },
                        { name: 'npcs', type: 'objectgroup', objects: [] }
                    ]
                }
            ];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'npcs');
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('npcs');
            expect(results[0].fullPath).toBe('Beach/npcs');
        });

        it('finds object layers in multiple groups', () => {
            const layers = [
                {
                    name: 'Beach',
                    type: 'group',
                    layers: [
                        { name: 'npcs', type: 'objectgroup', objects: [] }
                    ]
                },
                {
                    name: 'Forest',
                    type: 'group',
                    layers: [
                        { name: 'npcs', type: 'objectgroup', objects: [] }
                    ]
                }
            ];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'npcs');
            expect(results).toHaveLength(2);
            expect(results[0].fullPath).toBe('Beach/npcs');
            expect(results[1].fullPath).toBe('Forest/npcs');
        });

        it('returns empty when no layer name matches the suffix', () => {
            const layers = [
                { name: 'doors', type: 'objectgroup', objects: [] },
                {
                    name: 'Beach',
                    type: 'group',
                    layers: [
                        { name: 'collision', type: 'tilelayer', data: [] }
                    ]
                }
            ];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'npcs');
            expect(results).toHaveLength(0);
        });

        it('does not match a layer whose name merely contains the suffix', () => {
            const layers = [
                { name: 'extra-npcs', type: 'objectgroup', objects: [] },
                { name: 'npcs-area', type: 'objectgroup', objects: [] }
            ];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'npcs');
            expect(results).toHaveLength(0);
        });

        it('matches a top-level layer whose name equals the suffix (no path prefix)', () => {
            const layers = [
                { name: 'doors', type: 'objectgroup', objects: [] }
            ];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'doors');
            expect(results).toHaveLength(1);
            expect(results[0].fullPath).toBe('doors');
        });

        it('includes the raw data object in the result', () => {
            const layerData = { name: 'npcs', type: 'objectgroup', objects: [{ id: 1 }] };
            const layers = [layerData];
            const results = TiledLayerUtils.findObjectLayersByName(layers, 'npcs');
            expect(results[0].data).toBe(layerData);
        });

        it('ignores group layers that lack a layers property', () => {
            const layers = [
                { name: 'Beach', type: 'group' } // no .layers
            ];
            expect(() => TiledLayerUtils.findObjectLayersByName(layers, 'npcs')).not.toThrow();
            expect(TiledLayerUtils.findObjectLayersByName(layers, 'npcs')).toHaveLength(0);
        });
    });
});
