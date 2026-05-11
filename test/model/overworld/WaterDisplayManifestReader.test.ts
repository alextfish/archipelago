import { describe, expect, it } from 'vitest';
import { WaterDisplayManifestReader } from '@model/overworld/WaterDisplayManifestReader';

describe('WaterDisplayManifestReader', () => {
  it('pairs sibling waterflow/water layers and sets animation metadata from visual water tiles', () => {
    const tiledMapData = {
      width: 2,
      height: 1,
      layers: [{
        name: 'River',
        type: 'group',
        layers: [
          { name: 'water', type: 'tilelayer', data: [0, 201] },
          { name: 'waterflow', type: 'tilelayer', data: [201, 201] },
        ],
      }],
      tilesets: [
        {
          firstgid: 100,
          name: 'water',
          image: 'tilesets/water.png',
          tilecount: 3,
          tiles: [],
        },
        {
          firstgid: 201,
          name: 'water directions',
          tiles: [{
            id: 0,
            properties: [{ name: 'flowEast', type: 'bool', value: true }],
          }],
        },
      ],
    };

    const manifest = WaterDisplayManifestReader.build(tiledMapData);
    const tile0 = manifest.entries.get('0,0');
    const tile1 = manifest.entries.get('1,0');

    expect(tile0).toBeDefined();
    expect(tile1).toBeDefined();
    expect(tile0?.targetWaterLayerName).toBe('River/water');
    expect(tile1?.targetWaterLayerName).toBe('River/water');
    expect(tile1?.visualGID).toBe(201);
    expect(tile1?.visualHasFlowDirections).toBe(true);
    expect(tile0?.fallbackWaterGID).toBeGreaterThanOrEqual(100);
    expect(tile0?.fallbackWaterGID).toBeLessThanOrEqual(102);
  });

  it('chooses a stable fallback water GID for the same tile across reads', () => {
    const tiledMapData = {
      width: 1,
      height: 1,
      layers: [{
        name: 'River',
        type: 'group',
        layers: [
          { name: 'water', type: 'tilelayer', data: [0] },
          { name: 'waterflow', type: 'tilelayer', data: [201] },
        ],
      }],
      tilesets: [
        {
          firstgid: 50,
          name: 'water',
          image: 'tilesets/water.png',
          tilecount: 4,
          tiles: [],
        },
        {
          firstgid: 201,
          name: 'water directions',
          tiles: [{
            id: 0,
            properties: [{ name: 'flowSouth', type: 'bool', value: true }],
          }],
        },
      ],
    };

    const first = WaterDisplayManifestReader.build(tiledMapData).entries.get('0,0');
    const second = WaterDisplayManifestReader.build(tiledMapData).entries.get('0,0');
    expect(first?.fallbackWaterGID).toBeDefined();
    expect(first?.fallbackWaterGID).toBe(second?.fallbackWaterGID);
  });
});
