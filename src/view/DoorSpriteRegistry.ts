/**
 * Configuration for door sprite rendering
 * Maps door sprite IDs to tileset sprite indices and opening animation data
 */

export interface DoorSpriteMapping {
    closed: number;
    open: number;
    /** Phaser texture key for the opening animation spritesheet */
    animationKey: string;
    /** Frame width of each animation frame in pixels */
    frameWidth: number;
    /** Frame height of each animation frame in pixels */
    frameHeight: number;
    /** Number of frames in the opening animation */
    frameCount: number;
}

/**
 * Door sprite mappings for the terrains tileset
 * These map from Tiled object spriteId properties to actual sprite indices
 */
export const DoorSpriteRegistry: Record<string, DoorSpriteMapping> = {
    // Horizontal doors
    'forestDoorHClosed': {
        closed: 30,
        open: 31,
        animationKey: 'forestDoorHOpening',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4
    },
    'forestDoorHOpen': {
        closed: 30,
        open: 31,
        animationKey: 'forestDoorHOpening',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4
    },

    // Vertical doors
    'forestDoorVClosed': {
        closed: 32,
        open: 33,
        animationKey: 'forestDoorVOpening',
        frameWidth: 32,
        frameHeight: 64,
        frameCount: 4
    },
    'forestDoorVOpen': {
        closed: 32,
        open: 33,
        animationKey: 'forestDoorVOpening',
        frameWidth: 32,
        frameHeight: 64,
        frameCount: 4
    }
};

/**
 * Get the full sprite mapping for a door, or null if not found.
 * Used to access animation metadata alongside closed/open frame indices.
 */
export function getDoorSpriteMapping(spriteId: string | undefined): DoorSpriteMapping | null {
    if (!spriteId) {
        return null;
    }
    return DoorSpriteRegistry[spriteId] ?? null;
}

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
