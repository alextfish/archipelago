import type { GridKey } from '@model/puzzle/FlowTypes';

/**
 * Maps flow direction combinations to Phaser animation keys and sprite frame
 * indices within the `water directions` tileset.
 *
 * The `water directions` tileset (`water directions.png`, 8 columns × 4 rows,
 * 32 tiles at 32 × 32 px) encodes direction in its tile IDs:
 *
 * ```
 *   bit 3 = flowNorth   (N)
 *   bit 2 = flowSouth   (S)
 *   bit 1 = flowWest    (W)
 *   bit 0 = flowEast    (E)
 * ```
 *
 * Frame index = 8·N + 4·S + 2·W + 1·E  (0–15 non-source; 0+16 – 15+16 source).
 *
 * This class is pure model logic: it returns plain data values (strings and
 * numbers), never Phaser objects.
 *
 * Model layer — no Phaser or UI framework imports.
 */
export class WaterFlowAnimationCalculator {
    /** Prefix for all animation keys produced by this class. */
    static readonly ANIMATION_KEY_PREFIX = 'water-';

    /**
     * Return the Phaser animation key for a canonical NSEW direction key.
     *
     * @param directionKey Canonical NSEW direction string, e.g. `"NS"`, `"E"`,
     *   `"NSEW"`.  Pass `""` for a tile with no flow directions.
     * @returns Animation key string such as `"water-NS"` or `"water-none"`.
     */
    static animationKeyForDirections(directionKey: string): string {
        return directionKey
            ? `${WaterFlowAnimationCalculator.ANIMATION_KEY_PREFIX}${directionKey}`
            : `${WaterFlowAnimationCalculator.ANIMATION_KEY_PREFIX}none`;
    }

    /**
     * Return the local tile frame index within the `water directions` tileset
     * for a given direction set.
     *
     * The encoding is:
     * ```
     *   index = (hasN ? 8 : 0) | (hasS ? 4 : 0) | (hasW ? 2 : 0) | (hasE ? 1 : 0)
     * ```
     * Add 16 for source-tile variants.
     *
     * @param directionKey Canonical NSEW direction string (may be empty).
     * @param isSource     When `true` returns the source-tile row (adds 16).
     * @returns Integer 0–15 (non-source) or 16–31 (source).
     */
    static frameIndexForDirections(directionKey: string, isSource = false): number {
        const hasN = directionKey.includes('N');
        const hasS = directionKey.includes('S');
        const hasE = directionKey.includes('E');
        const hasW = directionKey.includes('W');
        const index = (hasN ? 8 : 0) | (hasS ? 4 : 0) | (hasW ? 2 : 0) | (hasE ? 1 : 0);
        return isSource ? index + 16 : index;
    }

    /**
     * Return the set of all unique animation keys needed for every direction in
     * the given map.  Useful for pre-registering Phaser animations in the view
     * layer before any sprites are created.
     *
     * @param directionMap Map of world-tile positions to canonical direction keys,
     *   as returned by {@link WaterDirectionReader.readDirections}.
     */
    static animationKeysForMap(directionMap: ReadonlyMap<GridKey, string>): Set<string> {
        const keys = new Set<string>();
        for (const directionKey of directionMap.values()) {
            keys.add(WaterFlowAnimationCalculator.animationKeyForDirections(directionKey));
        }
        return keys;
    }
}
