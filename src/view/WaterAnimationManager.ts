import Phaser from 'phaser';
import { WaterFlowAnimationCalculator } from '@model/overworld/WaterFlowAnimationCalculator';
import type { WaterDisplayManifestTile } from '@model/overworld/WaterDisplayManifestReader';

const FLOW_FRAME_COUNT = 6;
const FLOW_FRAME_RATE = 10;

/**
 * Manages animated flow overlays for wet visual water tiles.
 */
export class WaterAnimationManager {
    private readonly spritesByTileKey = new Map<string, Phaser.GameObjects.Sprite>();
    private readonly animationByTileKey = new Map<string, string>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly map: Phaser.Tilemaps.Tilemap,
        manifestEntries: Iterable<WaterDisplayManifestTile>,
    ) {
        for (const entry of manifestEntries) {
            if (!entry.visualHasFlowDirections) continue;
            // Animation assets are keyed as "incoming-to-outgoing". Visual flow props
            // encode outgoing directions; incoming is inferred by the calculator.
            const animationKey = WaterFlowAnimationCalculator.calculateAnimationKey(
                [],
                entry.visualOutgoing
            );
            if (!animationKey || !this.scene.textures.exists(animationKey)) continue;

            this.ensureAnimationCreated(animationKey);

            const worldX = this.map.tileToWorldX(entry.tileX);
            const worldY = this.map.tileToWorldY(entry.tileY);
            const x = (worldX ?? (entry.tileX * this.map.tileWidth)) + this.map.tileWidth / 2;
            const y = (worldY ?? (entry.tileY * this.map.tileHeight)) + this.map.tileHeight / 2;
            const sprite = this.scene.add.sprite(x, y, animationKey, 0);
            sprite.setOrigin(0.5, 0.5);
            sprite.setVisible(false);
            sprite.setDepth(this.resolveWaterLayerDepth(entry.targetWaterLayerName));

            this.spritesByTileKey.set(entry.key, sprite);
            this.animationByTileKey.set(entry.key, animationKey);
        }
    }

    setTileWaterState(tileKey: string, wet: boolean): void {
        const sprite = this.spritesByTileKey.get(tileKey);
        if (!sprite) return;

        if (wet) {
            const animation = this.animationByTileKey.get(tileKey);
            if (animation) sprite.play(animation, true);
            sprite.setVisible(true);
            return;
        }

        sprite.stop();
        sprite.setVisible(false);
    }

    private ensureAnimationCreated(animationKey: string): void {
        if (this.scene.anims.exists(animationKey)) return;
        this.scene.anims.create({
            key: animationKey,
            frames: this.scene.anims.generateFrameNumbers(animationKey, { start: 0, end: FLOW_FRAME_COUNT - 1 }),
            frameRate: FLOW_FRAME_RATE,
            repeat: -1,
        });
    }

    /**
     * Resolve render depth for animated overlays from the target water layer.
     * Falls back to depth 0 when the layer is not available.
     */
    private resolveWaterLayerDepth(targetLayerName: string): number {
        const layerData = this.map.layers.find(layer => layer.name === targetLayerName);
        return layerData?.tilemapLayer?.depth ?? 0;
    }
}
