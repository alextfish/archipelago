/**
 * Persistent HUD overlay for the overworld.
 *
 * Rendered as a separate Phaser scene so it has its own camera at zoom=1.
 * This ensures all screen-space positions are pixel-accurate regardless of
 * the camera zoom applied to the OverworldScene world camera (currently 2×).
 *
 * Contains:
 *  - Book icon (📖) to toggle TranslationModeScene
 *  - Warp button (⚡) to teleport the player to a named start position
 *  - Jewel HUD (top-right) showing collected jewel counts
 *
 * Launched by OverworldScene.  TranslationModeScene explicitly excludes this
 * scene from its pause-all-scenes sweep so the book icon stays clickable while
 * the translation overlay is open.
 */

import Phaser from 'phaser';
import type { PlayerOverworldDisplayItem } from '@model/overworld/PlayerOverworldDisplay';
import type { PlayerStartManager, PlayerStartPosition } from '@model/overworld/PlayerStartManager';

/** X position of the book icon (📖) in screen space. */
export const BOOK_ICON_X = 12;
/** Width allowance for the book icon so the warp button sits clear of it. */
export const BOOK_ICON_WIDTH = 40;
/** Y position shared by both the book icon and the warp button. */
export const TOP_BUTTON_Y = 12;

export class OverworldHUDScene extends Phaser.Scene {
    private playerStartManager: PlayerStartManager | null = null;
    private warpCallback: ((start: PlayerStartPosition) => void) | null = null;
    private getDisplayItems: (() => PlayerOverworldDisplayItem[]) | null = null;

    private warpDialog: Phaser.GameObjects.Container | null = null;
    private dialogOpen: boolean = false;

    private jewelHUDElements: Map<string, {
        sprite: Phaser.GameObjects.Image;
        text: Phaser.GameObjects.Text;
    }> = new Map();

    constructor() {
        super({ key: 'OverworldHUDScene' });
    }

    /**
     * Wire up services from OverworldScene before this scene first renders.
     * Called immediately after scene.launch('OverworldHUDScene').
     */
    setServices(
        playerStartManager: PlayerStartManager,
        warpCallback: (start: PlayerStartPosition) => void,
        getDisplayItems: () => PlayerOverworldDisplayItem[],
    ): void {
        this.playerStartManager = playerStartManager;
        this.warpCallback = warpCallback;
        this.getDisplayItems = getDisplayItems;
    }

    create(): void {
        // Book icon – toggles TranslationModeScene on/off
        const bookIcon = this.add.text(BOOK_ICON_X, TOP_BUTTON_Y, '📖', { fontSize: '28px' });
        bookIcon.setDepth(200);
        bookIcon.setInteractive({ useHandCursor: true });
        bookIcon.on('pointerdown', () => this.toggleTranslation());

        // Tab key also toggles translation mode
        this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            this.toggleTranslation();
        });

        // Warp button – sits immediately right of the book icon
        const warpButton = this.add.text(BOOK_ICON_X + BOOK_ICON_WIDTH, TOP_BUTTON_Y, '⚡', { fontSize: '28px' });
        warpButton.setDepth(200);
        warpButton.setInteractive({ useHandCursor: true });
        warpButton.on('pointerdown', () => {
            if (this.dialogOpen) {
                this.hideWarpDialog();
            } else {
                this.showWarpDialog();
            }
        });
    }

    // -------------------------------------------------------------------------
    // Public API used by OverworldScene
    // -------------------------------------------------------------------------

    /** Refresh the jewel count display; call whenever the player collects a jewel. */
    refreshJewelHUD(): void {
        if (!this.getDisplayItems) return;

        const items = this.getDisplayItems();
        const itemHeight = 28;
        const marginRight = 8;
        const marginTop = 8;

        // Remove HUD entries for colours that are no longer in the display list
        const activeColours = new Set(items.map(i => i.colour));
        for (const [colour, els] of this.jewelHUDElements) {
            if (!activeColours.has(colour)) {
                els.sprite.destroy();
                els.text.destroy();
                this.jewelHUDElements.delete(colour);
            }
        }

        const colourMap: Record<string, number> = {
            red: 0xff4444,
            blue: 0x4444ff,
            green: 0x44ff44,
            yellow: 0xffff44,
        };

        items.forEach((item, index) => {
            const y = marginTop + index * itemHeight;
            const spriteX = this.scale.width - marginRight - 16;
            const textX = this.scale.width - marginRight - 32 - 4;

            if (!this.jewelHUDElements.has(item.colour)) {
                const spriteKey = `jewel-${item.colour}`;
                let hudSprite: Phaser.GameObjects.Image;

                if (this.textures.exists(spriteKey)) {
                    hudSprite = this.add.image(spriteX, y + 8, spriteKey);
                } else {
                    // Fallback: coloured circle drawn via Graphics
                    const gfx = this.add.graphics();
                    gfx.fillStyle(colourMap[item.colour] ?? 0xffffff, 1);
                    gfx.fillCircle(spriteX, y + 8, 8);
                    gfx.setDepth(200);
                    hudSprite = this.add.image(spriteX, y + 8, '__DEFAULT').setVisible(false);
                }

                hudSprite.setDepth(200);

                const hudText = this.add.text(textX, y, String(item.count), {
                    fontSize: '14px',
                    color: '#ffffff',
                });
                hudText.setDepth(200);
                hudText.setOrigin(1, 0);

                this.jewelHUDElements.set(item.colour, { sprite: hudSprite, text: hudText });
            } else {
                const els = this.jewelHUDElements.get(item.colour)!;
                els.text.setText(String(item.count));
                els.sprite.setPosition(spriteX, y + 8);
                els.text.setPosition(textX, y);
            }
        });
    }

    /**
     * Returns true while the warp dialog is open.
     * OverworldScene checks this to suppress pointer-move events so the player
     * does not accidentally walk when clicking a warp destination.
     */
    isWarpDialogOpen(): boolean {
        return this.dialogOpen;
    }

    // -------------------------------------------------------------------------
    // Translation toggle
    // -------------------------------------------------------------------------

    private toggleTranslation(): void {
        const translationScene = this.scene.get('TranslationModeScene') as any;
        translationScene?.toggle?.();
    }

    // -------------------------------------------------------------------------
    // Warp dialog
    // -------------------------------------------------------------------------

    private showWarpDialog(): void {
        if (!this.playerStartManager) return;

        this.dialogOpen = true;

        const starts = this.playerStartManager.getAllStarts();

        const padding = 8;
        const rowHeight = 32;
        const dialogWidth = 180;
        const dialogHeight = padding * 2 + (starts.length + 1) * rowHeight; // +1 for Cancel

        const dialogX = BOOK_ICON_X + BOOK_ICON_WIDTH;
        const dialogY = TOP_BUTTON_Y + 36;

        const container = this.add.container(dialogX, dialogY);
        container.setDepth(201);

        const bg = this.add.rectangle(0, 0, dialogWidth, dialogHeight, 0x222244, 0.92);
        bg.setOrigin(0, 0);
        container.add(bg);

        const border = this.add.rectangle(0, 0, dialogWidth, dialogHeight, 0x8888cc, 0);
        border.setOrigin(0, 0);
        border.setStrokeStyle(1, 0x8888cc, 1);
        container.add(border);

        const title = this.add.text(padding, padding, 'Warp to…', {
            fontSize: '14px',
            color: '#aaaadd',
        });
        container.add(title);

        starts.forEach((start, index) => {
            const y = padding + rowHeight * (index + 1);
            const label = start.id || `start ${index + 1}`;
            const btn = this.add.text(padding, y, label, {
                fontSize: '16px',
                color: '#ffffff',
                backgroundColor: '#334466',
                padding: { x: 6, y: 4 },
            });
            btn.setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => btn.setColor('#ffff88'));
            btn.on('pointerout', () => btn.setColor('#ffffff'));
            btn.on('pointerdown', () => {
                this.hideWarpDialog();
                this.warpCallback?.(start);
            });
            container.add(btn);
        });

        const cancelY = padding + rowHeight * (starts.length + 1);
        const cancelBtn = this.add.text(padding, cancelY, 'Cancel', {
            fontSize: '16px',
            color: '#ffaaaa',
            backgroundColor: '#442222',
            padding: { x: 6, y: 4 },
        });
        cancelBtn.setInteractive({ useHandCursor: true });
        cancelBtn.on('pointerover', () => cancelBtn.setColor('#ff8888'));
        cancelBtn.on('pointerout', () => cancelBtn.setColor('#ffaaaa'));
        cancelBtn.on('pointerdown', () => this.hideWarpDialog());
        container.add(cancelBtn);

        this.warpDialog = container;
    }

    private hideWarpDialog(): void {
        this.dialogOpen = false;
        if (this.warpDialog) {
            this.warpDialog.destroy();
            this.warpDialog = null;
        }
    }
}
