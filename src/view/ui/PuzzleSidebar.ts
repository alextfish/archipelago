// view/ui/PuzzleSidebar.ts
import Phaser from 'phaser';
import type { BridgeType } from '@model/puzzle/BridgeType';
import { Environment } from '@helpers/Environment';

export interface PuzzleSidebarCallbacks {
  onTypeSelected: (typeId: string) => void;
  onExit: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export class PuzzleSidebar {
  private scene: Phaser.Scene;
  private callbacks: PuzzleSidebarCallbacks;

  private panel: Phaser.GameObjects.Container;
  private typeButtons: Map<string, Phaser.GameObjects.Container> = new Map();
  private counts: Record<string, number> = {};

  private selectedTypeId: string | null = null;
  private undoBg: Phaser.GameObjects.Rectangle | null = null;
  private redoBg: Phaser.GameObjects.Rectangle | null = null;

  // Debug panel
  private debugPanel: Phaser.GameObjects.Container | null = null;
  private debugTexts: Phaser.GameObjects.Text[] = [];
  private cameraInfo: { x: number; y: number; zoom: number; width: number; height: number } = { x: 0, y: 0, zoom: 1, width: 800, height: 600 };
  private islandInfo: { count: number; visible: number; bounds?: { minX: number; maxX: number; minY: number; maxY: number } } = { count: 0, visible: 0 };

  constructor(
    scene: Phaser.Scene,
    callbacks: PuzzleSidebarCallbacks
  ) {
    this.scene = scene;
    this.callbacks = callbacks;
    // Create the panel in screen coordinates and make it fixed (ignore camera scroll)
    this.panel = scene.add.container(650, 0);
    // Prevent the panel from moving when the main camera scrolls
    // This makes the panel act like UI (fixed to the viewport). Zoom is handled separately.
    this.panel.setScrollFactor(0);
    // Ensure it's rendered above world objects
    this.panel.setDepth(1000);
  }

  /**
   * Adjust the sidebar so it stays visually unchanged when the main camera zooms.
   * Call this with the current camera zoom (e.g. 1.0 means no change).
   */
  adjustForCameraZoom(zoom: number): void {
    if (!this.panel) return;
    // Counteract the camera zoom so UI stays constant size.
    const uiScale = 1 / (zoom || 1);
    this.panel.setScale(uiScale);
  }

  create(bridgeTypes: BridgeType[], counts: Record<string, number>): void {
    this.counts = counts;

    // Clear out previous contents
    this.panel.removeAll(true);
    this.typeButtons.clear();

    // Create background panel
    const bg = this.scene.add.rectangle(0, 0, 150, this.scene.scale.height, 0x333333, 0.8);
    this.panel.add(bg);

    let yOffset = 20;

    // Title
    const title = this.scene.add.text(75, yOffset, 'Bridge Types', {
      color: '#fff',
      fontSize: '16px',
      fontStyle: 'bold'
    }).setOrigin(1.1, 0.5);
    this.panel.add(title);
    yOffset += 40;

    // Bridge type buttons
    for (const type of bridgeTypes) {
      const button = this.createBridgeTypeButton(type, yOffset);
      if (!button) continue;
      this.typeButtons.set(type.id, button);
      this.panel.add(button);
      yOffset += 50;
    }

    yOffset += 20;

    // Action buttons
    const exitBtn = this.createButton('Exit', yOffset, () => this.callbacks.onExit());
    this.panel.add(exitBtn);
    yOffset += 40;

    const undoBtn = this.createButton('Undo', yOffset, () => this.callbacks.onUndo());
    this.panel.add(undoBtn);
    // store bg rectangle for styling later
    this.undoBg = undoBtn.getAll().find(c => c instanceof Phaser.GameObjects.Rectangle) as Phaser.GameObjects.Rectangle;
    yOffset += 40;

    const redoBtn = this.createButton('Redo', yOffset, () => this.callbacks.onRedo());
    this.panel.add(redoBtn);
    this.redoBg = redoBtn.getAll().find(c => c instanceof Phaser.GameObjects.Rectangle) as Phaser.GameObjects.Rectangle;
    yOffset += 40;

    // Debug panel (only show in debug mode)
    if (Environment.isDebug()) {
      this.createDebugPanel(yOffset);
    }
  }

  private createBridgeTypeButton(type: BridgeType, y: number): Phaser.GameObjects.Container | undefined {
    // first assert no button with this type.id already exists
    if (this.typeButtons.has(type.id)) {
      console.error(`Button with type.id ${type.id} already exists`);
      return undefined;
    }

    const container = this.scene.add.container(0, y);

    // Background
    const bg = this.scene.add.rectangle(0, 0, 130, 40, 0x555555, 1);
    container.add(bg);

    // Type label
    const label = this.scene.add.text(0, -10, type.id, {
      color: '#fff',
      fontSize: '12px'
    }).setOrigin(0.5, 0);
    container.add(label);

    // Count label
    const count = this.scene.add.text(0, 5, `Available: ${this.counts[type.id] || 0}`, {
      color: '#aaa',
      fontSize: '10px'
    }).setOrigin(0.5, 0);
    container.add(count);

    // Make interactive
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.callbacks.onTypeSelected(type.id);
    });

    return container;
  }

  private createButton(text: string, y: number, callback: () => void): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, y);

    const bg = this.scene.add.rectangle(0, 0, 130, 30, 0x0077ff, 1);
    const label = this.scene.add.text(0, 0, text, {
      color: '#fff',
      fontSize: '14px'
    }).setOrigin(0.5, 0.5);

    container.add(bg);
    container.add(label);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', callback);

    return container;
  }

  setUndoEnabled(enabled: boolean): void {
    if (!this.undoBg) return;
    if (enabled) {
      this.undoBg.setFillStyle(0x0077ff, 1);
      // Re-enable interactive without removing existing listeners
      if ((this.undoBg as any).setInteractive) (this.undoBg as any).setInteractive({ useHandCursor: true });
    } else {
      this.undoBg.setFillStyle(0x0077ff, 0.35);
      // Disable interaction but keep listeners attached so re-enable restores behaviour
      if ((this.undoBg as any).disableInteractive) (this.undoBg as any).disableInteractive();
    }
  }

  setRedoEnabled(enabled: boolean): void {
    if (!this.redoBg) return;
    if (enabled) {
      this.redoBg.setFillStyle(0x0077ff, 1);
      if ((this.redoBg as any).setInteractive) (this.redoBg as any).setInteractive({ useHandCursor: true });
    } else {
      this.redoBg.setFillStyle(0x0077ff, 0.35);
      if ((this.redoBg as any).disableInteractive) (this.redoBg as any).disableInteractive();
    }
  }

  updateCounts(counts: Record<string, number>): void {
    this.counts = counts;

    // Update count labels
    for (const [typeId, button] of this.typeButtons.entries()) {
      const children = button.getAll();
      const countLabel = children.find(child => {
        if (child instanceof Phaser.GameObjects.Text) {
          return child.text.includes('Available:');
        }
        return false;
      }) as Phaser.GameObjects.Text | undefined;

      if (countLabel) {
        countLabel.setText(`Available: ${counts[typeId] || 0}`);
      }
      // Grey out / disable button when none remain
      const bg = children.find(child => child instanceof Phaser.GameObjects.Rectangle) as Phaser.GameObjects.Rectangle | undefined;
      const avail = counts[typeId] ?? 0;
      if (bg) {
        if (avail <= 0) {
          bg.setFillStyle(0x222222, 1);
          // disable interaction
          // remove any previous pointer handler to avoid duplicates
          try { bg.removeAllListeners('pointerdown'); } catch (e) { }
          if ((bg as any).disableInteractive) (bg as any).disableInteractive();
        } else {
          if (this.selectedTypeId === typeId) {
            bg.setFillStyle(0x9999aa, 1); // Bright cyan when selected
          } else {
            bg.setFillStyle(0x555555, 1);
          }
          // ensure interactive and listener present
          try { bg.removeAllListeners('pointerdown'); } catch (e) { }
          bg.setInteractive({ useHandCursor: true });
          bg.on('pointerdown', () => {
            this.callbacks.onTypeSelected(typeId);
          });
        }
      }
    }
  }

  setSelectedType(typeId: string): void {
    this.selectedTypeId = typeId;
    // Update button visuals
    for (const [id, button] of this.typeButtons.entries()) {
      const children = button.getAll();
      const bg = children.find(child => child instanceof Phaser.GameObjects.Rectangle) as Phaser.GameObjects.Rectangle | undefined;

      if (bg) {
        if (id === typeId) {
          bg.setFillStyle(0x9999aa, 1); // Bright cyan when selected
        } else {
          bg.setFillStyle(0x555555, 1); // Grey when not selected
        }
      }
    }
  }

  private createDebugPanel(yOffset: number): void {
    if (this.debugPanel) {
      this.debugPanel.destroy();
    }

    this.debugPanel = this.scene.add.container(0, yOffset);
    this.debugTexts = [];

    // Debug title
    const debugTitle = this.scene.add.text(75, 0, 'Debug Info', {
      color: '#ffff00',
      fontSize: '14px',
      fontStyle: 'bold'
    }).setOrigin(0.5, 0);
    this.debugPanel.add(debugTitle);

    // Create text objects for debug info
    const debugLabels = [
      'Camera X:', 'Camera Y:', 'Zoom:', 'Screen:',
      'View Corners:', 'Island Count:', 'Environment:'
    ];

    for (let i = 0; i < debugLabels.length; i++) {
      const text = this.scene.add.text(5, 25 + i * 15, debugLabels[i], {
        color: '#000000',
        fontSize: '10px'
      }).setOrigin(0, 0);
      this.debugPanel.add(text);
      this.debugTexts.push(text);
    }

    this.panel.add(this.debugPanel);
    this.updateDebugInfo();
  }

  /**
   * Update camera information for debug display
   */
  updateCameraInfo(cameraX: number, cameraY: number, zoom: number, screenWidth: number, screenHeight: number): void {
    this.cameraInfo = { x: cameraX, y: cameraY, zoom, width: screenWidth, height: screenHeight };
    this.updateDebugInfo();
  }

  /**
   * Update island information for debug display
   */
  updateIslandInfo(totalCount: number, visibleCount: number, bounds?: { minX: number; maxX: number; minY: number; maxY: number }): void {
    this.islandInfo = { count: totalCount, visible: visibleCount, bounds };
    this.updateDebugInfo();
  }

  private updateDebugInfo(): void {
    if (!Environment.isDebug() || this.debugTexts.length === 0) return;

    const cam = this.cameraInfo;
    const worldLeft = cam.x - (cam.width / 2) / cam.zoom;
    const worldRight = cam.x + (cam.width / 2) / cam.zoom;
    const worldTop = cam.y - (cam.height / 2) / cam.zoom;
    const worldBottom = cam.y + (cam.height / 2) / cam.zoom;

    const debugInfo = [
      `Camera X: ${cam.x.toFixed(1)}`,
      `Camera Y: ${cam.y.toFixed(1)}`,
      `Zoom: ${cam.zoom.toFixed(2)}`,
      `Screen: ${cam.width}x${cam.height}`,
      `View: (${worldLeft.toFixed(0)},${worldTop.toFixed(0)}) to (${worldRight.toFixed(0)},${worldBottom.toFixed(0)})`,
      `Islands: ${this.islandInfo.visible}/${this.islandInfo.count}`,
      this.islandInfo.bounds ? `bounds:(${this.islandInfo.bounds.minX},${this.islandInfo.bounds.minY})-(${this.islandInfo.bounds.maxX},${this.islandInfo.bounds.maxY})` : '',
      `Env: ${Environment.isDevelopment() ? 'DEV' : 'PROD'}`
    ];

    for (let i = 0; i < Math.min(debugInfo.length, this.debugTexts.length); i++) {
      this.debugTexts[i].setText(debugInfo[i]);
    }
  }

  destroy(): void {
    this.panel.destroy();
  }
}

