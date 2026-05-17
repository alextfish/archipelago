/**
 * Represents a portal tile in the overworld or an interior map that
 * automatically transitions the player to another scene when stepped on.
 * Pure TypeScript — no Phaser dependencies.
 */
export class Portal {
    /** Unique identifier derived from the Tiled object name or ID. */
    readonly id: string;
    /** Tile X coordinate on the current map. */
    readonly tileX: number;
    /** Tile Y coordinate on the current map. */
    readonly tileY: number;
    /**
     * Key used to load the target map.
     * For building interiors this is the interior's JSON filename without
     * extension (e.g. `'house'` → `resources/interiors/house.json`).
     * For overworld-return portals this is the sentinel value `'overworld'`.
     */
    readonly targetMapKey: string;
    /** ID of the spawn-point object to place the player on arrival. */
    readonly targetSpawnID: string;

    constructor(
        id: string,
        tileX: number,
        tileY: number,
        targetMapKey: string,
        targetSpawnID: string
    ) {
        this.id = id;
        this.tileX = tileX;
        this.tileY = tileY;
        this.targetMapKey = targetMapKey;
        this.targetSpawnID = targetSpawnID;
    }

    /**
     * Create a Portal from a raw Tiled object.
     *
     * Required Tiled properties on the object:
     * - `targetMapKey`  (string) — map key to load in the target scene.
     * - `targetSpawnID` (string) — spawn-point ID on that map.
     *
     * @returns A Portal instance, or `null` if required properties are absent.
     */
    static fromTiledObject(
        obj: {
            id: number;
            name?: string;
            x?: number;
            y?: number;
            properties?: Array<{ name: string; value: any }>;
        },
        tileWidth: number,
        tileHeight: number
    ): Portal | null {
        if (typeof obj.x !== 'number' || typeof obj.y !== 'number') {
            return null;
        }

        const properties = obj.properties ?? [];
        const targetMapKey = properties.find((p) => p.name === 'targetMapKey')?.value;
        const targetSpawnID = properties.find((p) => p.name === 'targetSpawnID')?.value;

        if (!targetMapKey || !targetSpawnID) {
            return null;
        }

        const tileX = Math.floor(obj.x / tileWidth);
        const tileY = Math.floor(obj.y / tileHeight);
        const id = obj.name || String(obj.id);

        return new Portal(id, tileX, tileY, String(targetMapKey), String(targetSpawnID));
    }
}
