/**
 * Configuration for NPC icon rendering
 * View layer constants - defines visual representation of NPC series state
 */

/**
 * Icon sprite names for different NPC states
 */
export const NPCIconConfig = {
    /**
     * Sprite key for incomplete series icon (shown when series has unsolved puzzles)
     */
    INCOMPLETE: 'icon-incomplete',
    
    /**
     * Sprite key for complete series icon (shown when all puzzles are solved)
     */
    COMPLETE: 'icon-complete',
    
    /**
     * Vertical offset of icon above NPC sprite (in pixels)
     */
    ICON_OFFSET_Y: -20,
    
    /**
     * Scale factor for icon sprites
     */
    ICON_SCALE: 1.0,
    
    /**
     * Depth offset for icons (added to NPC depth to ensure icons render above NPCs)
     */
    ICON_DEPTH_OFFSET: 0.1
} as const;

/**
 * Type for icon sprite keys
 */
export type NPCIconSprite = typeof NPCIconConfig.INCOMPLETE | typeof NPCIconConfig.COMPLETE;
