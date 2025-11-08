import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';

// Each island’s local bridge-count constraint must be satisfied

export class IslandBridgeCountConstraint extends Constraint {
  check(puzzle: BridgePuzzle): ConstraintResult {
    const violations: string[] = [];

    for (const island of puzzle.islands) {
      const rule = island.constraints?.find(c => c.startsWith("num_bridges="));
      if (!rule) continue;

      const expected = Number(rule.split("=")[1]);
      const actual = puzzle.bridgesFromIsland(island).length;
      if (actual !== expected) violations.push(island.id);
    }

    return {
      satisfied: violations.length === 0,
      affectedElements: violations,
      message: violations.length ? `Incorrect bridge count: ${violations.join(", ")}` : undefined
    };
  }
}
