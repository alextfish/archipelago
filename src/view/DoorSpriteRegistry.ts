/**
 * Configuration for door sprite rendering
 * Maps door sprite IDs to tileset sprite indices
 */

export interface DoorSpriteMapping {
    closed: number;
    open: number;
}

/**
 * Door sprite mappings for the terrains tileset
 * These map from Tiled object spriteId properties to actual sprite indices
 */
export const DoorSpriteRegistry: Record<string, DoorSpriteMapping> = {
    // Horizontal doors
    'forestDoorHClosed': {
        closed: 30,
        open: 31
    },
    'forestDoorHOpen': {
        closed: 30,
        open: 31
    },

    // Vertical doors
    'forestDoorVClosed': {
        closed: 32,
        open: 33
    },
    'forestDoorVOpen': {
        closed: 32,
        open: 33
    }
};

/**
 * Get the sprite frame index for a door based on its sprite ID and locked state
 * @param spriteId The sprite ID from Tiled (e.g., "forestDoorHClosed")
 * @param isLocked Whether the door is currently locked
 * @returns The sprite frame index in the terrains tileset, or null if not found
 */
export function getDoorSpriteFrame(spriteId: string | undefined, isLocked: boolean): number | null {
    if (!spriteId) {
        return null;
    }

    const mapping = DoorSpriteRegistry[spriteId];
    if (!mapping) {
        console.warn(`No sprite mapping found for door spriteId: ${spriteId}`);
        return null;
    }

    return isLocked ? mapping.closed : mapping.open;
}
