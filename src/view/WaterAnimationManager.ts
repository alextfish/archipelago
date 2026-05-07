import Phaser from 'phaser';
import { gridKey, parseGridKey } from '@model/puzzle/FlowTypes';
import type { GridKey } from '@model/puzzle/FlowTypes';
import type { WaterTileAnimationPlan } from '@model/overworld/WaterFlowAnimationCalculator';

/**
 * Manages animated overworld-water sprites.
 *
 * Unlike the previous static directional-tile overlay, this manager renders
 * animated water frames only. The crude directional tiles from
 * `water directions.png` should remain hidden while high water is shown.
 */
export class WaterAnimationManager {
    /** Animated 32x32 water spritesheet key loaded in OverworldScene.preload(). */
    static readonly TEXTURE_KEY = 'water-animated';

    private readonly sprites: Map<GridKey, Phaser.GameObjects.Sprite>;

    /**
     * @param scene              The Phaser scene.
     * @param tileSize           Width and height of one world tile in pixels.
     * @param animationPlanByTile Per-tile animation plan from WaterFlowAnimationCalculator.
     * @param layerDepthByTile   Depth to use per tile (must match owning water layer).
     */
    constructor(
        scene: Phaser.Scene,
        tileSize: number,
        animationPlanByTile: ReadonlyMap<GridKey, WaterTileAnimationPlan>,
        layerDepthByTile: ReadonlyMap<GridKey, number>,
    ) {
        this.sprites = new Map<GridKey, Phaser.GameObjects.Sprite>();

        this.registerAnimations(scene, animationPlanByTile);

        for (const [key, plan] of animationPlanByTile.entries()) {
            const { x, y } = parseGridKey(key);
            const worldX = x * tileSize + tileSize / 2;
            const worldY = y * tileSize + tileSize / 2;
            const depth = layerDepthByTile.get(key) ?? 1;

            const sprite = scene.add.sprite(worldX, worldY, WaterAnimationManager.TEXTURE_KEY, plan.frameSequence[0]);
            sprite.setDepth(depth);
            sprite.play(plan.animationKey);
            sprite.setVisible(true);
            this.sprites.set(key, sprite);
        }
    }

    /**
     * Show or hide the animated water sprite for the tile at (tileX, tileY).
     */
    setWaterVisible(tileX: number, tileY: number, visible: boolean): void {
        const key = gridKey(tileX, tileY);
        const sprite = this.sprites.get(key);
        if (!sprite) return;
        sprite.setVisible(visible);
        if (visible) {
            if (!sprite.anims.isPlaying) sprite.anims.resume();
        } else {
            sprite.anims.pause();
        }
    }

    /** Destroy all managed sprites. */
    destroy(): void {
        for (const sprite of this.sprites.values()) {
            sprite.destroy();
        }
        this.sprites.clear();
    }

    private registerAnimations(
        scene: Phaser.Scene,
        animationPlanByTile: ReadonlyMap<GridKey, WaterTileAnimationPlan>,
    ): void {
        const seen = new Set<string>();

        for (const plan of animationPlanByTile.values()) {
            if (seen.has(plan.animationKey)) continue;
            seen.add(plan.animationKey);

            if (scene.anims.exists(plan.animationKey)) continue;

            scene.anims.create({
                key: plan.animationKey,
                frames: plan.frameSequence.map((frame) => ({ key: WaterAnimationManager.TEXTURE_KEY, frame })),
                frameRate: 6,
                repeat: -1,
            });
        }
    }
}
