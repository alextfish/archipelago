import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';
import type { ConstraintDisplayItem } from './ConstraintDisplayItem';

// Each island's local bridge-count constraint must be satisfied

export class IslandBridgeCountConstraint extends Constraint {
  override readonly conversationFile = 'constraints/islandBridgeCount_unsatisfied.json';
  override readonly conversationFileSolved = 'constraints/islandBridgeCount_satisfied.json';

  static fromSpec(_params?: { [key: string]: any }): IslandBridgeCountConstraint {
    return new IslandBridgeCountConstraint();
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    const violations: string[] = [];
    const violationGlyphs: string[] = [];

    for (const island of puzzle.islands) {
      const rule = island.constraints?.find(c => c.startsWith("num_bridges="));
      if (!rule) continue;

      const expected = Number(rule.split("=")[1]);
      const actual = puzzle.bridgesFromIsland(island).length;
      if (actual !== expected) {
        violations.push(island.id);
        if (actual < expected) {
          violationGlyphs.push("not-enough bridge");
        } else {
          violationGlyphs.push("too-many bridge");
        }
      }
    }

    // Use first violation's glyph message if any
    const glyphMessage = violationGlyphs.length > 0 ? violationGlyphs[0] : undefined;

    return {
      satisfied: violations.length === 0,
      affectedElements: violations,
      message: violations.length ? `Incorrect bridge count: ${violations.join(", ")}` : undefined,
      glyphMessage,
    };
  }

  override getDisplayItems(puzzle: BridgePuzzle): ConstraintDisplayItem[] {
    const items: ConstraintDisplayItem[] = [];

    for (const island of puzzle.islands) {
      const rule = island.constraints?.find(c => c.startsWith("num_bridges="));
      if (!rule) continue;

      const expected = Number(rule.split("=")[1]);
      const actual = puzzle.bridgesFromIsland(island).length;

      let glyphMessage: string;
      if (actual === expected) {
        glyphMessage = "good";
      } else if (actual < expected) {
        glyphMessage = "not-enough bridge";
      } else {
        glyphMessage = "too-many bridge";
      }

      // Extract optional disguise and conversation overrides stored on the island
      const getIslandProp = (prefix: string): string | undefined =>
        island.constraints?.find(c => c.startsWith(`${prefix}=`))?.substring(prefix.length + 1);

      const disguiseSpriteKey = getIslandProp('disguise_sprite');
      const disguiseSpriteSolvedKey = getIslandProp('disguise_sprite_solved');
      const conversationFile = getIslandProp('conversation_file');
      const conversationFileSolved = getIslandProp('conversation_file_solved');

      items.push({
        elementID: island.id,
        glyphMessage,
        constraintType: 'IslandBridgeCountConstraint',
        requiredCount: expected,
        conversationVariables: { count: String(expected) },
        ...(disguiseSpriteKey !== undefined && { disguiseSpriteKey }),
        ...(disguiseSpriteSolvedKey !== undefined && { disguiseSpriteSolvedKey }),
        ...(conversationFile !== undefined && { conversationFile }),
        ...(conversationFileSolved !== undefined && { conversationFileSolved }),
      });
    }

    return items;
  }
}
