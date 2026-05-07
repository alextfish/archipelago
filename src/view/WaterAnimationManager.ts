import Phaser from 'phaser';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { WaterDirectionReader } from '@model/overworld/WaterDirectionReader';
import { WaterFlowAnimationCalculator } from '@model/overworld/WaterFlowAnimationCalculator';
import type { GridKey } from '@model/puzzle/FlowTypes';
import { gridKey } from '@model/puzzle/FlowTypes';

const WATER_ANIMATION_FRAME_WIDTH = 32;
const WATER_ANIMATION_FRAME_HEIGHT = 32;
const WATER_ANIMATION_LAST_FRAME = 5;
const WATER_ANIMATION_FRAME_RATE = 10;

/**
 * Replaces static water-direction tiles with animated water sprites.
 */
export class WaterAnimationManager {
  private readonly scene: Phaser.Scene;
  private readonly map: Phaser.Tilemaps.Tilemap;
  private readonly tileSpritesByKey: Map<GridKey, Phaser.GameObjects.Sprite[]> = new Map();

  constructor(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap, tiledMapData: any) {
    this.scene = scene;
    this.map = map;

    const waterTiles = WaterDirectionReader.readFromTiledMapData(tiledMapData);
    const animationByTile = WaterFlowAnimationCalculator.calculateAnimationByTile(waterTiles);
    this.createSprites(animationByTile);
  }

  static preloadAll(scene: Phaser.Scene): void {
    for (const animationKey of WaterFlowAnimationCalculator.allAnimationKeys()) {
      if (scene.textures.exists(animationKey)) continue;
      scene.load.spritesheet(animationKey, `resources/tilesets/flow/${animationKey}.png`, {
        frameWidth: WATER_ANIMATION_FRAME_WIDTH,
        frameHeight: WATER_ANIMATION_FRAME_HEIGHT
      });
    }
  }

  hasAnimationAt(tileX: number, tileY: number): boolean {
    return this.tileSpritesByKey.has(gridKey(tileX, tileY));
  }

  setTileVisible(tileX: number, tileY: number, visible: boolean): void {
    const sprites = this.tileSpritesByKey.get(gridKey(tileX, tileY));
    if (!sprites) return;
    for (const sprite of sprites) {
      sprite.setVisible(visible);
    }
  }

  private createSprites(animationByTile: Map<GridKey, string>): void {
    const waterLayers = this.map.layers.filter(l =>
      l.tilemapLayer && TiledLayerUtils.getLayerSuffix(l.name) === 'water'
    );

    for (const layerData of waterLayers) {
      const layer = layerData.tilemapLayer!;
      const depth = layer.depth;

      for (let tileY = 0; tileY < this.map.height; tileY++) {
        for (let tileX = 0; tileX < this.map.width; tileX++) {
          const key = gridKey(tileX, tileY);
          const animationKey = animationByTile.get(key);
          if (!animationKey) continue;

          const tile = layer.getTileAt(tileX, tileY);
          if (!tile || tile.index < 0) continue;

          this.ensureAnimationExists(animationKey);
          const worldPoint = layer.tileToWorldXY(tileX, tileY);
          const sprite = this.scene.add.sprite(
            worldPoint.x + this.map.tileWidth / 2,
            worldPoint.y + this.map.tileHeight / 2,
            animationKey,
            0
          );
          sprite.setDepth(depth);
          sprite.play(animationKey);

          const list = this.tileSpritesByKey.get(key) ?? [];
          list.push(sprite);
          this.tileSpritesByKey.set(key, list);

          layer.removeTileAt(tileX, tileY);
        }
      }
    }
  }

  private ensureAnimationExists(animationKey: string): void {
    if (this.scene.anims.exists(animationKey)) return;
    this.scene.anims.create({
      key: animationKey,
      frames: this.scene.anims.generateFrameNumbers(animationKey, { start: 0, end: WATER_ANIMATION_LAST_FRAME }),
      frameRate: WATER_ANIMATION_FRAME_RATE,
      repeat: -1
    });
  }
}
