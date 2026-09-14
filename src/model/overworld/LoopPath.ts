export interface PathPoint {
    x: number;
    y: number;
}

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
 * Closed loop path made of straight line segments.
 */
export class LoopPath {
    private readonly segments: PathSegment[];
    private readonly totalLength: number;

    constructor(points: readonly PathPoint[]) {
        if (points.length < 2) {
            throw new Error('LoopPath requires at least 2 points');
        }

        this.segments = [];
        let totalLength = 0;

        for (let i = 0; i < points.length; i++) {
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
            throw new Error('LoopPath requires at least one non-zero segment');
        }

        this.totalLength = totalLength;
    }

    getTotalLength(): number {
        return this.totalLength;
    }

    wrapDistance(distance: number): number {
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
        const wrappedDistance = this.wrapDistance(distance);

        for (const segment of this.segments) {
            const segmentEndDistance = segment.startDistance + segment.length;
            if (wrappedDistance < segmentEndDistance) {
                return {
                    segment,
                    offset: wrappedDistance - segment.startDistance,
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

export function getClosestCardinalDirection(deltaX: number, deltaY: number): CardinalDirection {
    if (deltaX === 0 && deltaY === 0) {
        return 'down';
    }

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        return deltaX >= 0 ? 'right' : 'left';
    }

    return deltaY >= 0 ? 'down' : 'up';
}
