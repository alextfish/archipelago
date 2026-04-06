import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';
import type { ConstraintDisplayItem } from './ConstraintDisplayItem';
import { StrutBridge } from '../StrutBridge';

/**
 * Constraint for Ruins puzzle type: Bridges with mustCoverIsland=true
 * must pass over at least one island.
 *
 * When constructed with a `bridgeID`, only that specific bridge is checked
 * and `getDisplayItems()` returns a display item for it, positioned at its
 * strut location.  Without a bridgeID the constraint checks all placed
 * bridges with `mustCoverIsland=true` (legacy / spec-driven behaviour).
 */
export class BridgeMustCoverIslandConstraint extends Constraint {
  private readonly bridgeID?: string;

  constructor(bridgeID?: string) {
    super();
    this.bridgeID = bridgeID;
  }

  static fromSpec(_params: { [key: string]: any }): BridgeMustCoverIslandConstraint {
    return new BridgeMustCoverIslandConstraint();
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    const violations: string[] = [];

    const bridgesToCheck = this.bridgeID
      ? puzzle.placedBridges.filter(b => b.id === this.bridgeID)
      : puzzle.placedBridges.filter(b => b.type.mustCoverIsland);

    // Check all placed bridges
    for (const bridge of bridgesToCheck) {
      if (!bridge.start || !bridge.end) continue;

      // Check if bridge passes over any island
      const coversIsland = this.bridgeCoversAnyIsland(puzzle, bridge as { start: { x: number; y: number }; end: { x: number; y: number } });

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
      glyphMessage: ok ? undefined : "no island under bridge"
    };
  }

  override getDisplayItems(puzzle: BridgePuzzle): ConstraintDisplayItem[] {
    if (!this.bridgeID) return [];

    const bridge = puzzle.bridges.find(b => b.id === this.bridgeID);
    if (!bridge || !bridge.start || !bridge.end) return [];
    if (!(bridge instanceof StrutBridge)) return [];

    const strutLocation = bridge.getStrutLocation(puzzle);
    if (!strutLocation) return [];

    const coversIsland = this.bridgeCoversAnyIsland(puzzle, bridge as { start: { x: number; y: number }; end: { x: number; y: number } });
    const glyphMessage = coversIsland ? 'good' : 'no island under bridge';

    return [{
      elementID: bridge.id,
      glyphMessage,
      constraintType: 'BridgeMustCoverIslandConstraint',
      position: strutLocation,
    }];
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
