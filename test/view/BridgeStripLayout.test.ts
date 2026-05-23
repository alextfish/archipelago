import { describe, expect, it } from 'vitest';
import { buildBridgeStripLayout } from '@view/BridgeStripLayout';

describe('buildBridgeStripLayout', () => {
    const cellSize = 32;
    const gridToWorld = (gridX: number, gridY: number) => ({
        x: gridX * cellSize,
        y: gridY * cellSize,
    });

    it('builds the same horizontal strip geometry used by the live puzzle renderer', () => {
        const layout = buildBridgeStripLayout({
            start: { x: 1, y: 3 },
            end: { x: 5, y: 3 },
            cellSize,
            isDouble: false,
            useEdges: true,
            gridToWorld,
        });

        expect(layout.orientation).toBe('horizontal');
        expect(layout.segmentCount).toBe(4);
        expect(layout.width).toBe(128);
        expect(layout.height).toBe(32);
        expect(layout.centreX).toBe(112);
        expect(layout.centreY).toBe(112);
        expect(layout.depthY).toBe(128);
        expect(layout.segments.map(segment => segment.x)).toEqual([-48, -16, 16, 48]);
    });

    it('normalises vertical spans and sorts them by the lower tile for depth ordering', () => {
        const layout = buildBridgeStripLayout({
            start: { x: 3, y: 1 },
            end: { x: 3, y: 5 },
            cellSize,
            isDouble: true,
            useEdges: true,
            gridToWorld,
        });

        expect(layout.orientation).toBe('vertical');
        expect(layout.isDouble).toBe(true);
        expect(layout.segmentCount).toBe(4);
        expect(layout.width).toBe(32);
        expect(layout.height).toBe(128);
        expect(layout.depthY).toBe(192);
        expect(layout.segments.every(segment => segment.rotation === Math.PI / 2)).toBe(true);
    });
});