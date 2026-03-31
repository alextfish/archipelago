/**
 * Translation Mode overlay scene.
 *
 * Activated when the player presses Tab or clicks the book icon at the
 * top-left of the screen.  Works on top of any other active scene
 * (overworld, puzzle, conversation).
 *
 * When active this scene:
 *  1. Pauses the scenes underneath it so movement and gameplay halt.
 *  2. Draws a semi-transparent dark overlay over the full viewport.
 *  3. Reads all currently-displayed glyphs from ActiveGlyphTracker.
 *  4. Draws a clickable yellow highlight rectangle around each glyph.
 *  5. Renders the player's current translation below each glyph.
 *  6. When a glyph highlight is clicked, shows a small edit panel with a
 *     Phaser DOM text-input and OK / Cancel buttons so the player can
 *     update their guess.  Pressing OK updates PlayerTranslationDictionary
 *     and refreshes all displayed translations for that glyph.
 */

import Phaser from 'phaser';
import type { ActiveGlyphTracker, GlyphScreenBounds } from '@model/translation/ActiveGlyphTracker';
import type { PlayerTranslationDictionary } from '@model/translation/PlayerTranslationDictionary';

/** Padding (px) around each glyph highlight rectangle. */
const HIGHLIGHT_PADDING = 4;

/** Render-depth values for overlay layers. */
const DEPTH_OVERLAY = 100;
const DEPTH_HIGHLIGHTS = 110;
const DEPTH_LABELS = 120;
const DEPTH_INPUT_PANEL = 130;

interface HighlightEntry {
    bounds: GlyphScreenBounds;
    rect: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
}

export class TranslationModeScene extends Phaser.Scene {
    private glyphTracker: ActiveGlyphTracker | null = null;
    private translationDict: PlayerTranslationDictionary | null = null;

    /** Keys of scenes paused when translation mode was entered. */
    private pausedScenes: string[] = [];

    private overlay: Phaser.GameObjects.Rectangle | null = null;
    private highlights: HighlightEntry[] = [];

    /** Book-icon button – always visible at top-left. */
    private bookIcon: Phaser.GameObjects.Text | null = null;

    /** Currently open edit panel container (null when hidden). */
    private editPanel: Phaser.GameObjects.Container | null = null;
    /** Phaser DOM element wrapping the <input>. */
    private editInput: Phaser.GameObjects.DOMElement | null = null;
    /** Frame index being edited. */
    private editFrameIndex: number | null = null;

    /** Keyboard keys stored at create() time and reused in update(). */
    private keyEnter: Phaser.Input.Keyboard.Key | null = null;
    private keyEsc: Phaser.Input.Keyboard.Key | null = null;

    constructor() {
        super({ key: 'TranslationModeScene' });
    }

    /**
     * Wire up the model-layer services.  Call this before the scene is
     * first activated (e.g. from OverworldScene.create()).
     */
    setServices(
        tracker: ActiveGlyphTracker,
        dictionary: PlayerTranslationDictionary
    ): void {
        this.glyphTracker = tracker;
        this.translationDict = dictionary;
    }

    create(): void {
        // Full-screen dark overlay (hidden until translation mode is activated)
        this.overlay = this.add.rectangle(
            0, 0,
            this.scale.width,
            this.scale.height,
            0x000000,
            0.55
        );
        this.overlay.setOrigin(0, 0);
        this.overlay.setDepth(DEPTH_OVERLAY);
        this.overlay.setVisible(false);

        // Book-icon toggle button – always visible
        this.bookIcon = this.add.text(12, 12, '📖', { fontSize: '28px' });
        this.bookIcon.setDepth(DEPTH_INPUT_PANEL + 10);
        this.bookIcon.setInteractive({ useHandCursor: true });
        this.bookIcon.on('pointerdown', () => this.toggle());

        // Tab key toggles translation mode
        this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            this.toggle();
        });

        // Store keys used in update() so they are not recreated every frame
        if (this.input.keyboard) {
            this.keyEnter = this.input.keyboard.addKey('ENTER');
            this.keyEsc = this.input.keyboard.addKey('ESC');
        }

        // Start hidden; book icon is the only persistent element
        this.deactivate();
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Toggle translation mode on / off. */
    toggle(): void {
        if (this.overlay?.visible) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    /** Enter translation mode. */
    activate(): void {
        if (!this.glyphTracker || !this.translationDict) return;

        // Pause every running scene except this one
        this.pausedScenes = [];
        for (const scene of this.scene.manager.scenes) {
            const key = scene.sys.settings.key as string;
            if (key !== 'TranslationModeScene' && scene.sys.isActive()) {
                scene.sys.pause();
                this.pausedScenes.push(key);
            }
        }

        this.overlay?.setVisible(true);
        this.buildHighlights();
    }

    /** Exit translation mode and resume all paused scenes. */
    deactivate(): void {
        this.closeEditPanel();
        this.clearHighlights();
        this.overlay?.setVisible(false);

        for (const key of this.pausedScenes) {
            const scene = this.scene.manager.getScene(key);
            if (scene?.sys.isPaused()) {
                scene.sys.resume();
            }
        }
        this.pausedScenes = [];
    }

    // -------------------------------------------------------------------------
    // Highlight management
    // -------------------------------------------------------------------------

    private buildHighlights(): void {
        this.clearHighlights();
        if (!this.glyphTracker || !this.translationDict) return;

        const allBounds = this.glyphTracker.getAllGlyphBounds();

        for (const bounds of allBounds) {
            const { screenX, screenY, tileSize, frameIndex } = bounds;
            const x = screenX - HIGHLIGHT_PADDING;
            const y = screenY - HIGHLIGHT_PADDING;
            const w = tileSize + HIGHLIGHT_PADDING * 2;
            const h = tileSize + HIGHLIGHT_PADDING * 2;

            // Yellow highlight rectangle around the glyph
            const rect = this.add.rectangle(x, y, w, h);
            rect.setOrigin(0, 0);
            rect.setStrokeStyle(2, 0xffff00);
            rect.setFillStyle(0xffff00, 0.15);
            rect.setDepth(DEPTH_HIGHLIGHTS);
            rect.setInteractive({ useHandCursor: true });
            rect.on('pointerdown', () => this.openEditPanel(frameIndex, x, y + h));

            // Translation label below the glyph
            const translation = this.translationDict.getTranslation(frameIndex) ?? '';
            const label = this.add.text(
                screenX + tileSize / 2,
                screenY + tileSize + 4,
                translation,
                {
                    fontSize: '12px',
                    color: '#ffffff',
                    backgroundColor: '#222222',
                    padding: { x: 2, y: 1 },
                }
            );
            label.setOrigin(0.5, 0);
            label.setDepth(DEPTH_LABELS);

            this.highlights.push({ bounds, rect, label });
        }
    }

    private clearHighlights(): void {
        for (const entry of this.highlights) {
            entry.rect.destroy();
            entry.label.destroy();
        }
        this.highlights = [];
    }

    /** Refresh only the label text for a given frame index after an edit. */
    private refreshLabel(frameIndex: number): void {
        for (const entry of this.highlights) {
            if (entry.bounds.frameIndex === frameIndex) {
                const text = this.translationDict?.getTranslation(frameIndex) ?? '';
                entry.label.setText(text);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Edit panel (uses Phaser DOM so the input lives inside the Phaser canvas
    // container rather than being appended to document.body)
    // -------------------------------------------------------------------------

    /**
     * Open the inline translation-edit panel near the given screen position.
     * Uses this.add.dom() so the HTML input element is managed by Phaser and
     * rendered within the game's DOM container.
     */
    private openEditPanel(frameIndex: number, anchorX: number, anchorY: number): void {
        this.closeEditPanel();

        this.editFrameIndex = frameIndex;

        const panelWidth = 300;
        const panelHeight = 110;

        // Keep panel inside viewport
        const px = Math.min(anchorX, this.scale.width - panelWidth - 8);
        const py = Math.min(anchorY + 4, this.scale.height - panelHeight - 8);

        // Phaser canvas-background panel
        const panel = this.add.container(px, py);
        panel.setDepth(DEPTH_INPUT_PANEL);

        const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x333333);
        bg.setOrigin(0, 0);
        bg.setStrokeStyle(2, 0xffffff);
        panel.add(bg);

        const prompt = this.add.text(8, 8, 'Translation for this glyph:', {
            fontSize: '13px',
            color: '#eeeeee',
        });
        panel.add(prompt);

        // Text-input using Phaser's DOM interface (requires dom.createContainer: true
        // in the Phaser game config)
        const currentValue = this.translationDict?.getTranslation(frameIndex) ?? '';
        this.editInput = this.add.dom(
            px + 8,
            py + 34,
            'input',
            {
                type: 'text',
                maxlength: '40',
                value: currentValue,
                style: 'font: 14px monospace; padding: 2px 4px; width: 180px;',
            }
        );
        this.editInput.setOrigin(0, 0);
        this.editInput.setDepth(DEPTH_INPUT_PANEL + 1);
        // Focus the input so the player can type immediately
        (this.editInput.node as HTMLInputElement).focus();

        // OK button
        const okBtn = this.add.text(panelWidth - 100, panelHeight - 28, '[ OK ]', {
            fontSize: '14px',
            color: '#aaffaa',
            backgroundColor: '#334433',
            padding: { x: 4, y: 2 },
        });
        okBtn.setInteractive({ useHandCursor: true });
        okBtn.on('pointerdown', () => this.commitEdit());
        panel.add(okBtn);

        // Cancel button
        const cancelBtn = this.add.text(panelWidth - 48, panelHeight - 28, '[ X ]', {
            fontSize: '14px',
            color: '#ffaaaa',
            backgroundColor: '#443333',
            padding: { x: 4, y: 2 },
        });
        cancelBtn.setInteractive({ useHandCursor: true });
        cancelBtn.on('pointerdown', () => this.closeEditPanel());
        panel.add(cancelBtn);

        this.editPanel = panel;
    }

    /** Commit the typed translation and close the panel. */
    private commitEdit(): void {
        if (this.editFrameIndex !== null && this.editInput && this.translationDict) {
            const inputEl = this.editInput.node as HTMLInputElement;
            this.translationDict.setTranslation(this.editFrameIndex, inputEl.value);
            this.refreshLabel(this.editFrameIndex);
        }
        this.closeEditPanel();
    }

    /** Close the edit panel without saving. */
    private closeEditPanel(): void {
        if (this.editPanel) {
            this.editPanel.destroy();
            this.editPanel = null;
        }
        if (this.editInput) {
            this.editInput.destroy();
            this.editInput = null;
        }
        this.editFrameIndex = null;
    }

    // -------------------------------------------------------------------------
    // Per-frame update: keyboard shortcuts while panel is open
    // -------------------------------------------------------------------------

    update(): void {
        if (!this.editPanel) return;

        if (this.keyEnter && Phaser.Input.Keyboard.JustDown(this.keyEnter)) {
            this.commitEdit();
        }
        if (this.keyEsc && Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
            this.closeEditPanel();
        }
    }
}
