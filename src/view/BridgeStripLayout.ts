import { BridgeSpriteFrames } from './BridgeSpriteFrameRegistry';
import { normalizeRenderOrder, orientationForDelta, type Orientation } from './PuzzleRenderer';

export interface BridgeStripSegment {
    readonly frame: number;
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
}

export interface BridgeStripLayout {
    readonly orientation: Orientation;
    readonly isDouble: boolean;
    readonly centreX: number;
    readonly centreY: number;
    readonly depthY: number;
    readonly angle: number;
    readonly worldLength: number;
    readonly segmentCount: number;
    readonly width: number;
    readonly height: number;
    readonly segments: BridgeStripSegment[];
}

export function buildBridgeStripLayout(params: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    cellSize: number;
    isDouble: boolean;
    useEdges?: boolean;
    gridToWorld: (gridX: number, gridY: number) => { x: number; y: number };
}): BridgeStripLayout {
    const { start, end, cellSize, isDouble, useEdges = false, gridToWorld } = params;
    const ordered = normalizeRenderOrder(start, end);
    const startGrid = ordered.start;
    const endGrid = ordered.end;
    const startWorld = gridToWorld(startGrid.x, startGrid.y);
    const endWorld = gridToWorld(endGrid.x, endGrid.y);
    const worldLength = Math.sqrt((endWorld.x - startWorld.x) ** 2 + (endWorld.y - startWorld.y) ** 2);
    const dxGrid = endGrid.x - startGrid.x;
    const dyGrid = endGrid.y - startGrid.y;
    const gridDist = Math.sqrt(dxGrid * dxGrid + dyGrid * dyGrid);
    const segmentCount = Math.max(1, Math.ceil(gridDist - 0.01));
    const worldStep = {
        x: (endWorld.x - startWorld.x) / segmentCount,
        y: (endWorld.y - startWorld.y) / segmentCount,
    };
    const angle = Math.atan2(endWorld.y - startWorld.y, endWorld.x - startWorld.x);
    const spacing = Math.sqrt(worldStep.x * worldStep.x + worldStep.y * worldStep.y);
    const orientation = orientationForDelta(startGrid, endGrid);
    const centreX = (startWorld.x + endWorld.x) / 2 + cellSize / 2;
    const centreY = (startWorld.y + endWorld.y) / 2 + cellSize / 2;
    const depthY = Math.max(startWorld.y, endWorld.y) + cellSize;
    const centreIndexOffset = (segmentCount - 1) / 2;

    const chooseFrame = (segmentIndex: number): number => {
        const baseFrame = (() => {
            if (!useEdges) return orientation === 'horizontal' ? BridgeSpriteFrames.H_BRIDGE_CENTRE : BridgeSpriteFrames.V_BRIDGE_MIDDLE;
            if (orientation === 'horizontal') {
                if (segmentIndex === 0 && segmentCount === 1) return BridgeSpriteFrames.H_BRIDGE_SINGLE;
                if (segmentIndex === 0) return BridgeSpriteFrames.H_BRIDGE_LEFT;
                if (segmentIndex === segmentCount - 1) return BridgeSpriteFrames.H_BRIDGE_RIGHT;
                return BridgeSpriteFrames.H_BRIDGE_CENTRE;
            }

            if (segmentIndex === 0 && segmentCount === 1) return BridgeSpriteFrames.V_BRIDGE_SINGLE;
            if (segmentIndex === 0) return BridgeSpriteFrames.V_BRIDGE_BOTTOM;
            if (segmentIndex === segmentCount - 1) return BridgeSpriteFrames.V_BRIDGE_TOP;
            return BridgeSpriteFrames.V_BRIDGE_MIDDLE;
        })();

        return isDouble ? baseFrame + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET : baseFrame;
    };

    const segments: BridgeStripSegment[] = [];
    for (let i = 0; i < segmentCount; i++) {
        segments.push({
            frame: chooseFrame(i),
            x: (i - centreIndexOffset) * spacing,
            y: 0,
            rotation: orientation === 'horizontal' ? 0 : Math.PI / 2,
        });
    }

    return {
        orientation,
        isDouble,
        centreX,
        centreY,
        depthY,
        angle,
        worldLength,
        segmentCount,
        width: orientation === 'horizontal' ? segmentCount * cellSize : cellSize,
        height: orientation === 'horizontal' ? cellSize : segmentCount * cellSize,
        segments,
    };
}