import { describe, expect, it, vi } from 'vitest';
import { FlowWaterVisualManager } from '@view/FlowWaterVisualManager';
import type { WaterDisplayManifest } from '@model/overworld/WaterDisplayManifestReader';
import { CollisionType } from '@model/overworld/CollisionTypes';

describe('FlowWaterVisualManager water display composition', () => {
  const makeManager = (manifest: WaterDisplayManifest, putTileAt = vi.fn(), removeTileAt = vi.fn()) => {
    const map = {
      layers: [{
        name: 'River/water',
        tilemapLayer: {
          putTileAt,
          removeTileAt,
        },
      }],
    } as any;

    const animationManager = {
      setTileWaterState: vi.fn(),
    } as any;

    const manager = new FlowWaterVisualManager(
      map,
      { tilewidth: 32, tileheight: 32 },
      manifest,
      new Map(),
      () => CollisionType.WALKABLE,
      () => { },
      () => false,
      animationManager
    );

    return { manager, putTileAt, removeTileAt, animationManager };
  };

  it('renders animated, static authored, and fallback-generated wet tiles', () => {
    const manifest: WaterDisplayManifest = {
      entries: new Map([
        ['0,0', {
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
        }],
        ['1,0', {
          key: '1,0',
          tileX: 1,
          tileY: 0,
          logicLayerName: 'River/waterflow',
          targetWaterLayerName: 'River/water',
          logicOutgoing: [],
          visualGID: 42,
          visualOutgoing: [],
          visualHasFlowDirections: false,
          visualIsDirectionOnly: false,
          fallbackWaterGID: undefined,
        }],
        ['2,0', {
          key: '2,0',
          tileX: 2,
          tileY: 0,
          logicLayerName: 'River/waterflow',
          targetWaterLayerName: 'River/water',
          logicOutgoing: [],
          visualGID: undefined,
          visualOutgoing: [],
          visualHasFlowDirections: false,
          visualIsDirectionOnly: false,
          fallbackWaterGID: 51,
        }],
      ]),
    };

    const { manager, putTileAt, animationManager } = makeManager(manifest);

    manager.updateSingleFlowTileVisual(0, 0, true);
    manager.updateSingleFlowTileVisual(1, 0, true);
    manager.updateSingleFlowTileVisual(2, 0, true);

    expect(putTileAt).toHaveBeenNthCalledWith(1, 50, 0, 0);
    expect(putTileAt).toHaveBeenNthCalledWith(2, 42, 1, 0);
    expect(putTileAt).toHaveBeenNthCalledWith(3, 51, 2, 0);
    expect(animationManager.setTileWaterState).toHaveBeenCalledWith('0,0', true);
    expect(animationManager.setTileWaterState).toHaveBeenCalledWith('1,0', false);
    expect(animationManager.setTileWaterState).toHaveBeenCalledWith('2,0', false);
  });

  it('clears rendered tile and hides animation when a tile dries', () => {
    const manifest: WaterDisplayManifest = {
      entries: new Map([['0,0', {
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
      }]]),
    };

    const { manager, removeTileAt, animationManager } = makeManager(manifest);
    manager.updateSingleFlowTileVisual(0, 0, false);

    expect(removeTileAt).toHaveBeenCalledWith(0, 0);
    expect(animationManager.setTileWaterState).toHaveBeenCalledWith('0,0', false);
  });
});
