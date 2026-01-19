import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';
import type { Island } from '../Island';

/**
 * Constraint for Meadows puzzle type: Islands may specify a count of bridges
 * that pass directly above, below, left, or right of them (not connected to them).
 * 
 * Direction variants:
 * - "above": count bridges passing horizontally at any distance above the island
 * - "below": count bridges passing horizontally at any distance below the island
 * - "left": count bridges passing vertically at any distance to the left of the island
 * - "right": count bridges passing vertically at any distance to the right of the island
 * - "adjacent": total count of bridges passing directly adjacent (one cell away) in any direction
 */
export class IslandPassingBridgeCountConstraint extends Constraint {
  private islandId: string;
  private direction: 'above' | 'below' | 'left' | 'right' | 'adjacent';
  private expectedCount: number;

  constructor(islandId: string, direction: string, expectedCount: number) {
    super();
    this.islandId = islandId;
    this.direction = direction as any;
    this.expectedCount = expectedCount;
  }

  static fromSpec(params: { 
    islandId: string; 
    direction: string;
    count: number;
    [key: string]: any 
  }): IslandPassingBridgeCountConstraint {
    return new IslandPassingBridgeCountConstraint(params.islandId, params.direction, params.count);
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    const island = puzzle.islands.find(i => i.id === this.islandId);
    if (!island) {
      return {
        satisfied: false,
        affectedElements: [],
        message: `Island ${this.islandId} not found`
      };
    }

    const passingBridges = this.findPassingBridges(puzzle, island);
    const actualCount = passingBridges.length;
    const ok = actualCount === this.expectedCount;

    this.violations = ok ? [] : [this.islandId];

    return {
      satisfied: ok,
      affectedElements: ok ? passingBridges.map(b => b.id) : [this.islandId, ...passingBridges.map(b => b.id)],
      message: ok ? undefined : 
        `Island ${this.islandId} requires ${this.expectedCount} bridges passing ${this.direction}, but has ${actualCount}`
    };
  }

  private findPassingBridges(puzzle: BridgePuzzle, island: Island) {
    const bridges = [];

    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;

      // Skip bridges connected to this island
      const connectedToIsland = 
        (bridge.start.x === island.x && bridge.start.y === island.y) ||
        (bridge.end.x === island.x && bridge.end.y === island.y);
      
      if (connectedToIsland) continue;

      const passes = this.bridgePassesInDirection(
        bridge as { start: { x: number; y: number }; end: { x: number; y: number } }, 
        island
      );
      if (passes) {
        bridges.push(bridge);
      }
    }

    return bridges;
  }

  private bridgePassesInDirection(
    bridge: { start: { x: number; y: number }; end: { x: number; y: number } },
    island: Island
  ): boolean {
    const { start, end } = bridge;

    // Horizontal bridge (constant y)
    if (start.y === end.y) {
      const bridgeY = start.y;
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);

      // Check if island is within x-range (strictly between endpoints)
      if (island.x < minX || island.x > maxX) return false;

      // Check direction
      switch (this.direction) {
        case 'above':
          return bridgeY < island.y; // Any bridge above the island
        case 'below':
          return bridgeY > island.y; // Any bridge below the island
        case 'adjacent':
          return bridgeY === island.y - 1 || bridgeY === island.y + 1; // One cell away
        default:
          return false;
      }
    }

    // Vertical bridge (constant x)
    if (start.x === end.x) {
      const bridgeX = start.x;
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);

      // Check if island is within y-range (strictly between endpoints)
      if (island.y < minY || island.y > maxY) return false;

      // Check direction
      switch (this.direction) {
        case 'left':
          return bridgeX < island.x; // Any bridge to the left of the island
        case 'right':
          return bridgeX > island.x; // Any bridge to the right of the island
        case 'adjacent':
          return bridgeX === island.x - 1 || bridgeX === island.x + 1; // One cell away
        default:
          return false;
      }
    }

    return false;
  }
}
