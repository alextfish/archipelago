import { describe, expect, it, vi } from 'vitest';
import { WaterAnimationManager } from '@view/WaterAnimationManager';
import type { WaterDisplayManifestTile } from '@model/overworld/WaterDisplayManifestReader';

interface SpriteDouble {
  setOrigin: ReturnType<typeof vi.fn>;
  setVisible: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

describe('WaterAnimationManager', () => {
  it('sets animation sprite depth to the target water layer depth', () => {
    const createdSprites: SpriteDouble[] = [];
    const spriteFactory = (): SpriteDouble => {
      const sprite: SpriteDouble = {
        setOrigin: vi.fn(),
        setVisible: vi.fn(),
        setDepth: vi.fn(),
        play: vi.fn(),
        stop: vi.fn(),
      };
      createdSprites.push(sprite);
      return sprite;
    };

    const scene = {
      textures: { exists: vi.fn().mockReturnValue(true) },
      anims: {
        exists: vi.fn().mockReturnValue(false),
        create: vi.fn(),
        generateFrameNumbers: vi.fn().mockReturnValue([]),
      },
      add: {
        sprite: vi.fn().mockImplementation(spriteFactory),
      },
    } as any;

    const map = {
      tileWidth: 32,
      tileHeight: 32,
      tileToWorldX: vi.fn().mockReturnValue(0),
      tileToWorldY: vi.fn().mockReturnValue(0),
      layers: [
        { name: 'River/water', tilemapLayer: { depth: 7 } },
      ],
    } as any;

    const entry: WaterDisplayManifestTile = {
      key: '0,0',
      tileX: 0,
      tileY: 0,
      logicLayerName: 'River/waterflow',
      targetWaterLayerName: 'River/water',
      logicOutgoing: ['E'],
      visualGID: 201,
      visualOutgoing: ['E'],
      visualHasFlowDirections: true,
      visualIsDirectionOnly: true,
      fallbackWaterGID: 50,
    };

    new WaterAnimationManager(scene, map, [entry]);
    expect(createdSprites[0].setDepth).toHaveBeenCalledWith(7);
  });
});
