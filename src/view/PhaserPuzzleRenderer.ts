// phaser/view/PhaserPuzzleRenderer.ts
import Phaser from "phaser";
import type { PuzzleRenderer } from "./PuzzleRenderer";
import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { GridToWorldMapper } from "./GridToWorldMapper";
import type { Bridge } from "@model/puzzle/Bridge";
import { orientationForDelta, normalizeRenderOrder } from "./PuzzleRenderer";
import { parseNumBridgesConstraint } from "@model/puzzle/Island";

export class PhaserPuzzleRenderer implements PuzzleRenderer {
  private scene: Phaser.Scene;
  private gridMapper: GridToWorldMapper = new GridToWorldMapper(64);
  private textureKey: string;
  
  // Track interactive hit zones so they can be disabled while the user is placing
  // a bridge (previews active). This prevents outlines from capturing clicks
  // that should go to the preview flow.
  private bridgeHitZones: Phaser.GameObjects.Zone[] = [];
  private isPlacing: boolean = false;
  // Graphics objects
  private islandGraphics: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private islandLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private bridgeGraphics: Map<string, Phaser.GameObjects.Container> = new Map();
  private previewGraphics: Phaser.GameObjects.Container | null = null;
  private highlightGraphics: Phaser.GameObjects.Container | null = null;
  private flashGraphics: Phaser.GameObjects.Container | null = null;
  private flashTimer: Phaser.Time.TimerEvent | null = null;

  // Sprite frame indices (from SproutLandsGrassIslands.png)
  readonly FRAME_ISLAND = 36;
  // readonly FRAME_WATER = 10; // not currently used
  readonly H_BRIDGE_LEFT = 55;
  readonly H_BRIDGE_CENTRE = 56;
  readonly H_BRIDGE_RIGHT = 57;
  readonly V_BRIDGE_BOTTOM = 58;
  readonly V_BRIDGE_MIDDLE = 59;
  readonly V_BRIDGE_TOP = 60;
  readonly UNFINISHED_BRIDGE = 61;
  readonly H_BRIDGE_SINGLE = 62;
  readonly V_BRIDGE_SINGLE = 63;
  readonly DOUBLE_BRIDGE_OFFSET = 11; // add to single bridge frames for double bridges
  // Preview visuals
  readonly PREVIEW_ALPHA = 0.8;
  readonly INVALID_TINT = 0xff0000;

  constructor(scene: Phaser.Scene, gridMapper: GridToWorldMapper, textureKey = 'sprout-tiles') {
    this.scene = scene;
    this.gridMapper = gridMapper;
    this.textureKey = textureKey;
  }

  init(puzzle: BridgePuzzle): void {
    // puzzle reference not stored; renderer uses passed puzzle data when updating
    // Create island sprites (frame 36)
    for (const island of puzzle.islands) {
      const worldPos = this.gridMapper.gridToWorld(island.x, island.y);
      const sprite = this.scene.add.sprite(worldPos.x, worldPos.y, this.textureKey, this.FRAME_ISLAND)
        .setInteractive({ useHandCursor: true })
        .setOrigin(0, 0);
      // Scale sprite to match cell size (sprites are 32px)
      const scale = this.gridMapper.getCellSize() / 32;
      sprite.setScale(scale, scale);
      // Island label on top: show num_bridges if the island has that constraint
      const num = parseNumBridgesConstraint(island);
      if (num !== null) {
        const label = this.scene.add.text(worldPos.x + 12, worldPos.y + 6, String(num), { color: '#000', fontSize: '12px' }).setOrigin(0, 0);
        this.islandLabels.set(island.id, label);
      }
      this.islandGraphics.set(island.id, sprite);
    }
  }

  updateFromPuzzle(puzzle: BridgePuzzle): void {
    // Clear existing bridges
    this.destroyBridges();
    if (this.previewGraphics) {
      this.previewGraphics.destroy();
    }

    // Group placed bridges by normalized start/end so we render a single
    // container per island-pair. This allows switching to double-bridge
    // frames when two bridges occupy the same pair.
    const bridgeGroups: Map<string, { start: { x: number; y: number }, end: { x: number; y: number }, ids: string[] }> = new Map();
    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      const ordered = normalizeRenderOrder(bridge.start, bridge.end);
      const key = `${ordered.start.x},${ordered.start.y}:${ordered.end.x},${ordered.end.y}`;
      const existingBridgeGroupHere = bridgeGroups.get(key);
      if (existingBridgeGroupHere) {
        existingBridgeGroupHere.ids.push(bridge.id);
      } else {
        bridgeGroups.set(key, { start: ordered.start, end: ordered.end, ids: [bridge.id] });
      }
    }

    for (const g of bridgeGroups.values()) {
      // Render grouped placed bridges using the unified renderTiledBridge API
      this.renderTiledBridge({ start: g.start, end: g.end, target: 'placed', useEdges: true, bridgeIds: g.ids });
    }
  }

  private destroyBridges(): void {
    for (const container of this.bridgeGraphics.values()) {
      container.destroy();
    }
    this.bridgeGraphics.clear();
  }

  highlightViolations(ids: string[]): void {
    this.clearHighlights();

    const container = this.scene.add.container();

    for (const id of ids) {
      // Try to find island or bridge by ID
      const island = this.islandGraphics.get(id);
      if (island) {
        // Flash island red
        this.scene.tweens.add({
          targets: island,
          alpha: 0.5,
          duration: 100,
          yoyo: true,
          repeat: 2
        });
      }

      const bridge = this.bridgeGraphics.get(id);
      if (bridge) {
        // Flash bridge red
        this.scene.tweens.add({
          targets: bridge,
          alpha: 0.5,
          duration: 100,
          yoyo: true,
          repeat: 2
        });
      }
    }

    this.highlightGraphics = container;
  }


  flashInvalidPlacement(start: { x: number; y: number }, end: { x: number; y: number }): void {
    // Destroy existing flash container if present
    if (this.flashGraphics) {
      this.flashGraphics.destroy();
      this.flashGraphics = null;
    }

    // Delegate to shared renderer: flash uses centre tiles, red tint, and is temporary
    this.renderTiledBridge({
      start,
      end,
      target: 'flash',
      useEdges: false,
      tint: 0xff0000,
      temporaryDuration: 300
    });
  }

  clearHighlights(): void {
    if (this.highlightGraphics) {
      this.highlightGraphics.destroy();
      this.highlightGraphics = null;
    }
    if (this.flashGraphics) {
      this.flashGraphics.destroy();
      this.flashGraphics = null;
    }
    if (this.flashTimer) {
      this.scene.time.removeEvent(this.flashTimer);
      this.flashTimer = null;
    }
    if (this.previewGraphics) {
      this.previewGraphics.destroy();
    }
  }

  previewBridge(bridge: Bridge, opts?: { isDouble?: boolean; isInvalid?: boolean } | null): void {
    // Clear any existing preview
    if (this.previewGraphics) {
      this.previewGraphics.destroy();
    }

    if (!bridge.start) return;
    const isDouble = !!opts?.isDouble;
    const isInvalid = !!opts?.isInvalid;
    const tint = isInvalid ? this.INVALID_TINT : undefined;
    const alpha = this.PREVIEW_ALPHA;

    // Delegate to shared renderer: preview uses centre tiles and semi-transparent alpha.
    if (bridge.end) {
      this.renderTiledBridge({
        start: bridge.start,
        end: bridge.end,
        target: 'preview',
        useEdges: false,
        alpha,
        tint,
        bridgeIds: isDouble ? ['preview-a', 'preview-b'] : undefined
      });
    } else {
      // Unfinished single-tile preview
      this.renderTiledBridge({
        start: bridge.start,
        target: 'preview',
        singleUnfinished: true,
        alpha,
        tint
      });
    }
  }

  setPlacing(isPlacing: boolean): void {
    this.isPlacing = !!isPlacing;
    // Toggle interactivity for known hit zones
    for (const z of this.bridgeHitZones) {
      try {
        if (this.isPlacing) {
          z.disableInteractive();
        } else {
          const shape = z.getData('shape');
          if (shape) {
            z.setInteractive(shape, Phaser.Geom.Rectangle.Contains);
          } else {
            z.setInteractive();
          }
        }
      } catch (e) {
        // Ignore zones that have been destroyed
      }
    }
  }

  /**
   * Shared helper to render a tiled bridge between two grid positions.
   * Options:
   * - start, end: grid coords ({x,y}). If end omitted and singleUnfinished true, a single unfinished tile is rendered.
   * - target: 'placed' | 'preview' | 'flash' — determines which class field to store the container in.
   * - bridgeId: when target==='placed', the bridge id to use as key in bridgeGraphics.
   * - useEdges: when true, the tiles at the ends use left/right (or top/bottom) frames instead of centre frames.
   * - alpha: optional alpha applied to tiles.
   * - tint: optional tint (numeric hex) applied to tiles.
   * - temporaryDuration: when provided, the container will be destroyed after this many ms (used for flash).
   * - singleUnfinished: render a single UNFINISHED_BRIDGE tile at start (ignores end).
   */
  private renderTiledBridge(opts: {
    start: { x: number; y: number };
    end?: { x: number; y: number };
    target: 'placed' | 'preview' | 'flash';
    bridgeId?: string;
    bridgeIds?: string[];
    useEdges?: boolean;
    alpha?: number;
    tint?: number;
    temporaryDuration?: number;
    singleUnfinished?: boolean;
  }): void {
    const { start, end, target, bridgeId, bridgeIds, useEdges = false, alpha, tint, temporaryDuration, singleUnfinished } = opts;

    // For preview/flash we clear existing containers before creating new ones
    if (target === 'preview' && this.previewGraphics) {
      this.previewGraphics.destroy();
      this.previewGraphics = null;
    }
    if (target === 'flash' && this.flashGraphics) {
      this.flashGraphics.destroy();
      this.flashGraphics = null;
    }

    // Single unfinished tile case (centre the sprite on the cell)
    if (!end && singleUnfinished) {
      const startWorld = this.gridMapper.gridToWorld(start.x, start.y);
      // centre of the cell
      const cellSize = this.gridMapper.getCellSize();
      const container = this.scene.add.container(startWorld.x + cellSize / 2, startWorld.y + cellSize / 2);
      const spr = this.scene.add.sprite(0, 0, this.textureKey, this.UNFINISHED_BRIDGE).setOrigin(0.5, 0.5);
      if (alpha !== undefined) spr.setAlpha(alpha);
      if (tint !== undefined) spr.setTintFill(tint);
      const scale = this.gridMapper.getCellSize() / 32;
      spr.setScale(scale, scale);
      container.add(spr);
      if (target === 'preview') this.previewGraphics = container;
      return;
    }

    if (!end) return; // nothing to draw

    // Normalize and compute geometry once
    const ordered = normalizeRenderOrder(start, end);
    const startGrid = ordered.start;
    const endGrid = ordered.end;
    const startWorld = this.gridMapper.gridToWorld(startGrid.x, startGrid.y);
    const endWorld = this.gridMapper.gridToWorld(endGrid.x, endGrid.y);
    const worldLength = Math.sqrt((endWorld.x - startWorld.x) ** 2 + (endWorld.y - startWorld.y) ** 2);
    const dxGrid = endGrid.x - startGrid.x;
    const dyGrid = endGrid.y - startGrid.y;
    const gridDist = Math.sqrt(dxGrid * dxGrid + dyGrid * dyGrid);
    const segCount = Math.max(1, Math.ceil(gridDist));
    const worldStep = { x: (endWorld.x - startWorld.x) / segCount, y: (endWorld.y - startWorld.y) / segCount };
    const angle = Math.atan2(endWorld.y - startWorld.y, endWorld.x - startWorld.x);
    const spacing = Math.sqrt(worldStep.x * worldStep.x + worldStep.y * worldStep.y);
    const scale = this.gridMapper.getCellSize() / 32;
    const orient = orientationForDelta(startGrid, endGrid);

    // Position the container at the midpoint of the bridge (in cell-centred
    // coordinates) so local coordinates are centred and the interactive
    // zone/outline can be drawn symmetrically. GridToWorld returns the
    // top-left of a cell, so add half a cell to align centres.
    const cellSize = this.gridMapper.getCellSize();
    const midX = (startWorld.x + endWorld.x) / 2 + cellSize / 2;
    const midY = (startWorld.y + endWorld.y) / 2 + cellSize / 2;
    const container = this.scene.add.container(midX, midY);
    container.setRotation(angle);

    // Choose frames helper. If bridgeIds indicates a double bridge, offset
    // frames by DOUBLE_BRIDGE_OFFSET so double-sprite set is used.
    const isDouble = (bridgeIds && bridgeIds.length >= 2) || false;
    const chooseFrame = (i: number) => {
      const base = (() => {
        if (!useEdges) return orient === 'horizontal' ? this.H_BRIDGE_CENTRE : this.V_BRIDGE_MIDDLE;
        if (orient === 'horizontal') {
          if (i === 0 && segCount === 1) return this.H_BRIDGE_SINGLE;
          if (i === 0) return this.H_BRIDGE_LEFT;
          if (i === segCount - 1) return this.H_BRIDGE_RIGHT;
          return this.H_BRIDGE_CENTRE;
        } else {
          if (i === 0 && segCount === 1) return this.V_BRIDGE_SINGLE;
          if (i === 0) return this.V_BRIDGE_BOTTOM;
          if (i === segCount - 1) return this.V_BRIDGE_TOP;
          return this.V_BRIDGE_MIDDLE;
        }
      })();
      return isDouble ? base + this.DOUBLE_BRIDGE_OFFSET : base;
    };

    // Place tiles centred about the container origin. This keeps layout
    // symmetric and allows a simple centered hit-area to work correctly.
    const centreIndexOffset = (segCount - 1) / 2;
    for (let thisTile = 0; thisTile < segCount; thisTile++) {
      const frame = chooseFrame(thisTile);
      // Use centred origin so tile positions are centred around the container
      // local X axis.
      const tile = this.scene.add.sprite(0, 0, this.textureKey, frame).setOrigin(0.5, 0.5);
      tile.setScale(scale, scale);
      if (alpha !== undefined) tile.setAlpha(alpha);
      if (tint !== undefined) tile.setTintFill(tint);
      // Centre tiles along the container's local X axis
      tile.x = (thisTile - centreIndexOffset) * spacing;
      tile.y = 0;
      if (orient !== 'horizontal') {
        tile.setRotation(Math.PI / 2);
      }
      container.add(tile);
    }

    // After tiles have been added to the container, add an interactive hit-area
    // and a white outline that appears on hover. Only for permanently-placed bridges.
    if (target === 'placed') {
      // Pass along bridgeIds when available so outline emits a single id from the group.
      this.addClickableBridgeOutline(worldLength, container, opts as any);
    }

    if (target === 'placed') {
      // Map bridge ids to this container (either single bridgeId or multiple)
      if (bridgeIds && bridgeIds.length > 0) {
        for (const id of bridgeIds) {
          const prev = this.bridgeGraphics.get(id);
          if (prev) prev.destroy();
          this.bridgeGraphics.set(id, container);
        }
      } else if (bridgeId) {
        const prev = this.bridgeGraphics.get(bridgeId);
        if (prev) prev.destroy();
        this.bridgeGraphics.set(bridgeId, container);
      }
    } else if (target === 'preview') {
      this.previewGraphics = container;
    } else if (target === 'flash') {
      this.flashGraphics = container;
      if (temporaryDuration) {
        if (this.flashTimer) {
          this.scene.time.removeEvent(this.flashTimer);
        }
        this.flashTimer = this.scene.time.delayedCall(temporaryDuration, () => {
          if (this.flashGraphics) {
            this.flashGraphics.destroy();
            this.flashGraphics = null;
          }
          this.flashTimer = null;
        });
      }
    }
  }

  private addClickableBridgeOutline(
    worldLength: number,
    container: Phaser.GameObjects.Container,
    opts: {
      start: { x: number; y: number; };
      end?: { x: number; y: number; };
      bridgeId?: string;
      bridgeIds?: string[];
    }
  ) {
    // compute bounding box of the bridge in container-local coordinates
    // tileThickness: choose a reasonable clickable thickness (half a cell, clamped)
    const zoneThickness = Math.max(8, this.gridMapper.getCellSize() * 0.75);

    // Shrink length slightly because bridge sprites start/end partway into the island
    worldLength = worldLength - (this.gridMapper.getCellSize() / 2);
    const halfW = worldLength / 2;
    const halfH = zoneThickness / 2;

    // Invisible interactive zone that transforms with the container. Since the
    // container origin is centred at the midpoint, create the zone positioned
    // at (-halfW, -halfH) so its local 0,0 maps to the top-left of the
    // bounding rect. Use a simple rectangle from 0,0..width,height for
    // setInteractive.
    const hitZone = this.scene.add.zone(-halfW, -halfH, worldLength, zoneThickness);
    hitZone.setOrigin(0, 0);
    const rect = new Phaser.Geom.Rectangle(0, 0, worldLength, zoneThickness);
    hitZone.setData('shape', rect);
    if (!this.isPlacing) {
      hitZone.setInteractive(rect, Phaser.Geom.Rectangle.Contains);
    }
    container.add(hitZone);

    // Remember zone so we can toggle interactivity later
    this.bridgeHitZones.push(hitZone);

    // White outline graphic (hidden by default)
    const outline = this.scene.add.graphics();
    outline.lineStyle(2, 0xffffff, 1);
    outline.strokeRect(-halfW, -halfH, worldLength, zoneThickness);
    outline.setVisible(false);
    container.add(outline);

    // Pointer handlers
    hitZone.on('pointerover', () => {
      if (this.isPlacing) return;
      outline.setVisible(true);
    });
    hitZone.on('pointerout', () => {
      if (this.isPlacing) return;
      outline.setVisible(false);
    });
    hitZone.on('pointerdown', () => {
      if (this.isPlacing) return;
      // Emit an event on the scene so the owning scene / controller can handle removal.
      // Do not directly mutate model from view.
      const ids: string[] = (opts as any).bridgeIds ?? (opts.bridgeId ? [opts.bridgeId] : []);
      const emitId = ids.length ? ids[ids.length - 1] : opts.bridgeId;
      this.scene.events.emit('bridge-clicked', emitId);
    });
  }

  // Extra interface methods (no-op or thin wrappers)
  highlightPreviewSegment(start: { x: number; y: number }, end: { x: number; y: number }): void {
    this.clearHighlights();
    this.previewBridge({ start, end } as Bridge);
  }

  setAvailableBridgeTypes(_types: any[]): void {
    // Renderer does not manage sidebar UI; no-op
  }

  setSelectedBridgeType(_type: any | null): void {
    // Renderer does not manage sidebar UI; no-op
  }

  update(_dt: number): void {
    // Optional per-frame updates (animations, etc.)
  }

  destroy(): void {
    // Clean up all graphics
    for (const island of this.islandGraphics.values()) {
      island.destroy();
    }
    this.islandGraphics.clear();
    for (const lbl of this.islandLabels.values()) {
      lbl.destroy();
    }
    this.islandLabels.clear();

    for (const bridge of this.bridgeGraphics.values()) {
      bridge.destroy();
    }
    this.bridgeGraphics.clear();

    if (this.previewGraphics) {
      this.previewGraphics.destroy();
      this.previewGraphics = null;
    }

    if (this.highlightGraphics) {
      this.highlightGraphics.destroy();
      this.highlightGraphics = null;
    }

    if (this.flashGraphics) {
      this.flashGraphics.destroy();
      this.flashGraphics = null;
    }

    if (this.flashTimer) {
      this.scene.time.removeEvent(this.flashTimer);
      this.flashTimer = null;
    }
  }
}
