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
   * Returns the core display items for this constraint — one per constrained element.
   * Each item carries the glyph message ("good" when satisfied, violation message
   * otherwise) to be shown in a small speech bubble next to the element.
   * Constraints that have no per-element display return an empty array (the default).
   *
   * Subclasses override this method rather than {@link getDisplayItems}.
   * Disguise overrides from island constraint strings are applied automatically by
   * {@link getDisplayItems} after this method returns.
   */
  protected getCoreDisplayItems(_puzzle: BridgePuzzle): ConstraintDisplayItem[] {
    return [];
  }

  /**
   * Returns display items for this constraint, enriched with any disguise properties
   * declared on the corresponding islands in the Tiled map
   * (`disguise_sprite`, `disguise_sprite_solved`, `conversation_file`,
   * `conversation_file_solved`).
   *
   * Subclasses should override {@link getCoreDisplayItems}, not this method.
   */
  getDisplayItems(puzzle: BridgePuzzle): ConstraintDisplayItem[] {
    const items = this.getCoreDisplayItems(puzzle);
    return items.map(item => {
      const island = puzzle.islands.find(i => i.id === item.elementID);
      if (!island?.constraints) return item;

      const get = (prefix: string): string | undefined =>
        island.constraints!.find(c => c.startsWith(`${prefix}=`))?.substring(prefix.length + 1);

      const disguiseSpriteKey = get('disguise_sprite');
      const disguiseSpriteSolvedKey = get('disguise_sprite_solved');
      const conversationFile = get('conversation_file');
      const conversationFileSolved = get('conversation_file_solved');
      const animate = island.constraints!.includes('animate=true') || undefined;

      const hasOverride = [disguiseSpriteKey, disguiseSpriteSolvedKey, conversationFile, conversationFileSolved, animate]
        .some(v => v !== undefined);
      if (!hasOverride) return item;

      return {
        ...item,
        ...(disguiseSpriteKey !== undefined && { disguiseSpriteKey }),
        ...(disguiseSpriteSolvedKey !== undefined && { disguiseSpriteSolvedKey }),
        ...(conversationFile !== undefined && { conversationFile }),
        ...(conversationFileSolved !== undefined && { conversationFileSolved }),
        ...(animate !== undefined && { animate }),
      };
    });
  }
}

