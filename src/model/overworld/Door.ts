/**
 * Represents a door in the overworld that can be locked or unlocked.
 * Pure model class - no Phaser dependencies.
 */

export interface DoorPosition {
    tileX: number;
    tileY: number;
}

/**
 * A door that blocks passage until unlocked
 */
export class Door {
    readonly id: string;
    readonly positions: DoorPosition[];  // Tiles this door occupies
    readonly seriesId?: string;          // Series that unlocks this door
    readonly spriteId?: string;          // Sprite identifier for rendering
    private locked: boolean;

    constructor(
        id: string,
        positions: DoorPosition[],
        locked: boolean = true,
        seriesId?: string,
        spriteId?: string
    ) {
        if (positions.length === 0) {
            throw new Error('Door must have at least one position');
        }
        
        this.id = id;
        this.positions = positions;
        this.locked = locked;
        this.seriesId = seriesId;
        this.spriteId = spriteId;
    }

    /**
     * Check if the door is locked
     */
    isLocked(): boolean {
        return this.locked;
    }

    /**
     * Unlock the door
     */
    unlock(): void {
        this.locked = false;
    }

    /**
     * Lock the door
     */
    lock(): void {
        this.locked = true;
    }

    /**
     * Get all tile positions this door occupies
     */
    getPositions(): readonly DoorPosition[] {
        return this.positions;
    }

    /**
     * Check if this door occupies a specific tile
     */
    occupiesTile(tileX: number, tileY: number): boolean {
        return this.positions.some(pos => pos.tileX === tileX && pos.tileY === tileY);
    }

    /**
     * Create a Door from Tiled object data
     */
    static fromTiledObject(obj: any, tileWidth: number, tileHeight: number): Door {
        // Extract door ID from object
        const id = obj.name || obj.id?.toString() || 'unknown';
        
        // Extract seriesId from custom properties
        let seriesId: string | undefined;
        let spriteId: string | undefined;
        
        if (obj.properties && Array.isArray(obj.properties)) {
            const seriesProp = obj.properties.find((p: any) => p.name === 'seriesId');
            if (seriesProp && seriesProp.value) {
                seriesId = seriesProp.value;
            }
            
            const spriteProp = obj.properties.find((p: any) => p.name === 'spriteId');
            if (spriteProp && spriteProp.value) {
                spriteId = spriteProp.value;
            }
        }
        
        // Calculate tile positions from object bounds
        // Tiled objects use pixel coordinates
        const startTileX = Math.floor(obj.x / tileWidth);
        const startTileY = Math.floor(obj.y / tileHeight);
        const widthInTiles = Math.ceil((obj.width || tileWidth) / tileWidth);
        const heightInTiles = Math.ceil((obj.height || tileHeight) / tileHeight);
        
        const positions: DoorPosition[] = [];
        for (let dy = 0; dy < heightInTiles; dy++) {
            for (let dx = 0; dx < widthInTiles; dx++) {
                positions.push({
                    tileX: startTileX + dx,
                    tileY: startTileY + dy
                });
            }
        }
        
        return new Door(id, positions, true, seriesId, spriteId);
    }
}
