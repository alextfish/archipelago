import type { BridgePuzzle } from '../BridgePuzzle';
import type { ConstraintResult } from './ConstraintResult';

export abstract class Constraint {
  abstract check(puzzle: BridgePuzzle): ConstraintResult;
  id: string | undefined;
  description: string | undefined;
  violations?: any[];
}

