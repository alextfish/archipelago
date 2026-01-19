import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';
import type { Island } from '../Island';
import type { Bridge } from '../Bridge';

/**
 * Constraint for Swamp puzzle type: Islands may require or forbid having
 * two bridges in the same direction (double bridges).
 * 
 * Positive constraint variants:
 * - "double_horizontal": requires exactly 2 bridges in same direction (left OR right) OR one left AND one right
 * - "double_vertical": requires exactly 2 bridges in same direction (up OR down) OR one up AND one down
 * - "double_any_direction": requires 2 bridges in any single direction
 * 
 * Negative constraint variants:
 * - "no_double_any_direction": must NOT have 2 bridges in any single direction
 *   (but can be unconnected, singly connected, or have mixed connections)
 */
export class IslandDirectionalBridgeConstraint extends Constraint {
  private islandId: string;
  private constraintType: 'double_horizontal' | 'double_vertical' | 'double_any_direction' | 'no_double_any_direction';

  constructor(islandId: string, constraintType: string) {
    super();
    this.islandId = islandId;
    this.constraintType = constraintType as any;
  }

  static fromSpec(params: { 
    islandId: string; 
    constraintType: string;
    [key: string]: any 
  }): IslandDirectionalBridgeConstraint {
    return new IslandDirectionalBridgeConstraint(params.islandId, params.constraintType);
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

    const bridges = puzzle.bridgesFromIsland(island);
    const counts = this.countBridgesByDirection(island, bridges);

    let ok = false;
    let message: string | undefined;

    switch (this.constraintType) {
      case 'double_horizontal':
        ok = counts.left === 2 || counts.right === 2 || (counts.left === 1 && counts.right === 1);
        if (!ok) {
          message = `Island ${this.islandId} requires 2 bridges in same horizontal direction OR one left and one right (left: ${counts.left}, right: ${counts.right})`;
        }
        break;

      case 'double_vertical':
        ok = counts.up === 2 || counts.down === 2 || (counts.up === 1 && counts.down === 1);
        if (!ok) {
          message = `Island ${this.islandId} requires 2 bridges in same vertical direction OR one up and one down (up: ${counts.up}, down: ${counts.down})`;
        }
        break;

      case 'double_any_direction':
        ok = counts.left === 2 || counts.right === 2 || counts.up === 2 || counts.down === 2;
        if (!ok) {
          message = `Island ${this.islandId} requires 2 bridges in any single direction (left: ${counts.left}, right: ${counts.right}, up: ${counts.up}, down: ${counts.down})`;
        }
        break;

      case 'no_double_any_direction':
        ok = counts.left !== 2 && counts.right !== 2 && counts.up !== 2 && counts.down !== 2;
        if (!ok) {
          message = `Island ${this.islandId} must NOT have 2 bridges in any single direction (left: ${counts.left}, right: ${counts.right}, up: ${counts.up}, down: ${counts.down})`;
        }
        break;

      default:
        return {
          satisfied: false,
          affectedElements: [],
          message: `Unknown constraint type: ${this.constraintType}`
        };
    }

    this.violations = ok ? [] : [this.islandId];

    return {
      satisfied: ok,
      affectedElements: ok ? [] : [this.islandId, ...bridges.map(b => b.id)],
      message
    };
  }

  private countBridgesByDirection(island: Island, bridges: Bridge[]): {
    left: number;
    right: number;
    up: number;
    down: number;
  } {
    const counts = { left: 0, right: 0, up: 0, down: 0 };

    for (const bridge of bridges) {
      if (!bridge.start || !bridge.end) continue;

      // Determine which end is the island
      const isStart = bridge.start.x === island.x && bridge.start.y === island.y;
      const isEnd = bridge.end.x === island.x && bridge.end.y === island.y;

      if (!isStart && !isEnd) continue;

      const otherEnd = isStart ? bridge.end : bridge.start;

      // Determine direction
      if (otherEnd.x < island.x) {
        counts.left++;
      } else if (otherEnd.x > island.x) {
        counts.right++;
      } else if (otherEnd.y < island.y) {
        counts.up++;
      } else if (otherEnd.y > island.y) {
        counts.down++;
      }
    }

    return counts;
  }
}
