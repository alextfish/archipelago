import { describe, it, expect } from 'vitest';
import { CollisionType } from '@model/overworld/CollisionTypes';
import {
    collisionTypeFromWalkableHalfDirection,
    isBoundaryCrossingWalkable,
    isPositionWalkableInTile,
    isWalkableHalfDirectionAtLocalPosition,
} from '@model/overworld/WalkableHalfTile';

describe('WalkableHalfTile', () => {
    describe('collisionTypeFromWalkableHalfDirection', () => {
        it('maps known direction strings to collision types', () => {
            expect(collisionTypeFromWalkableHalfDirection('s')).toBe(CollisionType.WALKABLE_HALF_S);
            expect(collisionTypeFromWalkableHalfDirection('SW')).toBe(CollisionType.WALKABLE_HALF_SW);
        });

        it('returns undefined for unknown direction strings', () => {
            expect(collisionTypeFromWalkableHalfDirection('bad')).toBeUndefined();
        });
    });

    describe('isWalkableHalfDirectionAtLocalPosition', () => {
        it('uses y>x for southwest', () => {
            expect(isWalkableHalfDirectionAtLocalPosition('sw', 6, 10, 32)).toBe(true);
            expect(isWalkableHalfDirectionAtLocalPosition('sw', 10, 6, 32)).toBe(false);
        });

        it('uses y+x>32 for southeast', () => {
            expect(isWalkableHalfDirectionAtLocalPosition('se', 20, 20, 32)).toBe(true);
            expect(isWalkableHalfDirectionAtLocalPosition('se', 10, 10, 32)).toBe(false);
        });

        it('uses y<x for northeast — includes NE corner, excludes NW corner', () => {
            // NE corner (localX=31, localY=0): y<x → 0<31 = true
            expect(isWalkableHalfDirectionAtLocalPosition('ne', 31, 0, 32)).toBe(true);
            // NW corner (localX=0, localY=31): y<x → 31<0 = false
            expect(isWalkableHalfDirectionAtLocalPosition('ne', 0, 31, 32)).toBe(false);
        });

        it('uses y+x<32 for northwest — includes NW corner, excludes SE corner', () => {
            // NW corner (0,0): y+x = 0 < 32 = true
            expect(isWalkableHalfDirectionAtLocalPosition('nw', 0, 0, 32)).toBe(true);
            // SE corner (31,31): y+x = 62 > 32 = false
            expect(isWalkableHalfDirectionAtLocalPosition('nw', 31, 31, 32)).toBe(false);
        });
    });

    describe('isPositionWalkableInTile', () => {
        it('treats non-half collision types as fully walkable', () => {
            expect(isPositionWalkableInTile(CollisionType.WALKABLE, 40, 40, 1, 1)).toBe(true);
        });

        it('checks half-tile geometry against world position', () => {
            // Tile (1,1) spans x:[32..64), so x=58 is in its eastern half (x >= 48 centre line).
            expect(isPositionWalkableInTile(CollisionType.WALKABLE_HALF_E, 58, 40, 1, 1)).toBe(true);
            // x=38 is in the western half of tile (1,1), so WALKABLE_HALF_E should reject it.
            expect(isPositionWalkableInTile(CollisionType.WALKABLE_HALF_E, 38, 40, 1, 1)).toBe(false);
        });
    });

    describe('isBoundaryCrossingWalkable', () => {
        it('allows east-to-east vertical crossing when seam coordinate is walkable in both tiles', () => {
            expect(isBoundaryCrossingWalkable(
                CollisionType.WALKABLE_HALF_E,
                CollisionType.WALKABLE_HALF_E,
                'y',
                24,
                0,
                0,
                0,
                1,
                32
            )).toBe(true);
        });

        it('blocks east-only above west-only vertical crossing', () => {
            expect(isBoundaryCrossingWalkable(
                CollisionType.WALKABLE_HALF_E,
                CollisionType.WALKABLE_HALF_W,
                'y',
                24,
                0,
                0,
                0,
                1,
                32
            )).toBe(false);
        });
    });
});
