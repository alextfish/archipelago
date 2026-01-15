/**
 * Shared sprite frame indices and constants for bridge puzzle rendering.
 * These constants map to frame positions in the SproutLandsGrassIslands.png tileset.
 * 
 * Used by both PhaserPuzzleRenderer and EmbeddedPuzzleRenderer to ensure
 * consistent visual representation across different rendering contexts.
 */

/**
 * Sprite frame indices from SproutLandsGrassIslands.png tileset
 */
export const BridgeSpriteFrames = {
  /** Island tile frame */
  FRAME_ISLAND: 36,
  
  /** Horizontal bridge component frames */
  H_BRIDGE_LEFT: 55,
  H_BRIDGE_CENTRE: 56,
  H_BRIDGE_RIGHT: 57,
  
  /** Vertical bridge component frames */
  V_BRIDGE_BOTTOM: 58,
  V_BRIDGE_MIDDLE: 59,
  V_BRIDGE_TOP: 60,
  
  /** Single-tile bridge frames */
  UNFINISHED_BRIDGE: 61,
  H_BRIDGE_SINGLE: 62,
  V_BRIDGE_SINGLE: 63,
  
  /** Offset to apply to single bridge frames for double bridges */
  DOUBLE_BRIDGE_OFFSET: 11,
} as const;

/**
 * Visual styling constants for preview and validation feedback
 */
export const BridgeVisualConstants = {
  /** Alpha transparency for bridge placement preview */
  PREVIEW_ALPHA: 0.8,
  
  /** Tint colour for invalid placement preview */
  INVALID_TINT: 0xff0000,
} as const;

/**
 * Type representing bridge orientation
 */
export type BridgeOrientation = 'horizontal' | 'vertical';

/**
 * Type representing position within a multi-segment bridge
 */
export type BridgeSegmentPosition = 'start' | 'middle' | 'end' | 'single';

/**
 * Get the appropriate sprite frame for a bridge segment based on orientation,
 * position within the bridge, and whether it's a double bridge.
 * 
 * @param orientation - Whether the bridge is horizontal or vertical
 * @param position - Position of this segment within the bridge
 * @param isDouble - Whether this is a double bridge (adds offset to frame)
 * @returns The sprite frame index to use
 */
export function getBridgeSegmentFrame(
  orientation: BridgeOrientation,
  position: BridgeSegmentPosition,
  isDouble: boolean = false
): number {
  let baseFrame: number;
  
  if (position === 'single') {
    // Single-tile bridge
    baseFrame = orientation === 'horizontal' 
      ? BridgeSpriteFrames.H_BRIDGE_SINGLE
      : BridgeSpriteFrames.V_BRIDGE_SINGLE;
  } else if (orientation === 'horizontal') {
    // Multi-segment horizontal bridge
    if (position === 'start') baseFrame = BridgeSpriteFrames.H_BRIDGE_LEFT;
    else if (position === 'middle') baseFrame = BridgeSpriteFrames.H_BRIDGE_CENTRE;
    else baseFrame = BridgeSpriteFrames.H_BRIDGE_RIGHT;
  } else {
    // Multi-segment vertical bridge
    if (position === 'start') baseFrame = BridgeSpriteFrames.V_BRIDGE_TOP;
    else if (position === 'middle') baseFrame = BridgeSpriteFrames.V_BRIDGE_MIDDLE;
    else baseFrame = BridgeSpriteFrames.V_BRIDGE_BOTTOM;
  }
  
  // Add offset for double bridges
  return isDouble ? baseFrame + BridgeSpriteFrames.DOUBLE_BRIDGE_OFFSET : baseFrame;
}
