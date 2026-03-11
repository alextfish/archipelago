import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConstraintFeedbackDisplay } from '@view/ConstraintFeedbackDisplay';
import { GridToWorldMapper } from '@view/GridToWorldMapper';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { ConstraintDisplayItem } from '@model/puzzle/constraints/ConstraintDisplayItem';

/**
 * Build a minimal Phaser scene mock adequate for ConstraintFeedbackDisplay tests.
 */
function makeMockScene() {
  const sprite = {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };

  const container = {
    setDepth: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setSize: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    add: vi.fn(),
    destroy: vi.fn(),
    list: [],
  };

  const image = {
    setOrigin: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };

  return {
    add: {
      sprite: vi.fn(() => ({ ...sprite })),
      container: vi.fn(() => ({ ...container })),
      image: vi.fn(() => ({ ...image })),
    },
    _sprite: sprite,
    _container: container,
  };
}

function makeMockPuzzle(islands: { id: string; x: number; y: number }[]): BridgePuzzle {
  return {
    islands,
    bridges: [],
    bridgesFromIsland: () => [],
    allBridgesPlaced: () => true,
  } as unknown as BridgePuzzle;
}

describe('ConstraintFeedbackDisplay', () => {
  let mockScene: ReturnType<typeof makeMockScene>;
  let gridMapper: GridToWorldMapper;
  let glyphRegistry: LanguageGlyphRegistry;
  let display: ConstraintFeedbackDisplay;

  beforeEach(() => {
    mockScene = makeMockScene();
    gridMapper = new GridToWorldMapper(32);
    glyphRegistry = new LanguageGlyphRegistry();
    display = new ConstraintFeedbackDisplay(
      mockScene as any,
      gridMapper,
      glyphRegistry,
      'language',
      'sailorNS',
    );
  });

  it('creates no sprites when items list is empty', () => {
    const puzzle = makeMockPuzzle([]);
    display.update([], puzzle);

    expect(mockScene.add.sprite).not.toHaveBeenCalled();
  });

  it('creates one NPC sprite per display item', () => {
    const puzzle = makeMockPuzzle([
      { id: 'A', x: 1, y: 1 },
      { id: 'B', x: 3, y: 1 },
    ]);
    const items: ConstraintDisplayItem[] = [
      { elementID: 'A', glyphMessage: 'good' },
      { elementID: 'B', glyphMessage: 'not-enough bridge' },
    ];

    display.update(items, puzzle);

    expect(mockScene.add.sprite).toHaveBeenCalledTimes(2);
  });

  it('positions the NPC sprite just to the right of the island', () => {
    const cellSize = 32;
    const islandX = 2;
    const islandY = 3;
    const puzzle = makeMockPuzzle([{ id: 'A', x: islandX, y: islandY }]);
    const items: ConstraintDisplayItem[] = [{ elementID: 'A', glyphMessage: 'good' }];

    display.update(items, puzzle);

    const worldX = islandX * cellSize; // gridToWorld
    const worldY = islandY * cellSize;
    expect(mockScene.add.sprite).toHaveBeenCalledWith(
      worldX + cellSize,
      worldY,
      'sailorNS',
      0,
    );
  });

  it('creates a speech bubble container for each display item', () => {
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    const items: ConstraintDisplayItem[] = [{ elementID: 'A', glyphMessage: 'good' }];

    display.update(items, puzzle);

    // SpeechBubble creates a container internally
    expect(mockScene.add.container).toHaveBeenCalled();
  });

  it('skips items whose elementID does not match any island', () => {
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    const items: ConstraintDisplayItem[] = [
      { elementID: 'MISSING', glyphMessage: 'good' },
    ];

    display.update(items, puzzle);

    expect(mockScene.add.sprite).not.toHaveBeenCalled();
  });

  it('clears previous sprites when update is called again', () => {
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    const items: ConstraintDisplayItem[] = [{ elementID: 'A', glyphMessage: 'good' }];

    display.update(items, puzzle);
    const firstSpriteCount = mockScene.add.sprite.mock.calls.length;

    display.update(items, puzzle);
    const secondSpriteCount = mockScene.add.sprite.mock.calls.length;

    // Second call should create the same number of new sprites (after clearing old ones)
    expect(secondSpriteCount).toBe(firstSpriteCount * 2);
  });

  it('hides all sprites and bubbles when setVisible(false) is called', () => {
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    display.update([{ elementID: 'A', glyphMessage: 'good' }], puzzle);

    display.setVisible(false);

    // All created sprites should have had setVisible(false) called
    const spriteMocks = mockScene.add.sprite.mock.results.map((r: any) => r.value);
    for (const s of spriteMocks) {
      expect(s.setVisible).toHaveBeenCalledWith(false);
    }
  });

  it('destroys all sprites when clear() is called', () => {
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    display.update([{ elementID: 'A', glyphMessage: 'good' }], puzzle);

    display.clear();

    const spriteMocks = mockScene.add.sprite.mock.results.map((r: any) => r.value);
    for (const s of spriteMocks) {
      expect(s.destroy).toHaveBeenCalled();
    }
  });
});
