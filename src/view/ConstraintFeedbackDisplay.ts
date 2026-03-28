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
import { SpeechBubble } from './conversation/SpeechBubble';
import type { GridToWorldMapper } from './GridToWorldMapper';

/** Height of a speech bubble in pixels at 1x zoom (3 tile rows × 32 px). */
const BUBBLE_TILE_HEIGHT = 3;
const TILE_SIZE = 32;

export class ConstraintFeedbackDisplay {
  private scene: Phaser.Scene;
  private gridMapper: GridToWorldMapper;
  private glyphRegistry: LanguageGlyphRegistry;
  private tilesetKey: string;
  private npcSpriteKey: string;
  private language: string;
  private depth: number;

  private npcSprites: Phaser.GameObjects.Sprite[] = [];
  private speechBubbles: SpeechBubble[] = [];

  constructor(
    scene: Phaser.Scene,
    gridMapper: GridToWorldMapper,
    glyphRegistry: LanguageGlyphRegistry,
    tilesetKey: string,
    npcSpriteKey: string,
    language: string = 'grass',
    depth: number = 200,
  ) {
    this.scene = scene;
    this.gridMapper = gridMapper;
    this.glyphRegistry = glyphRegistry;
    this.tilesetKey = tilesetKey;
    this.npcSpriteKey = npcSpriteKey;
    this.language = language;
    this.depth = depth;
  }

  /**
   * Show or update the feedback for the given display items.
   * Previous sprites and bubbles are cleared first.
   */
  update(items: ConstraintDisplayItem[], puzzle: BridgePuzzle): void {
    this.clear();

    const cellSize = this.gridMapper.getCellSize();
    const bubbleHeightPx = BUBBLE_TILE_HEIGHT * TILE_SIZE;

    for (const item of items) {
      const island = puzzle.islands.find(i => i.id === item.elementID);
      if (!island) continue;

      const worldPos = this.gridMapper.gridToWorld(island.x, island.y);

      // Determine if constraint is satisfied (glyphMessage is "good" when satisfied)
      const isSatisfied = item.glyphMessage.trim() === 'good';
      
      // Choose NPC sprite based on constraint type
      const baseSprite = item.constraintType === 'IslandBridgeCountConstraint' ? 'Ruby' : 'sailorNS';
      
      // Choose expression based on satisfaction: happy if satisfied, frown if not
      const spriteKey = isSatisfied ? `${baseSprite} happy` : `${baseSprite} frown`;

      // NPC sprite — aligned with the island horizontally, offset down by half a cell
      const npc = this.scene.add.sprite(
        worldPos.x,
        worldPos.y + cellSize / 2,
        spriteKey,
        0,
      );
      npc.setOrigin(0, 0);
      npc.setDepth(this.depth);
      this.npcSprites.push(npc);

      // Speech bubble — aligned with island horizontally, offset up by bubble height + extra spacing
      const bubble = new SpeechBubble(this.scene, this.tilesetKey);
      const glyphFrames = this.glyphRegistry.parseGlyphs(this.language, item.glyphMessage);
      bubble.create(glyphFrames, this.language, this.glyphRegistry, 1);
      bubble.setPosition(worldPos.x + cellSize, worldPos.y - cellSize / 2);
      bubble.setDepth(this.depth + 1);
      this.speechBubbles.push(bubble);
    }
  }

  /** Hide all sprites and bubbles without destroying them. */
  setVisible(visible: boolean): void {
    for (const npc of this.npcSprites) {
      npc.setVisible(visible);
    }
    for (const bubble of this.speechBubbles) {
      bubble.setVisible(visible);
    }
  }

  /** Destroy and remove all sprites and bubbles. */
  clear(): void {
    for (const npc of this.npcSprites) {
      npc.destroy();
    }
    this.npcSprites = [];

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
