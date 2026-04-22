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
} as const;

export type CollisionType = typeof CollisionType[keyof typeof CollisionType];
