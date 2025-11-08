import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';


export class AllBridgesPlacedConstraint extends Constraint {
  static fromSpec(_params: { [key: string]: any }): AllBridgesPlacedConstraint {
    return new AllBridgesPlacedConstraint();
  }
  check(puzzle: BridgePuzzle): ConstraintResult {
    const violations = puzzle.bridges.filter(b => !b.start || !b.end);
    this.violations = violations;
    const ok = violations.length === 0;
    return {
      satisfied: ok,
      affectedElements: violations.map(b => b.id),
      message: ok ? undefined : `Some bridges are unplaced: ${violations.map(b => b.id).join(", ")}`
    };
  }
}
