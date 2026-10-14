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
    /** First frame index in the spritesheet used for the opening animation. */
    animationStartFrame?: number;
    /** Width-specific sprite frame variants for multi-tile doors. */
    variantsByWidth?: Record<number, DoorSpriteVariant>;
}

export interface DoorSpriteVariant {
    /** Per-tile frame indices for the closed state, ordered left-to-right. */
    closedFrames: number[];
    /** Per-tile frame indices for the open state, ordered left-to-right. */
    openFrames: number[];
    /** Optional per-tile animation frame sequences, ordered left-to-right. */
    animationFrameSequences?: number[][];
}

/**
 * Door sprite mappings for dedicated door spritesheets.
 * Each spritesheet drives both the static closed/open display and the opening animation.
 * Frame 0 = closed state, final frame = open state.
 */
export const DoorSpriteRegistry: Record<string, DoorSpriteMapping> = {
    // General horizontal door tiles from terrains.png
    'doorHClosed': {
        textureKey: 'terrains-door-tiles',
        closedFrame: 30,
        openFrame: 31,
        animationKey: 'terrains-door-tiles',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 2,
        animationStartFrame: 30
    },
    'doorHOpen': {
        textureKey: 'terrains-door-tiles',
        closedFrame: 30,
        openFrame: 31,
        animationKey: 'terrains-door-tiles',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 2,
        animationStartFrame: 30
    },

    // Horizontal doors
    'forestDoorHClosed': {
        textureKey: 'forestDoorHOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorHOpening',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 6,
        animationStartFrame: 0
    },
    'forestDoorHOpen': {
        textureKey: 'forestDoorHOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorHOpening',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 6,
        animationStartFrame: 0
    },

    // Vertical doors
    'forestDoorVClosed': {
        textureKey: 'forestDoorVOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorVOpening',
        frameWidth: 32,
        frameHeight: 64,
        frameCount: 6,
        animationStartFrame: 0
    },
    'forestDoorVOpen': {
        textureKey: 'forestDoorVOpening',
        closedFrame: 0,
        openFrame: 5,
        animationKey: 'forestDoorVOpening',
        frameWidth: 32,
        frameHeight: 64,
        frameCount: 6,
        animationStartFrame: 0
    },

    // Cave wall door variants that can span 3, 4, or 5 tiles.
    // Width-specific frames use CaveWalls tileset indices.
    'caveDoorClosed': {
        textureKey: 'cavewalls-door-tiles',
        closedFrame: 81,
        openFrame: 107,
        animationKey: 'cavewalls-door-tiles',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 5,
        variantsByWidth: {
            3: {
                closedFrames: [81, 82, 84],
                openFrames: [107, 108, 110],
                animationFrameSequences: [
                    [81, 94, 85, 98, 107],
                    [82, 95, 86, 99, 108],
                    [84, 97, 88, 101, 110],
                ]
            },
            4: {
                closedFrames: [81, 82, 83, 84],
                openFrames: [107, 108, 109, 110],
                animationFrameSequences: [
                    [81, 94, 85, 98, 107],
                    [82, 95, 86, 99, 108],
                    [83, 96, 87, 100, 109],
                    [84, 97, 88, 101, 110],
                ]
            },
            5: {
                closedFrames: [81, 82, 83, 82, 84],
                openFrames: [107, 108, 109, 108, 110],
                animationFrameSequences: [
                    [81, 94, 85, 98, 107],
                    [82, 95, 86, 99, 108],
                    [83, 96, 87, 100, 109],
                    [82, 95, 86, 99, 108],
                    [84, 97, 88, 101, 110],
                ]
            }
        }
    },
    'caveDoorOpen': {
        textureKey: 'cavewalls-door-tiles',
        closedFrame: 81,
        openFrame: 107,
        animationKey: 'cavewalls-door-tiles',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 5,
        variantsByWidth: {
            3: {
                closedFrames: [81, 82, 84],
                openFrames: [107, 108, 110],
                animationFrameSequences: [
                    [81, 94, 85, 98, 107],
                    [82, 95, 86, 99, 108],
                    [84, 97, 88, 101, 110],
                ]
            },
            4: {
                closedFrames: [81, 82, 83, 84],
                openFrames: [107, 108, 109, 110],
                animationFrameSequences: [
                    [81, 94, 85, 98, 107],
                    [82, 95, 86, 99, 108],
                    [83, 96, 87, 100, 109],
                    [84, 97, 88, 101, 110],
                ]
            },
            5: {
                closedFrames: [81, 82, 83, 82, 84],
                openFrames: [107, 108, 109, 108, 110],
                animationFrameSequences: [
                    [81, 94, 85, 98, 107],
                    [82, 95, 86, 99, 108],
                    [83, 96, 87, 100, 109],
                    [82, 95, 86, 99, 108],
                    [84, 97, 88, 101, 110],
                ]
            }
        }
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
