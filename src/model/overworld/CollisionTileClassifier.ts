import { CollisionType } from '@model/overworld/CollisionManager';

/**
 * The properties a Tiled collision tile can carry.
 * Undefined means the property is absent (falsy).
 */
export interface CollisionTileProperties {
    walkable?: boolean;
    walkable_low?: boolean;
    stairs?: boolean;
    [key: string]: any;
}

/**
 * One tile entry as read from a Phaser collision layer at a given (x, y).
 * `null` means no tile exists at that position in this layer.
 */
export interface CollisionTileData {
    properties?: CollisionTileProperties;
}

/** Result produced by classifying all collision-layer tiles at a single (x, y) position. */
export interface CollisionClassification {
    collisionType: CollisionType;
    hasWalkable: boolean;
    hasWalkableLow: boolean;
    /** Whether any collision layer had a real tile at this position. */
    hasTile: boolean;
}

/**
 * Pure logic for classifying a map tile's collision type from its Tiled properties.
 * Has no Phaser dependency and is fully unit-testable.
 */
export class CollisionTileClassifier {
    /**
     * Determine the CollisionType for a single map position by examining the tiles
     * (from each collision layer) stacked at that position.
     *
     * Rules (in priority order):
     * - No tile found in any layer → WALKABLE (open ground)
     * - Any tile with `stairs = true` → STAIRS (always passable)
     * - Any tile with `walkable = true` → WALKABLE (upper ground)
     * - Any tile with `walkable_low = true` → WALKABLE_LOW (lower ground)
     * - Tile present but none of the above → BLOCKED (wall / obstacle)
     *
     * @param layerTiles - One entry per collision layer; `null` when no tile exists in that layer.
     */
    static classifyTile(layerTiles: Array<CollisionTileData | null>): CollisionClassification {
        let collisionType: CollisionType = CollisionType.WALKABLE;
        let hasWalkable = false;
        let hasWalkableLow = false;
        let hasTile = false;

        for (const tile of layerTiles) {
            if (!tile) continue;
            hasTile = true;

            if (tile.properties) {
                if ('walkable' in tile.properties && tile.properties.walkable === true) {
                    hasWalkable = true;
                    collisionType = CollisionType.WALKABLE;
                }
                if ('walkable_low' in tile.properties && tile.properties.walkable_low === true) {
                    hasWalkableLow = true;
                    collisionType = CollisionType.WALKABLE_LOW;
                }
                if ('stairs' in tile.properties && tile.properties.stairs === true) {
                    collisionType = CollisionType.STAIRS;
                }
            }

            // A tile present with no walkable properties is blocked
            if (!hasWalkable && !hasWalkableLow && collisionType !== CollisionType.STAIRS) {
                collisionType = CollisionType.BLOCKED;
            }
        }

        return { collisionType, hasWalkable, hasWalkableLow, hasTile };
    }

    /**
     * Convert a classification result to sub-layer collision values.
     *
     * The overworld collision system uses three derived layers:
     * - `upperGround`: blocks movement when the player is on the lower ground layer
     * - `lowerGround`: blocks movement when the player is on the upper ground layer
     * - `blocked`: always blocks movement
     *
     * Returns `1` for the layer that should have a blocking tile, `0` for the others.
     */
    static toSubLayerValues(result: CollisionClassification): {
        upperGround: number;
        lowerGround: number;
        blocked: number;
    } {
        if (!result.hasTile) {
            // No collision tile → open ground, no blocking on any layer
            return { upperGround: 0, lowerGround: 0, blocked: 0 };
        }

        if (result.collisionType === CollisionType.STAIRS) {
            // Stairs: passable from both layers
            return { upperGround: 0, lowerGround: 0, blocked: 0 };
        }

        if (result.hasWalkableLow) {
            // Lower ground: player on the upper layer is blocked here
            return { upperGround: 0, lowerGround: 1, blocked: 0 };
        }

        if (result.hasWalkable) {
            // Upper ground: player on the lower layer is blocked here
            return { upperGround: 1, lowerGround: 0, blocked: 0 };
        }

        // Tile with no walkable properties → always blocked
        return { upperGround: 0, lowerGround: 0, blocked: 1 };
    }
}
