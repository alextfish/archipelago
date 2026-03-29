/**
 * Represents a single constraint feedback item for display in the puzzle view.
 * When all bridges are placed, each constrained element (e.g. island) is paired
 * with the glyph message that should appear in its speech bubble.
 */
export interface ConstraintDisplayItem {
  /** ID of the element this display is for (e.g. island ID) */
  elementID: string;
  /** Space-separated glyph words — "good" when satisfied, violation message otherwise */
  glyphMessage: string;
  /** Type of constraint that generated this item (for choosing NPC sprite) */
  constraintType?: string;
  /** Required count for IslandBridgeCountConstraint (1-8) */
  requiredCount?: number;
}
