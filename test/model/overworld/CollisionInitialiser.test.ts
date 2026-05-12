import { describe, it, expect } from 'vitest';
import { CollisionInitialiser } from '@model/overworld/CollisionInitialiser';
import { CollisionType } from '@model/overworld/CollisionTypes';

/**
 * Construct a minimal tiledMapData object that CollisionInitialiser can scan.
 *
 * The helper lets test cases pass in a flat tile-GID array for the
 * ground / lowground / pontoons layers without constructing the full JSON.
 * Every GID is used as a key into `tilesets` tile properties.
 */
function makeTiledMapData(opts: {
  width: number;
  height: number;
  groundData?: number[];
  lowgroundData?: number[];
  pontoonsData?: number[];
  tilesets?: any[];
  pontoonsLayerName?: string;
} = { width: 3, height: 3 }): any {
  const {
    width,
    height,
    groundData,
    lowgroundData,
    pontoonsData,
    tilesets = [],
    pontoonsLayerName = 'Forest/pontoons',
  } = opts;

  const layers: any[] = [];

  if (groundData) {
    layers.push({
      name: 'Forest/ground',
      type: 'tilelayer',
      data: groundData,
    });
  }
  if (lowgroundData) {
    layers.push({
      name: 'Forest/lowground',
      type: 'tilelayer',
      data: lowgroundData,
    });
  }
  if (pontoonsData) {
    layers.push({
      name: pontoonsLayerName,
      type: 'tilelayer',
      data: pontoonsData,
    });
  }

  return { width, height, layers, tilesets };
}

/** Always-empty collision-layer callback (no Phaser collision tiles). */
const noCollisionTiles = (_x: number, _y: number) => [];

describe('CollisionInitialiser', () => {
  describe('buildCollisionData — basic collision array', () => {
    it('creates a 2-D array of the correct dimensions', () => {
      const { collisionArray } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 4, height: 3 }),
        4,
        3,
        noCollisionTiles,
      );

      expect(collisionArray).toHaveLength(3);
      for (const row of collisionArray) {
        expect(row).toHaveLength(4);
      }
    });

    it('produces WALKABLE tiles when no collision layer data is provided', () => {
      const { collisionArray } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 2 }),
        2,
        2,
        noCollisionTiles,
      );

      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          expect(collisionArray[y][x]).toBe(CollisionType.WALKABLE);
        }
      }
    });

    it('uses BLOCKED tiles returned by the collision-layer callback', () => {
      const { collisionArray } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1 }),
        2,
        1,
        (x, _y) => x === 0 ? [{ properties: { blocked: true } }] : [],
      );

      expect(collisionArray[0][0]).toBe(CollisionType.BLOCKED);
      expect(collisionArray[0][1]).toBe(CollisionType.WALKABLE);
    });
  });

  describe('buildCollisionData — stairs / lowground visual layers', () => {
    it('classifies stairs tiles from the ground visual layer', () => {
      // GID 10 is in position (0,0); tileset says it has stairs=true
      const tilesets = [{
        firstgid: 1,
        tiles: [{ id: 9, properties: [{ name: 'stairs', type: 'bool', value: true }] }],
      }];

      const { collisionArray } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1, groundData: [10, 0], tilesets }),
        2,
        1,
        noCollisionTiles,
      );

      expect(collisionArray[0][0]).toBe(CollisionType.STAIRS);
      expect(collisionArray[0][1]).toBe(CollisionType.WALKABLE);
    });

    it('classifies lowground tiles from the lowground visual layer', () => {
      const tilesets = [{
        firstgid: 1,
        tiles: [{ id: 4, properties: [{ name: 'lowground', type: 'bool', value: true }] }],
      }];

      const { collisionArray } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1, lowgroundData: [5, 0], tilesets }),
        2,
        1,
        noCollisionTiles,
      );

      expect(collisionArray[0][0]).toBe(CollisionType.WALKABLE_LOW);
    });
  });

  describe('buildCollisionData — permanentBlockedTiles', () => {
    it('records permanently-blocked tiles in the returned set', () => {
      const { permanentBlockedTiles } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1 }),
        2,
        1,
        (x, _y) => x === 0 ? [{ properties: { blocked: true } }] : [],
      );

      expect(permanentBlockedTiles.has('0,0')).toBe(true);
      expect(permanentBlockedTiles.has('1,0')).toBe(false);
    });

    it('returns an empty set when there are no blocked tiles', () => {
      const { permanentBlockedTiles } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 2 }),
        2,
        2,
        noCollisionTiles,
      );

      expect(permanentBlockedTiles.size).toBe(0);
    });
  });

  describe('buildCollisionData — pontoon tiles', () => {
    it('registers pontoon tiles from the pontoons layer', () => {
      // GID 20 at position (1,0) — tileset marks it isPontoon=true, isHigh=true, toggleOffset=-2
      const tilesets = [{
        firstgid: 1,
        tiles: [{
          id: 19,
          properties: [
            { name: 'isPontoon', type: 'bool', value: true },
            { name: 'isHigh', type: 'bool', value: true },
            { name: 'toggleOffset', type: 'int', value: -2 },
          ],
        }],
      }];

      const pontoonsData = [0, 20]; // GID 20 at tile (1,0)

      const { pontoonTiles } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1, pontoonsData, tilesets }),
        2,
        1,
        noCollisionTiles,
      );

      expect(pontoonTiles.size).toBe(1);
      const p = pontoonTiles.get('1,0');
      expect(p).toBeDefined();
      expect(p!.tileX).toBe(1);
      expect(p!.tileY).toBe(0);
      expect(p!.isHigh).toBe(true);
      expect(p!.toggleOffset).toBe(-2);
      expect(p!.currentGID).toBe(20);
    });

    it('overrides collision type for a high-water pontoon to WALKABLE', () => {
      const tilesets = [{
        firstgid: 1,
        tiles: [{
          id: 4,
          properties: [
            { name: 'isPontoon', type: 'bool', value: true },
            { name: 'isHigh', type: 'bool', value: true },
            { name: 'toggleOffset', type: 'int', value: -1 },
          ],
        }],
      }];

      const { collisionArray } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1, pontoonsData: [5, 0], tilesets }),
        2,
        1,
        noCollisionTiles,
      );

      // Pontoon at (0,0), isHigh=true → WALKABLE
      expect(collisionArray[0][0]).toBe(CollisionType.WALKABLE);
    });

    it('overrides collision type for a low-water pontoon to WALKABLE_LOW', () => {
      const tilesets = [{
        firstgid: 1,
        tiles: [{
          id: 4,
          properties: [
            { name: 'isPontoon', type: 'bool', value: true },
            { name: 'isHigh', type: 'bool', value: false },
            { name: 'toggleOffset', type: 'int', value: 1 },
          ],
        }],
      }];

      const { collisionArray } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1, pontoonsData: [5, 0], tilesets }),
        2,
        1,
        noCollisionTiles,
      );

      // Pontoon at (0,0), isHigh=false → WALKABLE_LOW
      expect(collisionArray[0][0]).toBe(CollisionType.WALKABLE_LOW);
    });

    it('ignores tiles without isPontoon=true property', () => {
      const tilesets = [{
        firstgid: 1,
        tiles: [{ id: 9, properties: [{ name: 'someOtherProp', type: 'bool', value: true }] }],
      }];

      const { pontoonTiles } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 1, pontoonsData: [10, 0], tilesets }),
        2,
        1,
        noCollisionTiles,
      );

      expect(pontoonTiles.size).toBe(0);
    });
  });

  describe('buildCollisionData — empty / missing data', () => {
    it('handles empty tiledMapData gracefully', () => {
      expect(() =>
        CollisionInitialiser.buildCollisionData({}, 2, 2, noCollisionTiles)
      ).not.toThrow();
    });

    it('handles undefined tiledMapData gracefully', () => {
      expect(() =>
        CollisionInitialiser.buildCollisionData(undefined, 2, 2, noCollisionTiles)
      ).not.toThrow();
    });

    it('returns empty pontoonTiles when no pontoons layer exists', () => {
      const { pontoonTiles } = CollisionInitialiser.buildCollisionData(
        makeTiledMapData({ width: 2, height: 2 }),
        2,
        2,
        noCollisionTiles,
      );

      expect(pontoonTiles.size).toBe(0);
    });
  });
});
