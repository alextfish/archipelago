import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';

/**
 * Constraint for Farmlands puzzle type: Empty grid cells may have markers (N dots)
 * indicating they must be in an enclosed area of exactly size N, bounded by bridges
 * on all sides.
 * 
 * Special case: N=0 means the cell must either be covered by a bridge OR be open
 * to the outside (not in a fully enclosed area).
 */
export class EnclosedAreaSizeConstraint extends Constraint {
  private x: number;
  private y: number;
  private expectedSize: number;

  constructor(x: number, y: number, expectedSize: number) {
    super();
    this.x = x;
    this.y = y;
    this.expectedSize = expectedSize;
  }

  static fromSpec(params: { 
    x: number; 
    y: number; 
    size: number;
    [key: string]: any 
  }): EnclosedAreaSizeConstraint {
    return new EnclosedAreaSizeConstraint(params.x, params.y, params.size);
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    // Check if cell is covered by a bridge
    const isCovered = this.isCellCoveredByBridge(puzzle, this.x, this.y);

    if (this.expectedSize === 0) {
      // Special case: must be covered OR open to outside
      if (isCovered) {
        return {
          satisfied: true,
          affectedElements: [],
          message: undefined
        };
      }

      // Check if open to outside
      const areaInfo = this.getEnclosedAreaSize(puzzle, this.x, this.y);
      const ok = !areaInfo.isEnclosed;

      this.violations = ok ? [] : [`${this.x},${this.y}`];

      return {
        satisfied: ok,
        affectedElements: ok ? [] : [`${this.x},${this.y}`],
        message: ok ? undefined : 
          `Cell (${this.x}, ${this.y}) with size=0 must be covered by a bridge or open to outside, but is in an enclosed area`
      };
    }

    // Normal case: must be in enclosed area of specific size
    if (isCovered) {
      // Cell is covered by a bridge, cannot be in an empty area
      this.violations = [`${this.x},${this.y}`];
      return {
        satisfied: false,
        affectedElements: [`${this.x},${this.y}`],
        message: `Cell (${this.x}, ${this.y}) is covered by a bridge but should be in an enclosed area of size ${this.expectedSize}`
      };
    }

    const areaInfo = this.getEnclosedAreaSize(puzzle, this.x, this.y);
    const ok = areaInfo.isEnclosed && areaInfo.size === this.expectedSize;

    this.violations = ok ? [] : [`${this.x},${this.y}`];

    return {
      satisfied: ok,
      affectedElements: ok ? areaInfo.cells : [`${this.x},${this.y}`, ...areaInfo.cells],
      message: ok ? undefined : 
        areaInfo.isEnclosed 
          ? `Cell (${this.x}, ${this.y}) is in an enclosed area of size ${areaInfo.size}, but requires size ${this.expectedSize}`
          : `Cell (${this.x}, ${this.y}) is not in a fully enclosed area (requires size ${this.expectedSize})`
    };
  }

  private isCellCoveredByBridge(puzzle: BridgePuzzle, x: number, y: number): boolean {
    return puzzle.placedBridges.some(bridge => {
      if (!bridge.start || !bridge.end) return false;

      // Check horizontal bridge
      if (bridge.start.y === bridge.end.y && bridge.start.y === y) {
        const minX = Math.min(bridge.start.x, bridge.end.x);
        const maxX = Math.max(bridge.start.x, bridge.end.x);
        return x >= minX && x <= maxX;
      }

      // Check vertical bridge
      if (bridge.start.x === bridge.end.x && bridge.start.x === x) {
        const minY = Math.min(bridge.start.y, bridge.end.y);
        const maxY = Math.max(bridge.start.y, bridge.end.y);
        return y >= minY && y <= maxY;
      }

      return false;
    });
  }

  private getEnclosedAreaSize(
    puzzle: BridgePuzzle, 
    startX: number, 
    startY: number
  ): { size: number; isEnclosed: boolean; cells: string[] } {
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
    const cellKey = (x: number, y: number) => `${x},${y}`;
    
    visited.add(cellKey(startX, startY));
    let isEnclosed = true;
    const cells: string[] = [];

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      cells.push(cellKey(x, y));

      // Check if we've reached the boundary of the puzzle
      if (x <= 0 || x >= puzzle.width || y <= 0 || y >= puzzle.height) {
        isEnclosed = false;
      }

      // Try to expand in all four directions
      const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 }   // right
      ];

      for (const { dx, dy } of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const key = cellKey(nx, ny);

        if (visited.has(key)) continue;

        // Check if there's a bridge blocking this direction
        const isBlocked = this.isBridgeBlocking(puzzle, x, y, nx, ny);
        
        if (isBlocked) continue;

        // Check if the next cell is an island
        const isIsland = puzzle.islands.some(i => i.x === nx && i.y === ny);
        
        if (isIsland) continue;

        // Check if the next cell is covered by a bridge
        const isCovered = this.isCellCoveredByBridge(puzzle, nx, ny);
        
        if (isCovered) continue;

        // Add to queue
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }

    return { size: cells.length, isEnclosed, cells };
  }

  private isBridgeBlocking(
    puzzle: BridgePuzzle,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): boolean {
    // Check if there's a bridge between these two cells
    const dx = toX - fromX;
    const dy = toY - fromY;

    return puzzle.placedBridges.some(bridge => {
      if (!bridge.start || !bridge.end) return false;

      if (dx !== 0) {
        // Moving horizontally, check for vertical bridges
        if (bridge.start.x !== bridge.end.x) return false; // Not vertical
        
        const bridgeX = bridge.start.x;
        const minY = Math.min(bridge.start.y, bridge.end.y);
        const maxY = Math.max(bridge.start.y, bridge.end.y);

        // Bridge is between the cells if it's on the boundary
        const boundary = dx > 0 ? toX : fromX;
        return bridgeX === boundary && fromY >= minY && fromY <= maxY;
      } else {
        // Moving vertically, check for horizontal bridges
        if (bridge.start.y !== bridge.end.y) return false; // Not horizontal
        
        const bridgeY = bridge.start.y;
        const minX = Math.min(bridge.start.x, bridge.end.x);
        const maxX = Math.max(bridge.start.x, bridge.end.x);

        // Bridge is between the cells if it's on the boundary
        const boundary = dy > 0 ? toY : fromY;
        return bridgeY === boundary && fromX >= minX && fromX <= maxX;
      }
    });
  }
}
