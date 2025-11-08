// view/PuzzleRenderer.ts
import type { BridgeType } from "@model/puzzle/BridgeType";
import type { BridgePuzzle } from "../model/puzzle/BridgePuzzle";

export interface PuzzleRenderer {
  /** Called once when session begins to let renderer create sprites. */
  init(puzzle: BridgePuzzle): void;
  /** Redraw everything from puzzle state; idempotent. */
  updateFromPuzzle(puzzle: BridgePuzzle): void;
  highlightPreviewStart(x: number, y: number): void;
  highlightPreviewSegment(start: {x:number,y:number}, end: {x:number,y:number}): void;

  /** Show which bridge type is selected in sidebar, counts, etc. */
  setAvailableBridgeTypes(types: BridgeType[]): void;
  setSelectedBridgeType(type: BridgeType | null): void;

  highlightViolations(ids: string[]): void;
  flashInvalidPlacement(start: { x: number; y: number }, end: { x: number; y: number }): void;
  clearHighlights(): void;
  /** Per-frame update if needed for animations. */
  update(dt: number): void;
  /** Tear down (remove sprites) */
  destroy(): void;
}

/**
 * Orientation type for bridge rendering helpers.
 */
export type Orientation = 'horizontal' | 'vertical';

/**
 * Returns the number of centre tiles between two grid-aligned cells.
 * This is a pure, non-Phaser helper useful for tiling bridge sprites.
 *
 * Behaviour:
 * - Uses Euclidean distance between the two grid coordinates (assumed to be in grid units).
 * - Rounds the distance to the nearest integer number of cells, then subtracts 1
 *   to exclude the two island cells themselves.
 * - Clamps to zero for adjacent or identical positions.
 */
export function tileCountBetween(start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const rounded = Math.max(0, Math.round(dist));
  return Math.max(0, rounded - 1);
}

/**
 * Choose whether to render a bridge using horizontal or vertical tile set based on
 * the delta between two grid cells. This is intentionally simple:
 * - If |dx| >= |dy| => 'horizontal', else 'vertical'.
 * This produces a natural behaviour where near-horizontal angles use the horizontal
 * sprites and near-vertical angles use the vertical sprites.
 */
export function orientationForDelta(start: { x: number; y: number }, end: { x: number; y: number }): Orientation {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx >= dy ? 'horizontal' : 'vertical';
}

/**
 * Returns true when two grid positions are exactly orthogonal (same x or same y).
 */
export function isOrthogonal(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  return start.x === end.x || start.y === end.y;
}

/**
 * For rendering only: ensure the returned pair has a start that is either
 * - left-most when the orientation is horizontal, or
 * - lower (greater y) when the orientation is vertical.
 *
 * This function does not modify model data; it only returns reordered copies
 * suitable for feeding to tiled rendering code that expects a canonical start
 * position.
 */
export function normalizeRenderOrder(start: { x: number; y: number }, end: { x: number; y: number }): { start: { x: number; y: number }, end: { x: number; y: number } } {
  const orient = orientationForDelta(start, end);
  if (orient === 'horizontal') {
    // left-most should be start
    if (start.x <= end.x) return { start, end };
    return { start: { x: end.x, y: end.y }, end: { x: start.x, y: start.y } };
  } else {
    // vertical: lower (greater y) should be start
    if (start.y >= end.y) return { start, end };
    return { start: { x: end.x, y: end.y }, end: { x: start.x, y: start.y } };
  }
}


  function getBridgeColour(colour?: string): number {
    // Convert colour name to hex colour
    switch (colour?.toLowerCase()) {
      case 'black': return 0x000000;
      case 'red': return 0xff0000;
      case 'blue': return 0x0000ff;
      case 'yellow': return 0xffff00;
      case 'green': return 0x00ff00;
      default: return 0x000000;
    }
  }

