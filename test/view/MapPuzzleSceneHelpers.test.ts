import { describe, expect, it } from 'vitest';
import { isPuzzleEntryTileOnLayer } from '@view/MapPuzzleSceneHelpers';

describe('MapPuzzleSceneHelpers', () => {
  it('finds puzzle entry tiles on a rendered layer', () => {
    const layer = {
      name: 'ground',
      tilemapLayer: {
        getTileAt: (tileX: number, tileY: number) => tileX === 2 && tileY === 3
          ? { properties: { puzzleStart: true } }
          : null,
      },
    };

    expect(isPuzzleEntryTileOnLayer(layer, 2, 3)).toBe(true);
    expect(isPuzzleEntryTileOnLayer(layer, 1, 1)).toBe(false);
  });

  it('finds puzzle entry tiles on an unrendered puzzleTiles layer', () => {
    const layer = {
      name: 'puzzleTiles',
      data: [
        [null, null],
        [null, { properties: { puzzleStart: true } }],
      ],
    };

    expect(isPuzzleEntryTileOnLayer(layer, 1, 1)).toBe(true);
  });

  it('ignores unrendered layers that are not supported puzzle-entry sources', () => {
    const layer = {
      name: 'walls',
      data: [
        [{ properties: { puzzleStart: true } }],
      ],
    };

    expect(isPuzzleEntryTileOnLayer(layer, 0, 0)).toBe(false);
  });
});