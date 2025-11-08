import { describe, it, expect } from 'vitest';
import { GridToWorldMapper } from '../../view/GridToWorldMapper';

describe('GridToWorldMapper', () => {
  it('maps (0,0) to world position with no offset', () => {
    const mapper = new GridToWorldMapper(32);
    const pos = mapper.gridToWorld(0, 0);
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it('maps grid (3,3) with cell size 32 to (96, 96)', () => {
    const mapper = new GridToWorldMapper(32);
    const pos = mapper.gridToWorld(3, 3);
    expect(pos).toEqual({ x: 96, y: 96 });
  });

  it('applies camera offset correctly', () => {
    const mapper = new GridToWorldMapper(32, { offsetX: 50, offsetY: 100 });
    const pos = mapper.gridToWorld(2, 2);
    expect(pos).toEqual({ x: 114, y: 164 });
  });

  it('reverses gridToWorld with worldToGrid', () => {
    const mapper = new GridToWorldMapper(32, { offsetX: 10, offsetY: 20 });
    const gridPos = { x: 5, y: 7 };
    const worldPos = mapper.gridToWorld(gridPos.x, gridPos.y);
    const backToGrid = mapper.worldToGrid(worldPos.x, worldPos.y);
    expect(backToGrid).toEqual(gridPos);
  });

  it('handles negative grid coordinates', () => {
    const mapper = new GridToWorldMapper(32);
    const pos = mapper.gridToWorld(-2, -3);
    expect(pos).toEqual({ x: -64, y: -96 });
  });

  it('handles large grid coordinates', () => {
    const mapper = new GridToWorldMapper(50);
    const pos = mapper.gridToWorld(100, 100);
    expect(pos).toEqual({ x: 5000, y: 5000 });
  });

  it('worldToGrid correctly converts with offset', () => {
    const mapper = new GridToWorldMapper(32, { offsetX: 100, offsetY: 50 });
    const gridPos = mapper.worldToGrid(196, 178);
    expect(gridPos).toEqual({ x: 3, y: 4 });
  });

  it('getCellSize returns correct size', () => {
    const mapper = new GridToWorldMapper(50);
    expect(mapper.getCellSize()).toBe(50);
  });

  it('setCameraOffset updates offset', () => {
    const mapper = new GridToWorldMapper(32);
    mapper.setCameraOffset(100, 200);
    const pos = mapper.gridToWorld(1, 1);
    expect(pos).toEqual({ x: 132, y: 232 });
  });
});
