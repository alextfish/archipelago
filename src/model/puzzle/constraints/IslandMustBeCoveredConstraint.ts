import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';

/**
 * Constraint for Ruins puzzle type: Islands with a "must_be_covered" marker
 * require at least one bridge to pass directly over them.
 * 
 * This constraint checks that islands marked with "must_be_covered" have
 * at least one bridge crossing over their position.
 */
export class IslandMustBeCoveredConstraint extends Constraint {
  private islandId: string;

  constructor(islandId: string) {
    super();
    this.islandId = islandId;
  }

  static fromSpec(params: { islandId: string; [key: string]: any }): IslandMustBeCoveredConstraint {
    return new IslandMustBeCoveredConstraint(params.islandId);
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

    // Check if any bridge passes over this island's position
    const coveringBridges = puzzle.placedBridges.filter(bridge => {
      if (!bridge.start || !bridge.end) return false;

      // Check if bridge is horizontal and passes over the island
      if (bridge.start.y === bridge.end.y && bridge.start.y === island.y) {
        const minX = Math.min(bridge.start.x, bridge.end.x);
        const maxX = Math.max(bridge.start.x, bridge.end.x);
        // Island must be between the bridge endpoints (not at endpoints)
        return island.x > minX && island.x < maxX;
      }

      // Check if bridge is vertical and passes over the island
      if (bridge.start.x === bridge.end.x && bridge.start.x === island.x) {
        const minY = Math.min(bridge.start.y, bridge.end.y);
        const maxY = Math.max(bridge.start.y, bridge.end.y);
        // Island must be between the bridge endpoints (not at endpoints)
        return island.y > minY && island.y < maxY;
      }

      return false;
    });

    const ok = coveringBridges.length > 0;
    this.violations = ok ? [] : [this.islandId];

    return {
      satisfied: ok,
      affectedElements: ok ? coveringBridges.map(b => b.id) : [this.islandId],
      message: ok ? undefined : `Island ${this.islandId} at (${island.x}, ${island.y}) must be covered by a bridge`,
      glyphMessage: ok ? undefined : "no bridge over island"
    };
  }
}
