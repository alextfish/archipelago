export interface PathPoint {
    x: number;
    y: number;
}

export type PathTraversalMode = 'loop' | 'one-way';

interface PathSegment {
    start: PathPoint;
    end: PathPoint;
    deltaX: number;
    deltaY: number;
    length: number;
    startDistance: number;
}

export type CardinalDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Path made of straight line segments.
 */
export class PathRoute {
    private readonly segments: PathSegment[];
    private readonly totalLength: number;
    private readonly traversalMode: PathTraversalMode;

    constructor(points: readonly PathPoint[], traversalMode: PathTraversalMode = 'loop') {
        if (points.length < 2) {
            throw new Error('PathRoute requires at least 2 points');
        }

        this.segments = [];
        this.traversalMode = traversalMode;
        let totalLength = 0;

        const lastIndex = traversalMode === 'loop' ? points.length : points.length - 1;
        for (let i = 0; i < lastIndex; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const deltaX = end.x - start.x;
            const deltaY = end.y - start.y;
            const length = Math.hypot(deltaX, deltaY);
            if (length === 0) continue;

            this.segments.push({
                start,
                end,
                deltaX,
                deltaY,
                length,
                startDistance: totalLength,
            });
            totalLength += length;
        }

        if (totalLength === 0) {
            throw new Error('PathRoute requires at least one non-zero segment');
        }

        this.totalLength = totalLength;
    }

    getTotalLength(): number {
        return this.totalLength;
    }

    normaliseDistance(distance: number): number {
        if (this.traversalMode === 'one-way') {
            return Math.max(0, Math.min(this.totalLength, distance));
        }
        return ((distance % this.totalLength) + this.totalLength) % this.totalLength;
    }

    getPointAt(distance: number): PathPoint {
        const { segment, offset } = this.getSegmentAt(distance);
        const t = segment.length === 0 ? 0 : offset / segment.length;
        return {
            x: segment.start.x + segment.deltaX * t,
            y: segment.start.y + segment.deltaY * t,
        };
    }

    getSegmentDeltaAt(distance: number): PathPoint {
        const { segment } = this.getSegmentAt(distance);
        return {
            x: segment.deltaX,
            y: segment.deltaY,
        };
    }

    getClosestDistance(point: PathPoint): number {
        let bestDistance = 0;
        let bestDistanceSq = Number.POSITIVE_INFINITY;

        for (const segment of this.segments) {
            const lengthSq = segment.deltaX * segment.deltaX + segment.deltaY * segment.deltaY;
            const projected =
                ((point.x - segment.start.x) * segment.deltaX + (point.y - segment.start.y) * segment.deltaY) / lengthSq;
            const t = Math.max(0, Math.min(1, projected));
            const projectedX = segment.start.x + segment.deltaX * t;
            const projectedY = segment.start.y + segment.deltaY * t;
            const distanceSq = (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2;

            if (distanceSq < bestDistanceSq) {
                bestDistanceSq = distanceSq;
                bestDistance = segment.startDistance + segment.length * t;
            }
        }

        return bestDistance;
    }

    private getSegmentAt(distance: number): { segment: PathSegment; offset: number } {
        const normalisedDistance = this.normaliseDistance(distance);

        for (const segment of this.segments) {
            const segmentEndDistance = segment.startDistance + segment.length;
            if (normalisedDistance < segmentEndDistance) {
                return {
                    segment,
                    offset: normalisedDistance - segment.startDistance,
                };
            }
        }

        const lastSegment = this.segments[this.segments.length - 1];
        return {
            segment: lastSegment,
            offset: lastSegment.length,
        };
    }
}

export class LoopPath extends PathRoute {
    constructor(points: readonly PathPoint[]) {
        super(points, 'loop');
    }
}

export function getClosestCardinalDirection(deltaX: number, deltaY: number): CardinalDirection {
    if (deltaX === 0 && deltaY === 0) {
        return 'down';
    }

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        return deltaX >= 0 ? 'right' : 'left';
    }

    return deltaY >= 0 ? 'down' : 'up';
}
