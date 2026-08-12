// view/PhaserPuzzleRenderer.ts
import Phaser from "phaser";
import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { GridToWorldMapper } from "./GridToWorldMapper";
import type { Point } from "@model/puzzle/Point";
import { BridgeSpriteFrames } from "./BridgeSpriteFrameRegistry";
import { BasePuzzleRenderer } from "./BasePuzzleRenderer";

export class PhaserPuzzleRenderer extends BasePuzzleRenderer {
  constructor(scene: Phaser.Scene, gridMapper: GridToWorldMapper, textureKey = 'sprout-tiles', languageTilesetKey = 'language', npcSpriteKey = 'Ruby') {
    super(scene, gridMapper, textureKey, languageTilesetKey, npcSpriteKey);
  }

  init(puzzle: BridgePuzzle): void {
    // Create island sprites and constraint NPC indicators for each island
    this.syncIslandSprites(puzzle);
    this.createConstraintNPCsFromPuzzleConstraints(puzzle);
  }

  screenToGrid(screenX: number, screenY: number): Point {
    const worldPoint = this.scene.cameras.main.getWorldPoint(screenX, screenY);
    const gridPos = this.gridMapper.worldToGrid(worldPoint.x, worldPoint.y);
    return { x: gridPos.x, y: gridPos.y };
  }

  highlightPreviewSegment(start: { x: number; y: number }, end: { x: number; y: number }): void {
    this.clearHighlights();
    this.previewBridge({ start, end } as Parameters<typeof this.previewBridge>[0]);
  }

  protected override syncIslandSprites(puzzle: BridgePuzzle): void {
    const scale = this.gridMapper.getCellSize() / 32;
    for (const island of puzzle.islands) {
      if (this.islandGraphics.has(island.id)) {
        continue;
      }

      const worldPos = this.gridMapper.gridToWorld(island.x, island.y);
      const sprite = this.scene.add.sprite(worldPos.x, worldPos.y, this.textureKey, BridgeSpriteFrames.FRAME_ISLAND)
        .setInteractive({ useHandCursor: true })
        .setOrigin(0, 0)
        .setScale(scale, scale);

      sprite.on('pointerdown', () => {
        this.scene.events.emit('island-clicked', worldPos.x, worldPos.y, island.x, island.y);
      });
      sprite.on('pointermove', () => {
        this.scene.events.emit('island-pointermove', worldPos.x, worldPos.y, island.x, island.y);
      });
      sprite.on('pointerup', () => {
        this.scene.events.emit('island-pointerup', worldPos.x, worldPos.y, island.x, island.y);
      });

      this.islandGraphics.set(island.id, sprite);
    }
  }
}
