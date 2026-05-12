import type { StrutBridgeFrameName } from '@model/puzzle/StrutBridge';

/** Phaser texture key for the strut-bridge spritesheet. */
export const STRUT_BRIDGE_SPRITESHEET_KEY = 'strut-bridge-tiles';

/** Orientation of a placed bridge. */
export type StrutBridgeOrientation = 'horizontal' | 'vertical';

/**
 * Sprite frame indices within the strut-bridge spritesheet.
 * Each logical frame name has both a horizontal (H_) and vertical (V_) variant.
 * Numbers are placeholders — replace once the spritesheet is finalised.
 */
export const StrutBridgeFrames = {
    H_STRUT:      0,
    V_STRUT:      1,
    H_L2S_SINGLE: 2,
    V_L2S_SINGLE: 3,
    H_L2S_LEFT:   4,
    V_L2S_LEFT:   5,
    H_L2S_RIGHT:  6,
    V_L2S_RIGHT:  7,
    H_L2S_MID:    8,
    V_L2S_MID:    9,
    H_S2R_SINGLE: 10,
    V_S2R_SINGLE: 11,
    H_S2R_LEFT:   12,
    V_S2R_LEFT:   13,
    H_S2R_RIGHT:  14,
    V_S2R_RIGHT:  15,
    H_S2R_MID:    16,
    V_S2R_MID:    17,
    H_L2R:        18,
    V_L2R:        19,
} as const;

/**
 * Returns the spritesheet frame index for the given logical frame name and
 * bridge orientation.
 *
 * @param frameName  - One of the StrutBridgeFrameName string literals
 * @param orientation - Whether the bridge runs horizontally or vertically
 */
export function getStrutBridgeFrame(
    frameName: StrutBridgeFrameName,
    orientation: StrutBridgeOrientation
): number {
    const prefix = orientation === 'horizontal' ? 'H' : 'V';
    const key = `${prefix}_${frameName.toUpperCase().replace(/-/g, '_')}` as keyof typeof StrutBridgeFrames;
    const frame = StrutBridgeFrames[key];
    if (frame === undefined) {
        throw new Error(`Unknown strut bridge frame: ${frameName} (${orientation})`);
    }
    return frame;
}
