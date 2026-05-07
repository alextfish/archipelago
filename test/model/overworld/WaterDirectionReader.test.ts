import { describe, it, expect } from 'vitest';
import { WaterDirectionReader } from '@model/overworld/WaterDirectionReader';
import { gridKey } from '@model/puzzle/FlowTypes';

describe('WaterDirectionReader', () => {
  it('reads outgoing flow directions from water-layer tile properties', () => {
    const tiledMapData = {
      width: 2,
      height: 1,
      layers: [
        { name: 'Forest/water', type: 'tilelayer', data: [1, 2] }
      ],
      tilesets: [
        {
          firstgid: 1,
          tiles: [
            {
              id: 0,
              properties: [
                { name: 'flowEast', type: 'bool', value: true },
                { name: 'flowNorth', type: 'bool', value: false },
                { name: 'flowSouth', type: 'bool', value: false },
                { name: 'flowWest', type: 'bool', value: false },
                { name: 'source', type: 'bool', value: false }
              ]
            },
            {
              id: 1,
              properties: [
                { name: 'flowEast', type: 'bool', value: false },
                { name: 'flowNorth', type: 'bool', value: false },
                { name: 'flowSouth', type: 'bool', value: false },
                { name: 'flowWest', type: 'bool', value: false },
                { name: 'source', type: 'bool', value: true }
              ]
            }
          ]
        }
      ]
    };

    const result = WaterDirectionReader.readFromTiledMapData(tiledMapData);
    expect(result.size).toBe(2);

    const flowTile = result.get(gridKey(0, 0));
    expect(flowTile?.outgoing).toEqual(['E']);
    expect(flowTile?.isSource).toBe(false);
    expect(flowTile?.layerName).toBe('Forest/water');

    const sourceTile = result.get(gridKey(1, 0));
    expect(sourceTile?.outgoing).toEqual([]);
    expect(sourceTile?.isSource).toBe(true);
  });
});
