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
      sprite: vi.fn(),
      container: vi.fn(() => ({ ...container })),
      image: vi.fn(() => ({ ...image })),
    },
    _container: container,
  };
}

/** Build a mock NPC sprite with the given initial texture key. */
function makeMockNPCSprite(initialTextureKey: string) {
  return {
    texture: { key: initialTextureKey },
    setTexture: vi.fn().mockImplementation(function (this: { texture: { key: string } }, key: string) {
      this.texture.key = key;
      return this;
    }),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
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

  beforeEach(() => {
    mockScene = makeMockScene();
    gridMapper = new GridToWorldMapper(32);
    glyphRegistry = new LanguageGlyphRegistry();
  });

  function makeDisplay(existingNPCSprites?: Map<string, ReturnType<typeof makeMockNPCSprite>>) {
    return new ConstraintFeedbackDisplay(
      mockScene as any,
      gridMapper,
      glyphRegistry,
      'language',
      'sailorNS',
      existingNPCSprites as unknown as Map<string, Phaser.GameObjects.Sprite>,
    );
  }

  it('does not create any NPC sprites when items list is empty', () => {
    const display = makeDisplay();
    display.update([], makeMockPuzzle([]));

    expect(mockScene.add.sprite).not.toHaveBeenCalled();
  });

  it('does not create new NPC sprites even when items have matching islands', () => {
    const display = makeDisplay();
    const puzzle = makeMockPuzzle([
      { id: 'A', x: 1, y: 1 },
      { id: 'B', x: 3, y: 1 },
    ]);
    const items: ConstraintDisplayItem[] = [
      { elementID: 'A', glyphMessage: 'good' },
      { elementID: 'B', glyphMessage: 'not-enough bridge' },
    ];

    display.update(items, puzzle);

    expect(mockScene.add.sprite).not.toHaveBeenCalled();
  });

  it('creates a speech bubble container for each display item', () => {
    const display = makeDisplay();
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    const items: ConstraintDisplayItem[] = [{ elementID: 'A', glyphMessage: 'good' }];

    display.update(items, puzzle);

    expect(mockScene.add.container).toHaveBeenCalled();
  });

  it('skips items whose elementID does not match any island', () => {
    const display = makeDisplay();
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    const items: ConstraintDisplayItem[] = [
      { elementID: 'MISSING', glyphMessage: 'good' },
    ];

    display.update(items, puzzle);

    expect(mockScene.add.sprite).not.toHaveBeenCalled();
    expect(mockScene.add.container).not.toHaveBeenCalled();
  });

  it('changes existing NPC sprite texture to happy when constraint is satisfied', () => {
    const npc = makeMockNPCSprite('Ruby');
    const sprites = new Map([['A', npc]]);
    const display = makeDisplay(sprites);
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    const items: ConstraintDisplayItem[] = [
      { elementID: 'A', glyphMessage: 'good', constraintType: 'IslandBridgeCountConstraint' },
    ];

    display.update(items, puzzle);

    expect(npc.setTexture).toHaveBeenCalledWith('Ruby happy', 0);
  });

  it('changes existing NPC sprite texture to frown when constraint is not satisfied', () => {
    const npc = makeMockNPCSprite('Ruby');
    const sprites = new Map([['A', npc]]);
    const display = makeDisplay(sprites);
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    const items: ConstraintDisplayItem[] = [
      { elementID: 'A', glyphMessage: 'not-enough bridge', constraintType: 'IslandBridgeCountConstraint' },
    ];

    display.update(items, puzzle);

    expect(npc.setTexture).toHaveBeenCalledWith('Ruby frown', 0);
  });

  it('restores original NPC texture when clear() is called', () => {
    const npc = makeMockNPCSprite('Ruby');
    const sprites = new Map([['A', npc]]);
    const display = makeDisplay(sprites);
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);

    display.update([{ elementID: 'A', glyphMessage: 'good', constraintType: 'IslandBridgeCountConstraint' }], puzzle);
    expect(npc.setTexture).toHaveBeenCalledWith('Ruby happy', 0);

    display.clear();

    expect(npc.setTexture).toHaveBeenCalledWith('Ruby', 0);
  });

  it('restores original NPC texture when setVisible(false) is called', () => {
    const npc = makeMockNPCSprite('Ruby');
    const sprites = new Map([['A', npc]]);
    const display = makeDisplay(sprites);
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);

    display.update([{ elementID: 'A', glyphMessage: 'good', constraintType: 'IslandBridgeCountConstraint' }], puzzle);

    display.setVisible(false);

    expect(npc.setTexture).toHaveBeenCalledWith('Ruby', 0);
  });

  it('hides speech bubbles when setVisible(false) is called', () => {
    const display = makeDisplay();
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    display.update([{ elementID: 'A', glyphMessage: 'good' }], puzzle);

    const containers = mockScene.add.container.mock.results.map((r: any) => r.value);
    expect(containers.length).toBeGreaterThan(0);

    display.setVisible(false);

    for (const c of containers) {
      expect(c.setVisible).toHaveBeenCalledWith(false);
    }
  });

  it('destroys speech bubbles when clear() is called', () => {
    const display = makeDisplay();
    const puzzle = makeMockPuzzle([{ id: 'A', x: 1, y: 1 }]);
    display.update([{ elementID: 'A', glyphMessage: 'good' }], puzzle);

    const containers = mockScene.add.container.mock.results.map((r: any) => r.value);
    expect(containers.length).toBeGreaterThan(0);

    display.clear();

    for (const c of containers) {
      expect(c.destroy).toHaveBeenCalled();
    }
  });
});

