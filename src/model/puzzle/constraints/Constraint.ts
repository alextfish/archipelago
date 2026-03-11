import type { BridgePuzzle } from '../BridgePuzzle';
import type { ConstraintResult } from './ConstraintResult';
import type { ConstraintDisplayItem } from './ConstraintDisplayItem';

export abstract class Constraint {
  abstract check(puzzle: BridgePuzzle): ConstraintResult;
  id: string | undefined;
  description: string | undefined;
  violations?: any[];

  /**
   * Returns display items for this constraint — one per constrained element.
   * Each item carries the glyph message ("good" when satisfied, violation message
   * otherwise) to be shown in a small speech bubble next to the element.
   * Constraints that have no per-element display return an empty array (the default).
   */
  getDisplayItems(_puzzle: BridgePuzzle): ConstraintDisplayItem[] {
    return [];
  }
}

