import { describe, expect, it } from 'vitest';
import { MapPuzzleExtractor } from '@model/overworld/MapPuzzleExtractor';
import { defaultTileConfig } from '@model/overworld/MapConfig';

describe('MapPuzzleExtractor flow-square extraction', () => {
  it('reads FlowPuzzle squares from sibling waterflow layer instead of water layer', () => {
    const extractor = new MapPuzzleExtractor(defaultTileConfig);
    const tiledMap = {
      width: 2,
      height: 1,
      tilewidth: 32,
      tileheight: 32,
      layers: [{
        name: 'River',
        type: 'group',
        layers: [
          { name: 'water', type: 'tilelayer', data: [0, 11] },
          { name: 'waterflow', type: 'tilelayer', data: [11, 0] },
        ],
      }],
      tilesets: [{
        firstgid: 11,
        name: 'water directions',
        tiles: [{
          id: 0,
          properties: [{ name: 'flowEast', type: 'bool', value: true }],
        }],
      }],
    };

    const puzzle = extractor.createFlowPuzzle(
      {
        id: 'flow-test',
        regionGroup: 'River',
        bounds: { x: 0, y: 0, width: 64, height: 32 },
        metadata: {},
      },
      tiledMap as any
    );

    expect(puzzle.getFlowSquare(0, 0)).toBeDefined();
    expect(puzzle.getFlowSquare(1, 0)).toBeUndefined();
  });
});
