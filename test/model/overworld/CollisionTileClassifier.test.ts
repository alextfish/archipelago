import { describe, it, expect } from 'vitest';
import { CollisionTileClassifier } from '@model/overworld/CollisionTileClassifier';
import { CollisionType } from '@model/overworld/CollisionManager';

describe('CollisionTileClassifier', () => {
    describe('classifyTile', () => {
        it('returns WALKABLE with hasTile=false when no tiles are provided', () => {
            const result = CollisionTileClassifier.classifyTile([]);
            expect(result.collisionType).toBe(CollisionType.WALKABLE);
            expect(result.hasTile).toBe(false);
            expect(result.hasWalkable).toBe(false);
            expect(result.hasWalkableLow).toBe(false);
        });

        it('returns WALKABLE with hasTile=false when all layer entries are null', () => {
            const result = CollisionTileClassifier.classifyTile([null, null]);
            expect(result.collisionType).toBe(CollisionType.WALKABLE);
            expect(result.hasTile).toBe(false);
        });

        it('returns BLOCKED when a tile has no walkable properties', () => {
            const result = CollisionTileClassifier.classifyTile([{ properties: {} }]);
            expect(result.collisionType).toBe(CollisionType.BLOCKED);
            expect(result.hasTile).toBe(true);
            expect(result.hasWalkable).toBe(false);
            expect(result.hasWalkableLow).toBe(false);
        });

        it('returns BLOCKED when a tile has no properties object at all', () => {
            const result = CollisionTileClassifier.classifyTile([{}]);
            expect(result.collisionType).toBe(CollisionType.BLOCKED);
            expect(result.hasTile).toBe(true);
        });

        it('returns WALKABLE when a tile has walkable=true', () => {
            const result = CollisionTileClassifier.classifyTile([{ properties: { walkable: true } }]);
            expect(result.collisionType).toBe(CollisionType.WALKABLE);
            expect(result.hasWalkable).toBe(true);
            expect(result.hasTile).toBe(true);
        });

        it('returns WALKABLE_LOW when a tile has walkable_low=true', () => {
            const result = CollisionTileClassifier.classifyTile([{ properties: { walkable_low: true } }]);
            expect(result.collisionType).toBe(CollisionType.WALKABLE_LOW);
            expect(result.hasWalkableLow).toBe(true);
            expect(result.hasTile).toBe(true);
        });

        it('returns STAIRS when a tile has stairs=true', () => {
            const result = CollisionTileClassifier.classifyTile([{ properties: { stairs: true } }]);
            expect(result.collisionType).toBe(CollisionType.STAIRS);
            expect(result.hasTile).toBe(true);
        });

        it('a later tile with walkable=true overrides an earlier BLOCKED tile', () => {
            const result = CollisionTileClassifier.classifyTile([
                { properties: {} },              // would be BLOCKED
                { properties: { walkable: true } } // overrides to WALKABLE
            ]);
            expect(result.collisionType).toBe(CollisionType.WALKABLE);
            expect(result.hasWalkable).toBe(true);
        });

        it('skips null entries in the middle of the list', () => {
            const result = CollisionTileClassifier.classifyTile([
                null,
                { properties: { walkable: true } }
            ]);
            expect(result.collisionType).toBe(CollisionType.WALKABLE);
            expect(result.hasTile).toBe(true);
        });

        it('stairs=true takes priority when present alongside other properties', () => {
            const result = CollisionTileClassifier.classifyTile([
                { properties: { walkable: true, stairs: true } }
            ]);
            expect(result.collisionType).toBe(CollisionType.STAIRS);
        });

        it('STAIRS type is preserved when a later tile has no walkable properties', () => {
            // The collisionType !== STAIRS guard must prevent a subsequent property-less
            // tile from overriding an earlier stairs tile back to BLOCKED.
            const result = CollisionTileClassifier.classifyTile([
                { properties: { stairs: true } }, // sets STAIRS
                {} // no properties – would naively set BLOCKED
            ]);
            expect(result.collisionType).toBe(CollisionType.STAIRS);
        });
    });

    describe('toSubLayerValues', () => {
        it('returns all zeros when hasTile is false', () => {
            const result = CollisionTileClassifier.toSubLayerValues({
                collisionType: CollisionType.WALKABLE,
                hasWalkable: false,
                hasWalkableLow: false,
                hasTile: false
            });
            expect(result).toEqual({ upperGround: 0, lowerGround: 0, blocked: 0 });
        });

        it('returns all zeros for STAIRS', () => {
            const result = CollisionTileClassifier.toSubLayerValues({
                collisionType: CollisionType.STAIRS,
                hasWalkable: false,
                hasWalkableLow: false,
                hasTile: true
            });
            expect(result).toEqual({ upperGround: 0, lowerGround: 0, blocked: 0 });
        });

        it('returns lowerGround=1 for WALKABLE_LOW (blocks player on upper layer)', () => {
            const result = CollisionTileClassifier.toSubLayerValues({
                collisionType: CollisionType.WALKABLE_LOW,
                hasWalkable: false,
                hasWalkableLow: true,
                hasTile: true
            });
            expect(result).toEqual({ upperGround: 0, lowerGround: 1, blocked: 0 });
        });

        it('returns upperGround=1 for WALKABLE (blocks player on lower layer)', () => {
            const result = CollisionTileClassifier.toSubLayerValues({
                collisionType: CollisionType.WALKABLE,
                hasWalkable: true,
                hasWalkableLow: false,
                hasTile: true
            });
            expect(result).toEqual({ upperGround: 1, lowerGround: 0, blocked: 0 });
        });

        it('returns blocked=1 for BLOCKED (always impassable)', () => {
            const result = CollisionTileClassifier.toSubLayerValues({
                collisionType: CollisionType.BLOCKED,
                hasWalkable: false,
                hasWalkableLow: false,
                hasTile: true
            });
            expect(result).toEqual({ upperGround: 0, lowerGround: 0, blocked: 1 });
        });
    });

    describe('classifyTile + toSubLayerValues round-trip', () => {
        it('open ground (no tile) → all sub-layers zero', () => {
            const classification = CollisionTileClassifier.classifyTile([null]);
            const subLayers = CollisionTileClassifier.toSubLayerValues(classification);
            expect(subLayers).toEqual({ upperGround: 0, lowerGround: 0, blocked: 0 });
        });

        it('wall tile (no properties) → blocked sub-layer', () => {
            const classification = CollisionTileClassifier.classifyTile([{}]);
            const subLayers = CollisionTileClassifier.toSubLayerValues(classification);
            expect(subLayers).toEqual({ upperGround: 0, lowerGround: 0, blocked: 1 });
        });

        it('walkable tile → upperGround sub-layer', () => {
            const classification = CollisionTileClassifier.classifyTile([{ properties: { walkable: true } }]);
            const subLayers = CollisionTileClassifier.toSubLayerValues(classification);
            expect(subLayers).toEqual({ upperGround: 1, lowerGround: 0, blocked: 0 });
        });

        it('walkable_low tile → lowerGround sub-layer', () => {
            const classification = CollisionTileClassifier.classifyTile([{ properties: { walkable_low: true } }]);
            const subLayers = CollisionTileClassifier.toSubLayerValues(classification);
            expect(subLayers).toEqual({ upperGround: 0, lowerGround: 1, blocked: 0 });
        });

        it('stairs tile → no sub-layer blocking', () => {
            const classification = CollisionTileClassifier.classifyTile([{ properties: { stairs: true } }]);
            const subLayers = CollisionTileClassifier.toSubLayerValues(classification);
            expect(subLayers).toEqual({ upperGround: 0, lowerGround: 0, blocked: 0 });
        });
    });
});
