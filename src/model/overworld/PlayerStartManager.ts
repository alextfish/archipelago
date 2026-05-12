/**
 * Model for managing player start positions from Tiled map data
 * Handles finding the appropriate start position based on default or ID
 */

export interface PlayerStartPosition {
    x: number;
    y: number;
    id: string;
    isDefault: boolean;
}

export interface TiledObject {
    name?: string;
    x?: number;
    y?: number;
    properties?: Array<{
        name: string;
        type: string;
        value: any;
    }>;
}

export interface TiledObjectLayer {
    name: string;
    objects: TiledObject[];
}

export interface TiledMapData {
    layers: Array<TiledObjectLayer & { type?: string }>;
}

/**
 * Pure TypeScript class for managing player start positions
 * No framework dependencies - fully unit testable
 */
export class PlayerStartManager {
    private playerStarts: PlayerStartPosition[] = [];

    /**
     * Parse player start positions from Tiled map data
     * @param mapData - The parsed Tiled map JSON data
     */
    constructor(mapData: TiledMapData) {
        this.parsePlayerStarts(mapData);
    }

    private parsePlayerStarts(mapData: TiledMapData): void {
        // Find the sceneTransitions layer
        const sceneTransitionsLayer = mapData.layers.find(
            layer => layer.name === 'sceneTransitions'
        );

        if (!sceneTransitionsLayer) {
            return;
        }

        // Find all "player start" objects
        const playerStartObjects = sceneTransitionsLayer.objects.filter(
            obj => obj.name === 'player start'
        );

        // Parse each player start object
        for (const obj of playerStartObjects) {
            const properties = this.parseProperties(obj);

            this.playerStarts.push({
                x: obj.x || 0,
                y: obj.y || 0,
                id: properties.id || '',
                isDefault: properties.default === true
            });
        }
    }

    private parseProperties(obj: TiledObject): { id?: string; default?: boolean } {
        const result: { id?: string; default?: boolean } = {};

        if (!obj.properties) {
            return result;
        }

        for (const prop of obj.properties) {
            if (prop.name === 'id' && prop.type === 'string') {
                result.id = prop.value;
            } else if (prop.name === 'default' && prop.type === 'bool') {
                result.default = prop.value;
            }
        }

        return result;
    }

    /**
     * Get the default player start position
     * @returns The default start position, or null if none found
     */
    getDefaultStart(): PlayerStartPosition | null {
        return this.playerStarts.find(start => start.isDefault) || null;
    }

    /**
     * Get a player start position by its ID
     * @param id - The ID of the start position to find
     * @returns The start position with the given ID, or null if not found
     */
    getStartByID(id: string): PlayerStartPosition | null {
        return this.playerStarts.find(start => start.id === id) || null;
    }

    /**
     * Get all player start positions
     * @returns Array of all start positions
     */
    getAllStarts(): readonly PlayerStartPosition[] {
        return [...this.playerStarts];
    }

    /**
     * Get a start position by ID if provided, otherwise get the default
     * @param id - Optional ID of the start position to find
     * @returns The requested start position, or null if not found
     */
    getStart(id?: string): PlayerStartPosition | null {
        if (id) {
            return this.getStartByID(id);
        }
        return this.getDefaultStart();
    }
}
