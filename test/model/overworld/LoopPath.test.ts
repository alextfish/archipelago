import { describe, expect, it } from 'vitest';
import { LoopPath, PathRoute, getClosestCardinalDirection } from '@model/overworld/LoopPath';

describe('LoopPath', () => {
    it('walks around a closed loop and wraps distances', () => {
        const path = new LoopPath([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ]);

        expect(path.getTotalLength()).toBe(40);
        expect(path.getPointAt(5)).toEqual({ x: 5, y: 0 });
        expect(path.getPointAt(15)).toEqual({ x: 10, y: 5 });
        expect(path.getPointAt(45)).toEqual({ x: 5, y: 0 });
    });

    describe('PathRoute', () => {
        it('can clamp travel along a one-way path', () => {
            const path = new PathRoute([
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 20, y: 0 },
            ], 'one-way');

            expect(path.getTotalLength()).toBe(20);
            expect(path.getPointAt(-5)).toEqual({ x: 0, y: 0 });
            expect(path.getPointAt(8)).toEqual({ x: 8, y: 0 });
            expect(path.getPointAt(25)).toEqual({ x: 20, y: 0 });
        });
    });

    it('projects a nearby point onto the closest segment', () => {
        const path = new LoopPath([
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 0, y: 20 },
        ]);

        const distance = path.getClosestDistance({ x: 12, y: 17 });

        expect(distance).toBe(48);
        expect(path.getPointAt(distance)).toEqual({ x: 12, y: 20 });
    });

    it('uses the current segment delta for direction lookup', () => {
        const path = new LoopPath([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ]);

        expect(path.getSegmentDeltaAt(2)).toEqual({ x: 10, y: 0 });
        expect(path.getSegmentDeltaAt(12)).toEqual({ x: 0, y: 10 });
        expect(path.getSegmentDeltaAt(22)).toEqual({ x: -10, y: 0 });
        expect(path.getSegmentDeltaAt(32)).toEqual({ x: 0, y: -10 });
    });
});

describe('getClosestCardinalDirection', () => {
    it('prefers horizontal when absolute deltas tie', () => {
        expect(getClosestCardinalDirection(4, 4)).toBe('right');
        expect(getClosestCardinalDirection(-4, 4)).toBe('left');
    });

    it('chooses the closest cardinal direction for diagonal movement', () => {
        expect(getClosestCardinalDirection(2, -5)).toBe('up');
        expect(getClosestCardinalDirection(-7, 3)).toBe('left');
    });
});
