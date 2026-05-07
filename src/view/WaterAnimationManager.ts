import Phaser from 'phaser';
import { gridKey, parseGridKey } from '@model/puzzle/FlowTypes';
import type { GridKey } from '@model/puzzle/FlowTypes';
import { WaterFlowAnimationCalculator } from '@model/overworld/WaterFlowAnimationCalculator';

/**
 * Manages an overlay of Phaser images that visualise the flow direction of
 * overworld water tiles.
 *
 * At construction time a `Phaser.GameObjects.Image` is created at the centre
 * of every tile in the supplied direction map, using the correct frame from
 * the `'water-directions'` spritesheet (the same PNG as the Tiled
 * `water directions` tileset, loaded as a spritesheet in
 * {@link OverworldScene.preload}).  Frame indices are calculated by
 * {@link WaterFlowAnimationCalculator.frameIndexForDirections} so each sprite
 * automatically shows the arrow(s) matching that tile's flow direction.
 *
 * The sprites are shown while their tile has water and hidden while it is
 * drained.  Call {@link setWaterVisible} whenever
 * {@link FlowWaterVisualManager.updateSingleFlowTileVisual} changes a tile's
 * water state so both layers stay in sync.
 *
 * View layer — imports Phaser.
 */
export class WaterAnimationManager {
    /** Texture key for the water-directions spritesheet loaded in preload. */
    static readonly TEXTURE_KEY = 'water-directions';

    private readonly sprites: Map<GridKey, Phaser.GameObjects.Image>;

    /**
     * @param scene        The Phaser scene to add sprites to.
     * @param tileSize     Width (and height) of one tile in pixels.
     * @param directionMap Map returned by {@link WaterDirectionReader.readDirections}:
     *                     world-tile GridKey → canonical NSEW direction key.
     * @param depth        Render depth for all overlay sprites (default: 1, so
     *                     they sit just above the base tilemap layer depth 0).
     */
    constructor(
        scene: Phaser.Scene,
        tileSize: number,
        directionMap: ReadonlyMap<GridKey, string>,
        depth = 1,
    ) {
        this.sprites = new Map<GridKey, Phaser.GameObjects.Image>();

        for (const [key, directionKey] of directionMap.entries()) {
            const { x, y } = parseGridKey(key);
            const frame = WaterFlowAnimationCalculator.frameIndexForDirections(directionKey);
            const worldX = x * tileSize + tileSize / 2;
            const worldY = y * tileSize + tileSize / 2;

            const image = scene.add.image(worldX, worldY, WaterAnimationManager.TEXTURE_KEY, frame);
            image.setDepth(depth);
            // Visible by default: map loads with water in its initial state.
            image.setVisible(true);

            this.sprites.set(key, image);
        }
    }

    /**
     * Show or hide the directional overlay sprite for the tile at (tileX, tileY).
     *
     * This should be called every time
     * {@link FlowWaterVisualManager.updateSingleFlowTileVisual} changes the
     * water state of the same tile, so the two layers stay in sync.
     *
     * If no sprite exists for the given position (e.g. because the tile has no
     * flow direction) the call is a no-op.
     *
     * @param tileX   World tile X coordinate.
     * @param tileY   World tile Y coordinate.
     * @param visible `true` = water present (show sprite); `false` = drained (hide).
     */
    setWaterVisible(tileX: number, tileY: number, visible: boolean): void {
        const key = gridKey(tileX, tileY);
        const sprite = this.sprites.get(key);
        if (sprite) {
            sprite.setVisible(visible);
        }
    }

    /** Destroy all overlay sprites managed by this instance. */
    destroy(): void {
        for (const sprite of this.sprites.values()) {
            sprite.destroy();
        }
        this.sprites.clear();
    }
}
