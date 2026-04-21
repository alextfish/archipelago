/**
 * Manages the per-constraint visual feedback that appears whenever all bridges
 * are placed in a puzzle.
 *
 * For each ConstraintDisplayItem an NPC sprite and a small speech bubble
 * (at 1x zoom, i.e. 32 px per tile) are created just above and to the right of
 * the constrained island.  The speech bubble shows a "good" glyph when the
 * constraint is satisfied, or the appropriate violation glyphs otherwise.
 *
 * Pure view logic — no game model changes happen here.
 */

import Phaser from 'phaser';
import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { ConstraintDisplayItem } from '@model/puzzle/constraints/ConstraintDisplayItem';
import type { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';
import { SpeechBubble, type BubbleDirection } from './conversation/SpeechBubble';
import type { GridToWorldMapper } from './GridToWorldMapper';
import type { ActiveGlyphTracker } from '@model/translation/ActiveGlyphTracker';
import { SpeechBubblePlacer, type BubbleRequest } from '@model/puzzle/SpeechBubblePlacer';
import type { Point } from '@model/puzzle/Point';
import { getNPCSpriteKey } from './NPCSpriteHelper';

export class ConstraintFeedbackDisplay {
  private scene: Phaser.Scene;
  private gridMapper: GridToWorldMapper;
  private glyphRegistry: LanguageGlyphRegistry;
  private tilesetKey: string;
  // @ts-expect-error TS6133: stored for future use, not yet read
  private npcSpriteKey: string;
  private language: string;
  private depth: number;
  private existingNPCSprites: Map<string, Phaser.GameObjects.Sprite>;

  private originalNPCTextures: Map<string, string> = new Map();
  private speechBubbles: SpeechBubble[] = [];
  private glyphTracker: ActiveGlyphTracker | null = null;

  constructor(
    scene: Phaser.Scene,
    gridMapper: GridToWorldMapper,
    glyphRegistry: LanguageGlyphRegistry,
    tilesetKey: string,
    npcSpriteKey: string,
    existingNPCSprites: Map<string, Phaser.GameObjects.Sprite> = new Map(),
    language: string = 'grass',
    depth: number = 200,
  ) {
    this.scene = scene;
    this.gridMapper = gridMapper;
    this.glyphRegistry = glyphRegistry;
    this.tilesetKey = tilesetKey;
    this.npcSpriteKey = npcSpriteKey;
    this.existingNPCSprites = existingNPCSprites;
    this.language = language;
    this.depth = depth;
  }

  setGlyphTracker(tracker: ActiveGlyphTracker): void {
    this.glyphTracker = tracker;
  }

  /**
   * Show or update the feedback for the given display items.
   * Updates existing NPC sprite expressions and creates speech bubbles.
   * Uses SpeechBubblePlacer to find non-overlapping positions for the bubbles.
   */
  update(items: ConstraintDisplayItem[], puzzle: BridgePuzzle): void {
    this.clear();

    if (items.length === 0) return;

    // First pass: resolve islands and parse glyphs so we can build placer requests.
    type ItemData = {
      item: ConstraintDisplayItem;
      npcGridPos: { x: number; y: number };
      glyphFrames: number[];
    };
    const itemData: ItemData[] = [];
    const requests: BubbleRequest[] = [];

    for (const item of items) {
      let npcGridPos: { x: number; y: number };
      if (item.position) {
        // Bridge-based constraint: use the supplied grid position directly
        npcGridPos = item.position;
      } else {
        const island = puzzle.islands.find(i => i.id === item.elementID);
        if (!island) continue;
        npcGridPos = { x: island.x, y: island.y };
      }
      const glyphFrames = this.glyphRegistry.parseGlyphs(this.language, item.glyphMessage);
      itemData.push({ item, npcGridPos, glyphFrames });
      requests.push({ npcPosition: npcGridPos, width: glyphFrames.length });
    }

    if (itemData.length === 0) return;

    // Use SpeechBubblePlacer to find non-overlapping bubble positions.
    const placements = new SpeechBubblePlacer(puzzle, requests).place();

    // Second pass: create NPC expressions and positioned speech bubbles.
    for (let i = 0; i < itemData.length; i++) {
      const { item, glyphFrames } = itemData[i];
      const placement = placements[i];

      // Update existing NPC sprite texture to show appropriate expression
      const isSatisfied = item.glyphMessage.trim() === 'good';
      const existingNPC = this.existingNPCSprites.get(item.elementID);
      if (existingNPC) {
        // Save original texture if not already saved
        if (!this.originalNPCTextures.has(item.elementID)) {
          this.originalNPCTextures.set(item.elementID, existingNPC.texture.key);
        }

        // Choose NPC sprite based on constraint type
        const baseSprite = getNPCSpriteKey(item.constraintType);
        const spriteKey = isSatisfied ? `${baseSprite} happy` : `${baseSprite} frown`;
        existingNPC.setTexture(spriteKey, 0);
      }

      // Decide which side of the bubble has the arrow (i.e. faces the NPC).
      const direction = bubbleDirection(placement.topLeft, placement.npcPosition);

      // The placer's topLeft is the content (glyph) area; the rendered bubble has a
      // 1-tile border on every side, so the container sits 1 tile up and left.
      const containerWorld = this.gridMapper.gridToWorld(
        placement.topLeft.x - 1,
        placement.topLeft.y - 1,
      );

      const bubble = new SpeechBubble(this.scene, this.tilesetKey);
      if (this.glyphTracker) {
        bubble.setGlyphTracker(this.glyphTracker);
      }
      bubble.create([glyphFrames], this.language, this.glyphRegistry, 1, direction);
      bubble.setPosition(containerWorld.x, containerWorld.y);
      bubble.setDepth(this.depth + 1);
      this.speechBubbles.push(bubble);
    }
  }

  /** Hide speech bubbles and restore original NPC textures. */
  setVisible(visible: boolean): void {
    if (!visible) {
      // Restore original NPC textures when hiding
      for (const [islandId, originalTexture] of this.originalNPCTextures) {
        const npc = this.existingNPCSprites.get(islandId);
        if (npc) {
          npc.setTexture(originalTexture, 0);
        }
      }
      this.originalNPCTextures.clear();
    }

    for (const bubble of this.speechBubbles) {
      bubble.setVisible(visible);
    }
  }

  /** Destroy speech bubbles and restore original NPC textures. */
  clear(): void {
    // Restore original NPC textures
    for (const [islandId, originalTexture] of this.originalNPCTextures) {
      const npc = this.existingNPCSprites.get(islandId);
      if (npc) {
        npc.setTexture(originalTexture, 0);
      }
    }
    this.originalNPCTextures.clear();

    // Destroy speech bubbles
    for (const bubble of this.speechBubbles) {
      bubble.destroy();
    }
    this.speechBubbles = [];
  }

  /** Alias for clear — called when the puzzle session ends. */
  destroy(): void {
    this.clear();
  }
}

/**
 * Derive which side of the speech bubble should show the directional arrow,
 * based on the bubble's content top-left position relative to the NPC.
 */
function bubbleDirection(topLeft: Point, npcPosition: Point): BubbleDirection {
  if (topLeft.y < npcPosition.y) return 'above';
  if (topLeft.y > npcPosition.y) return 'below';
  if (topLeft.x > npcPosition.x) return 'right';
  return 'left';
}
