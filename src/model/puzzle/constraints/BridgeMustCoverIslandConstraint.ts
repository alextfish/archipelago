import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';

/**
 * Constraint for Ruins puzzle type: Bridges with mustCoverIsland=true
 * must pass over at least one island.
 */
export class BridgeMustCoverIslandConstraint extends Constraint {
  static fromSpec(_params: { [key: string]: any }): BridgeMustCoverIslandConstraint {
    return new BridgeMustCoverIslandConstraint();
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    const violations: string[] = [];

    // Check all placed bridges
    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      
      // Only check bridges with mustCoverIsland attribute
      if (!bridge.type.mustCoverIsland) continue;

      // Check if bridge passes over any island
      const coversIsland = this.bridgeCoversAnyIsland(puzzle, bridge);
      
      if (!coversIsland) {
        violations.push(bridge.id);
      }
    }

    const ok = violations.length === 0;
    this.violations = violations;

    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? undefined : 
        `Bridge${violations.length === 1 ? '' : 's'} must cover island${violations.length === 1 ? '' : 's'}: ${violations.join(", ")}`,
      glyphMessage: ok ? undefined : "not island under bridge"
    };
  }

  private bridgeCoversAnyIsland(
    puzzle: BridgePuzzle,
    bridge: { start: { x: number; y: number }; end: { x: number; y: number } }
  ): boolean {
    const { start, end } = bridge;

    // Check if any island is covered by this bridge
    for (const island of puzzle.islands) {
      // Check if bridge is horizontal and passes over the island
      if (start.y === end.y && start.y === island.y) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        // Island must be between the bridge endpoints (not at endpoints)
        if (island.x > minX && island.x < maxX) {
          return true;
        }
      }

      // Check if bridge is vertical and passes over the island
      if (start.x === end.x && start.x === island.x) {
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        // Island must be between the bridge endpoints (not at endpoints)
        if (island.y > minY && island.y < maxY) {
          return true;
        }
      }
    }

    return false;
  }
}
