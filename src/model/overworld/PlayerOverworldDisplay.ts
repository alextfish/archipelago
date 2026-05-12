/**
 * Model class for items displayed on the overworld HUD during exploration mode.
 * Pure TypeScript – no Phaser dependencies.
 *
 * Examples: jewel counts shown in the top-right corner of the screen.
 */

export type OverworldDisplayItemType = 'jewel';

/**
 * Represents a single entry to show in the exploration-mode HUD.
 * The view layer converts these into sprites / text elements.
 */
export interface PlayerOverworldDisplayItem {
    /** The broad category (currently only 'jewel'). */
    readonly type: OverworldDisplayItemType;
    /** For jewel items: the colour key (e.g. 'red', 'blue'). */
    readonly colour: string;
    /** The current quantity to display. Always > 0 (items with 0 are omitted). */
    readonly count: number;
}
