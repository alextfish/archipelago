import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';
import type { Island } from '../Island';

/**
 * Constraint for Meadows puzzle type: Islands may specify the total number
 * of other islands visible along bridges in straight lines from all four directions.
 * 
 * An island is "visible" from the constrained island if:
 * 1. There is a bridge connecting them directly, OR
 * 2. They are aligned (horizontally or vertically) and there is a path of bridges
 *    connecting them with no gaps
 */
export class IslandVisibilityConstraint extends Constraint {
  private islandId: string;
  private expectedCount: number;

  constructor(islandId: string, expectedCount: number) {
    super();
    this.islandId = islandId;
    this.expectedCount = expectedCount;
  }

  static fromSpec(params: { 
    islandId: string; 
    count: number;
    [key: string]: any 
  }): IslandVisibilityConstraint {
    return new IslandVisibilityConstraint(params.islandId, params.count);
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

    const visibleIslands = this.countVisibleIslands(puzzle, island);
    const actualCount = visibleIslands.size;
    const ok = actualCount === this.expectedCount;

    this.violations = ok ? [] : [this.islandId];

    return {
      satisfied: ok,
      affectedElements: ok ? Array.from(visibleIslands) : [this.islandId, ...Array.from(visibleIslands)],
      message: ok ? undefined : 
        `Island ${this.islandId} requires ${this.expectedCount} visible islands, but has ${actualCount}`
    };
  }

  private countVisibleIslands(puzzle: BridgePuzzle, sourceIsland: Island): Set<string> {
    const visibleIslands = new Set<string>();
    
    // Check all four directions: up, down, left, right
    const directions = [
      { dx: 0, dy: -1, name: 'up' },
      { dx: 0, dy: 1, name: 'down' },
      { dx: -1, dy: 0, name: 'left' },
      { dx: 1, dy: 0, name: 'right' }
    ];

    for (const dir of directions) {
      const islandsInDirection = this.findVisibleIslandsInDirection(
        puzzle, 
        sourceIsland, 
        dir.dx, 
        dir.dy
      );
      islandsInDirection.forEach(id => visibleIslands.add(id));
    }

    return visibleIslands;
  }

  private findVisibleIslandsInDirection(
    puzzle: BridgePuzzle,
    sourceIsland: Island,
    dx: number,
    dy: number
  ): Set<string> {
    const visible = new Set<string>();
    let currentX = sourceIsland.x;
    let currentY = sourceIsland.y;
    let previousIsland = sourceIsland;

    // Keep stepping in the direction until we hit the bounds
    while (true) {
      // Step in the direction
      currentX += dx;
      currentY += dy;

      // Check bounds
      if (currentX <= 0 || currentX >= puzzle.width || currentY <= 0 || currentY >= puzzle.height) {
        break;
      }

      // Find island at current position
      const islandAtPosition = puzzle.islands.find(i => i.x === currentX && i.y === currentY);
      
      if (!islandAtPosition) {
        // No island at this position, continue stepping
        continue;
      }

      // Found an island - check if there's a bridge connecting to previous island
      const bridgeExists = this.hasBridgeBetween(puzzle, previousIsland, islandAtPosition);
      
      if (!bridgeExists) {
        // No bridge connection, stop searching in this direction
        break;
      }

      // This island is visible
      if (islandAtPosition.id !== sourceIsland.id) {
        visible.add(islandAtPosition.id);
      }

      // Move to this island and continue
      previousIsland = islandAtPosition;
    }

    return visible;
  }

  private hasBridgeBetween(puzzle: BridgePuzzle, island1: Island, island2: Island): boolean {
    return puzzle.placedBridges.some(bridge => {
      if (!bridge.start || !bridge.end) return false;

      const connects1to2 = 
        (bridge.start.x === island1.x && bridge.start.y === island1.y &&
         bridge.end.x === island2.x && bridge.end.y === island2.y);

      const connects2to1 = 
        (bridge.start.x === island2.x && bridge.start.y === island2.y &&
         bridge.end.x === island1.x && bridge.end.y === island1.y);

      return connects1to2 || connects2to1;
    });
  }
}
