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

export class ConstraintFeedbackDisplay {
  private scene: Phaser.Scene;
  private gridMapper: GridToWorldMapper;
  private glyphRegistry: LanguageGlyphRegistry;
  private tilesetKey: string;
  private language: string;
  private depth: number;
  private existingNPCSprites: Map<string, Phaser.GameObjects.Sprite>;

  private originalNPCTextures: Map<string, string> = new Map();
  private speechBubbles: SpeechBubble[] = [];

  constructor(
    scene: Phaser.Scene,
    gridMapper: GridToWorldMapper,
    glyphRegistry: LanguageGlyphRegistry,
    tilesetKey: string,
    _npcSpriteKey: string,
    existingNPCSprites: Map<string, Phaser.GameObjects.Sprite>,
    language: string = 'grass',
    depth: number = 200,
  ) {
    this.scene = scene;
    this.gridMapper = gridMapper;
    this.glyphRegistry = glyphRegistry;
    this.tilesetKey = tilesetKey;
    this.existingNPCSprites = existingNPCSprites;
    this.language = language;
    this.depth = depth;
  }

  /**
   * Show or update the feedback for the given display items.
   * Updates existing NPC sprite expressions and creates speech bubbles.
   */
  update(items: ConstraintDisplayItem[], puzzle: BridgePuzzle): void {
    this.clear();

    const cellSize = this.gridMapper.getCellSize();

    for (const item of items) {
      const island = puzzle.islands.find(i => i.id === item.elementID);
      if (!island) continue;

      const worldPos = this.gridMapper.gridToWorld(island.x, island.y);

      // Determine if constraint is satisfied (glyphMessage is "good" when satisfied)
      const isSatisfied = item.glyphMessage.trim() === 'good';
      
      // Update existing NPC sprite texture to show appropriate expression
      const existingNPC = this.existingNPCSprites.get(island.id);
      if (existingNPC) {
        // Save original texture if not already saved
        if (!this.originalNPCTextures.has(island.id)) {
          this.originalNPCTextures.set(island.id, existingNPC.texture.key);
        }
        
        // Choose NPC sprite based on constraint type
        const baseSprite = item.constraintType === 'IslandBridgeCountConstraint' ? 'Ruby' : 'sailorNS';
        
        // Choose expression based on satisfaction: happy if satisfied, frown if not
        const spriteKey = isSatisfied ? `${baseSprite} happy` : `${baseSprite} frown`;
        
        // Update the texture of the existing sprite
        existingNPC.setTexture(spriteKey, 0);
      }

      // Speech bubble — aligned with island horizontally, offset up by bubble height + extra spacing
      const bubble = new SpeechBubble(this.scene, this.tilesetKey);
      const glyphFrames = this.glyphRegistry.parseGlyphs(this.language, item.glyphMessage);
      bubble.create(glyphFrames, this.language, this.glyphRegistry, 1);
      bubble.setPosition(worldPos.x + cellSize, worldPos.y - cellSize / 2);
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
