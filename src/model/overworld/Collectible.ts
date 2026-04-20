/**
 * Model class for collectible interactables on the overworld map.
 * Currently used for jewels that the player can pick up.
 * Pure TypeScript – no Phaser dependencies.
 */

export type JewelColour = 'red' | 'blue' | 'green' | 'yellow';

export type CollectibleType = 'jewel';

/**
 * Represents a single collectible item placed on the Tiled map.
 * Collectibles live on an object layer named "collectibles" (optionally inside
 * a Tiled group).  Each object carries a property that identifies its type
 * and sub-type, e.g. `jewel = "red"`.
 */
export class Collectible {
    /** Unique ID derived from the Tiled object ID. */
    readonly id: string;
    /** Tile X coordinate (world grid). */
    readonly tileX: number;
    /** Tile Y coordinate (world grid). */
    readonly tileY: number;
    /** The broad category of this collectible. */
    readonly collectibleType: CollectibleType;
    /** For jewel collectibles: the colour. */
    readonly colour: string;
    /** Whether the player has already collected this item this session. */
    private _collected: boolean;

    constructor(
        id: string,
        tileX: number,
        tileY: number,
        collectibleType: CollectibleType,
        colour: string
    ) {
        this.id = id;
        this.tileX = tileX;
        this.tileY = tileY;
        this.collectibleType = collectibleType;
        this.colour = colour;
        this._collected = false;
    }

    /**
     * Whether this collectible has been picked up.
     */
    get collected(): boolean {
        return this._collected;
    }

    /**
     * Mark this collectible as collected.
     */
    collect(): void {
        this._collected = true;
    }

    /**
     * Create a Collectible from a raw Tiled object and the parent layer's region name.
     *
     * @param obj       Raw Tiled object (from an objectgroup layer).
     * @param tileWidth  Tile width in pixels (used for coordinate conversion).
     * @param tileHeight Tile height in pixels.
     * @returns A Collectible instance, or null if the object lacks required properties.
     */
    static fromTiledObject(
        obj: { id: number; x?: number; y?: number; properties?: Array<{ name: string; value: any }> },
        tileWidth: number,
        tileHeight: number
    ): Collectible | null {
        if (typeof obj.x !== 'number' || typeof obj.y !== 'number') {
            return null;
        }

        const properties = obj.properties ?? [];
        const jewel = properties.find((p) => p.name === 'jewel')?.value;

        if (jewel) {
            const tileX = Math.floor(obj.x / tileWidth);
            const tileY = Math.floor(obj.y / tileHeight);
            return new Collectible(String(obj.id), tileX, tileY, 'jewel', String(jewel));
        }

        return null;
    }
}
