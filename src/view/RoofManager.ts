import Phaser from 'phaser';

/**
 * Represents a roof hide zone with its tiles and polygon area
 */
interface RoofHideZone {
    id: string;
    polygon: Phaser.Geom.Polygon;
    tiles: { x: number; y: number }[];
    isPlayerInside: boolean;
}

/**
 * RoofManager handles automatic hiding/showing of roof tiles when player
 * enters/exits roof hide zones.
 */
export class RoofManager {
    private scene: Phaser.Scene;
    private roofLayer?: Phaser.Tilemaps.TilemapLayer;
    private hideZones: RoofHideZone[] = [];
    private tweens: Map<string, Phaser.Tweens.Tween> = new Map();

    private readonly FADE_DURATION = 300; // ms for fade animation

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /**
     * Initialize the roof system with the roof layer and hide zones
     */
    initialize(
        map: Phaser.Tilemaps.Tilemap,
        roofLayer: Phaser.Tilemaps.TilemapLayer,
        tiledMapData: any
    ): void {
        this.roofLayer = roofLayer;

        // Extract roof hide zones from the map data
        this.extractRoofHideZones(map, tiledMapData);

        console.log(`RoofManager: Initialized with ${this.hideZones.length} hide zones`);
    }

    /**
     * Extract roof hide zone polygons from the Tiled map
     */
    private extractRoofHideZones(map: Phaser.Tilemaps.Tilemap, tiledMapData: any): void {
        if (!tiledMapData || !tiledMapData.layers) {
            console.warn('RoofManager: No tilemap data available');
            return;
        }

        // Find the "roof hide zones" object layer
        const hideZoneLayer = tiledMapData.layers.find(
            (layer: any) => layer.name === 'roof hide zones' && layer.type === 'objectgroup'
        );

        if (!hideZoneLayer || !hideZoneLayer.objects) {
            console.warn('RoofManager: No "roof hide zones" object layer found');
            return;
        }

        // Process each polygon object in the layer
        for (const obj of hideZoneLayer.objects) {
            if (obj.polygon) {
                const zone = this.createHideZone(obj, map);
                if (zone) {
                    this.hideZones.push(zone);
                    console.log(`RoofManager: Added hide zone "${zone.id}" with ${zone.tiles.length} tiles`);
                }
            }
        }
    }

    /**
     * Create a hide zone from a Tiled polygon object
     */
    private createHideZone(obj: any, map: Phaser.Tilemaps.Tilemap): RoofHideZone | null {
        if (!obj.polygon || !this.roofLayer) {
            return null;
        }

        // Convert Tiled polygon points to world coordinates
        // Tiled polygon points are relative to object position
        const points = obj.polygon.map((point: any) => {
            return new Phaser.Math.Vector2(
                obj.x + point.x,
                obj.y + point.y
            );
        });

        const polygon = new Phaser.Geom.Polygon(points);

        // Find all roof tiles that are within or overlap this polygon
        const tiles = this.findTilesInPolygon(polygon, map);

        return {
            id: obj.name || `zone_${obj.id}`,
            polygon,
            tiles,
            isPlayerInside: false
        };
    }

    /**
     * Find all roof tiles within a polygon area
     */
    private findTilesInPolygon(
        polygon: Phaser.Geom.Polygon,
        map: Phaser.Tilemaps.Tilemap
    ): { x: number; y: number }[] {
        if (!this.roofLayer) {
            return [];
        }

        const tiles: { x: number; y: number }[] = [];
        const bounds = Phaser.Geom.Polygon.GetAABB(polygon);

        // Convert bounds to tile coordinates
        const startTileX = Math.floor(bounds.x / map.tileWidth);
        const startTileY = Math.floor(bounds.y / map.tileHeight);
        const endTileX = Math.ceil((bounds.x + bounds.width) / map.tileWidth);
        const endTileY = Math.ceil((bounds.y + bounds.height) / map.tileHeight);

        // Check each tile in the bounding box
        for (let ty = startTileY; ty <= endTileY; ty++) {
            for (let tx = startTileX; tx <= endTileX; tx++) {
                const tile = this.roofLayer.getTileAt(tx, ty);
                if (tile) {
                    // Check if tile center is inside polygon
                    const tileCenterX = tx * map.tileWidth + map.tileWidth / 2;
                    const tileCenterY = ty * map.tileHeight + map.tileHeight / 2;

                    if (polygon.contains(tileCenterX, tileCenterY)) {
                        tiles.push({ x: tx, y: ty });
                    }
                }
            }
        }

        return tiles;
    }

    /**
     * Update roof visibility based on player position
     * Call this every frame from scene's update()
     */
    update(playerX: number, playerY: number): void {
        if (!this.roofLayer || this.hideZones.length === 0) {
            return;
        }

        // Check each hide zone
        for (const zone of this.hideZones) {
            const wasInside = zone.isPlayerInside;
            const isInside = zone.polygon.contains(playerX, playerY);

            if (isInside !== wasInside) {
                // Player entered or exited this zone
                zone.isPlayerInside = isInside;

                if (isInside) {
                    this.fadeRoofOut(zone);
                } else {
                    this.fadeRoofIn(zone);
                }
            }
        }
    }

    /**
     * Fade roof tiles to transparent (hide roof)
     */
    private fadeRoofOut(zone: RoofHideZone): void {
        console.log(`RoofManager: Hiding roof for zone "${zone.id}"`);

        // Cancel any existing tween for this zone
        const existingTween = this.tweens.get(zone.id);
        if (existingTween) {
            existingTween.stop();
            this.tweens.delete(zone.id);
        }

        // Set all tiles in this zone to fade out
        for (const tilePos of zone.tiles) {
            const tile = this.roofLayer!.getTileAt(tilePos.x, tilePos.y);
            if (tile) {
                // Create a tween to fade the tile
                const tween = this.scene.tweens.add({
                    targets: tile,
                    alpha: 0,
                    duration: this.FADE_DURATION,
                    ease: 'Power2'
                });

                // Store the tween (we'll only track the last one per zone for simplicity)
                this.tweens.set(zone.id, tween);
            }
        }
    }

    /**
     * Fade roof tiles to opaque (show roof)
     */
    private fadeRoofIn(zone: RoofHideZone): void {
        console.log(`RoofManager: Showing roof for zone "${zone.id}"`);

        // Cancel any existing tween for this zone
        const existingTween = this.tweens.get(zone.id);
        if (existingTween) {
            existingTween.stop();
            this.tweens.delete(zone.id);
        }

        // Set all tiles in this zone to fade in
        for (const tilePos of zone.tiles) {
            const tile = this.roofLayer!.getTileAt(tilePos.x, tilePos.y);
            if (tile) {
                // Create a tween to fade the tile back in
                const tween = this.scene.tweens.add({
                    targets: tile,
                    alpha: 1,
                    duration: this.FADE_DURATION,
                    ease: 'Power2'
                });

                // Store the tween
                this.tweens.set(zone.id, tween);
            }
        }
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        // Stop all active tweens
        for (const tween of this.tweens.values()) {
            tween.stop();
        }
        this.tweens.clear();
        this.hideZones = [];
        this.roofLayer = undefined;
    }
}
