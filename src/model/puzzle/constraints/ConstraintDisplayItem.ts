/**
 * Represents a single constraint feedback item for display in the puzzle view.
 * When all bridges are placed, each constrained element (e.g. island) is paired
 * with the glyph message that should appear in its speech bubble.
 */
export interface ConstraintDisplayItem {
  /** ID of the element this display is for (e.g. island ID or bridge ID) */
  elementID: string;
  /** Space-separated glyph words — "good" when satisfied, violation message otherwise */
  glyphMessage: string;
  /** Type of constraint that generated this item (for choosing NPC sprite) */
  constraintType?: string;
  /** Required count for overlay display (e.g. bridge count or enclosed area size, 1-8) */
  requiredCount?: number;
  /**
   * Optional grid position for the NPC and speech bubble.
   * When provided, this position is used instead of looking up the element
   * by ID in the puzzle's island list.  Used for bridge-based constraints
   * such as BridgeMustCoverIslandConstraint where the NPC sits at the
   * bridge's strut location rather than at an island.
   */
  position?: { x: number; y: number };
  /**
   * Optional frame index into the compass_overlay spritesheet to display
   * alongside the NPC (0=north, 1=east, 2=south, 3=west).
   * Omit for constraints that have no directional component.
   */
  compassFrame?: number;
}
