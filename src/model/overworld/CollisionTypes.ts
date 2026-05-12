/**
 * Collision type constants for the overworld multi-layer collision system.
 *
 * The overworld uses four types to support upper/lower ground layers and stairs:
 * - BLOCKED:      Impassable terrain (walls, locked doors, solid obstacles)
 * - WALKABLE:     Normal walkable ground (upper layer); blocks movement from the lower layer
 * - WALKABLE_LOW: Lower-ground walkable (e.g. riverbeds); blocks movement from the upper layer
 * - STAIRS:       Layer-neutral stairs that connect upper and lower layers; passable from both
 * - ALWAYS_HIGH:  Always upper-ground walkable regardless of water flow state; immune to
 *                 FlowPuzzle water collision updates (never becomes BLOCKED or WALKABLE_LOW)
 * - NARROW_NS:    Narrow passage – walkable on the upper layer but only from/to the north or
 *                 south. Entry and exit from the east or west are blocked. While the player
 *                 occupies the tile, their x position is clamped to the central column. Used
 *                 for single vertical bridge spans so the player cannot walk off the sides.
 * - NARROW_EW:    Narrow passage – walkable on the upper layer but only from/to the east or
 *                 west. Entry and exit from the north or south are blocked. While the player
 *                 occupies the tile, their y position is clamped to the central row. Used for
 *                 single horizontal bridge spans so the player cannot walk off the edges.
 *
 * These constants are shared by:
 * - CollisionTileClassifier – pure, initialization-time tile classification from Tiled properties
 * - CollisionManager        – runtime collision state management (bridges, doors, puzzle entry/exit)
 */
export const CollisionType = {
    BLOCKED: 0,
    WALKABLE: 1,
    WALKABLE_LOW: 2,
    STAIRS: 3,
    ALWAYS_HIGH: 4,
    NARROW_NS: 5,
    NARROW_EW: 6,
} as const;

export type CollisionType = typeof CollisionType[keyof typeof CollisionType];
