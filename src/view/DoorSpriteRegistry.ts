/**
 * Configuration for door sprite rendering
 * Maps door sprite IDs to tileset sprite indices and opening animation data
 */

export interface DoorSpriteMapping {
    /** Phaser texture key for the spritesheet (used for both static display and animation) */
    textureKey: string;
    /** Frame index within the spritesheet for the closed state */
    closedFrame: number;
    /** Frame index within the spritesheet for the open state */
    openFrame: number;
    /** Phaser animation key for the opening animation */
    animationKey: string;
    /** Frame width of each animation frame in pixels */
    frameWidth: number;
    /** Frame height of each animation frame in pixels */
    frameHeight: number;
    /** Number of frames in the opening animation */
    frameCount: number;
}

/**
 * Door sprite mappings for dedicated door spritesheets.
 * Each spritesheet drives both the static closed/open display and the opening animation.
 * Frame 0 = closed state, final frame = open state.
 */
export const DoorSpriteRegistry: Record<string, DoorSpriteMapping> = {
    // Horizontal doors
    'forestDoorHClosed': {
        textureKey: 'forestDoorHOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorHOpening',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 6
    },
    'forestDoorHOpen': {
        textureKey: 'forestDoorHOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorHOpening',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 6
    },

    // Vertical doors
    'forestDoorVClosed': {
        textureKey: 'forestDoorVOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorVOpening',
        frameWidth: 32,
        frameHeight: 64,
        frameCount: 6
    },
    'forestDoorVOpen': {
        textureKey: 'forestDoorVOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorVOpening',
        frameWidth: 32,
        frameHeight: 64,
        frameCount: 6
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
 * @returns The frame index within the door's dedicated spritesheet, or null if not found
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

    return isLocked ? mapping.closedFrame : mapping.openFrame;
}
