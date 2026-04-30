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
   * alongside the NPC (0=north, 1=east, 2=south, 3=west, 5=adjacent/all-directions).
   * Omit for constraints that have no directional component.
   */
  compassFrame?: number;
  /**
   * Optional key-value pairs substituted into the constraint's conversation JSON
   * (e.g. `{ count: "2", direction: "above" }`).
   */
  conversationVariables?: Record<string, string>;
  /**
   * Optional texture key for the overworld NPC sprite when the puzzle is unsatisfied.
   * When set, overrides the default sprite chosen by {@link getNPCSpriteKey}.
   * The sprite image must be loaded under this key (the OverworldScene loads it from
   * `resources/sprites/<disguiseSpriteKey>.png`).
   */
  disguiseSpriteKey?: string;
  /**
   * Optional texture key for the overworld NPC sprite when the puzzle is satisfied.
   * Works together with {@link disguiseSpriteKey}: when the associated puzzle is solved the
   * sprite flips to this texture, revealing the constraint's "true" identity.
   */
  disguiseSpriteSolvedKey?: string;
  /**
   * Optional per-island override for the unsatisfied conversation file
   * (relative to `resources/conversations/`).  When set, takes precedence over
   * `Constraint.conversationFile` for this specific island.
   */
  conversationFile?: string;
  /**
   * Optional per-island override for the satisfied conversation file
   * (relative to `resources/conversations/`).  When set, takes precedence over
   * `Constraint.conversationFileSolved` for this specific island.
   */
  conversationFileSolved?: string;
  /**
   * Whether the NPC sprite for this constraint should play its idle animation.
   * Driven by the `animate` property on the constraint's Tiled object.
   */
  animate?: boolean;
}
