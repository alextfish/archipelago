import type { BridgePuzzle } from '../BridgePuzzle';
import type { ConstraintResult } from './ConstraintResult';
import type { ConstraintDisplayItem } from './ConstraintDisplayItem';

export abstract class Constraint {
  abstract check(puzzle: BridgePuzzle): ConstraintResult;
  id: string | undefined;
  description: string | undefined;
  violations?: any[];

  /**
   * Whether this constraint is "personified" — i.e. it has an NPC that
   * represents it in the world. Most constraints are personified. Non-personified
   * constraints (e.g. AllBridgesPlacedConstraint, BridgeLengthConstraint,
   * NoCrossingConstraint) don't need NPC glyph lists or conversation files.
   */
  readonly personified: boolean = true;

  /**
   * Path (relative to resources/conversations/) to the conversation JSON file
   * shown when this constraint is unsatisfied.
   */
  readonly conversationFile?: string;

  /**
   * Path (relative to resources/conversations/) to the conversation JSON file
   * shown when this constraint is satisfied.
   */
  readonly conversationFileSolved?: string;

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

