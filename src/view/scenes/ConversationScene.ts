/**
 * Phaser scene for displaying NPC conversations.
 * Implements ConversationHost interface for the controller.
 */

import Phaser from 'phaser';
import type { ConversationHost } from '@controller/ConversationController';
import { ConversationController } from '@controller/ConversationController';
import { SpeechBubble } from '../conversation/SpeechBubble';
import { ChoiceButton } from '../conversation/ChoiceButton';
import type { ConversationSpec, ConversationEffect } from '@model/conversation/ConversationData';
import type { NPC } from '@model/conversation/NPC';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';
import { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';
import { attachTestMarker, isTestMode } from '@helpers/TestMarkers';
import type { ActiveGlyphTracker } from '@model/translation/ActiveGlyphTracker';

export class ConversationScene extends Phaser.Scene implements ConversationHost {
    private controller: ConversationController | null = null;
    private glyphRegistry: LanguageGlyphRegistry;
    private appearanceRegistry: NPCAppearanceRegistry;
    /** Optional glyph tracker injected by OverworldScene for Translation Mode. */
    private glyphTracker: ActiveGlyphTracker | null = null;

    // Debounce for confirm key to prevent rapid-fire advancement
    private lastConfirmTime = 0;
    private readonly CONFIRM_DEBOUNCE_MS = 300;

    // UI elements
    private overlay: Phaser.GameObjects.Rectangle | null = null;
    private speechBubble: SpeechBubble | null = null;
    private choiceButtons: ChoiceButton[] = [];
    private npcPortrait: Phaser.GameObjects.Container | null = null;
    private playerPortrait: Phaser.GameObjects.Container | null = null;
    private currentNPC: NPC | null = null;

    // Constants
    private readonly TILESET_KEY = 'language';
    private readonly SPEECH_BUBBLE_Y = 150;
    private readonly SPEECH_BUBBLE_SCALE = 2;
    private readonly CHOICES_START_Y = 400;
    private readonly CHOICE_HEIGHT = 60;
    private readonly CHOICE_SPACING = 20;
    private readonly CHOICE_WIDTH = 280; // Narrower for horizontal layout
    private readonly PORTRAIT_SIZE = 96;
    private readonly PORTRAIT_SCALE = 2;
    private readonly PORTRAIT_PADDING = 20;

    constructor() {
        super({ key: 'ConversationScene' });
        this.glyphRegistry = new LanguageGlyphRegistry();
        this.appearanceRegistry = new NPCAppearanceRegistry();
    }

    /**
     * Wire up an ActiveGlyphTracker so that speech bubbles register their
     * glyphs for Translation Mode.  Call this from OverworldScene before
     * (or when) launching a conversation.
     */
    setGlyphTracker(tracker: ActiveGlyphTracker): void {
        this.glyphTracker = tracker;
        // If the speech bubble already exists (scene was already created),
        // pass the tracker to it immediately.
        if (this.speechBubble) {
            this.speechBubble.setGlyphTracker(tracker);
        }
    }

    /**
     * Preload assets needed for conversations
     */
    preload(): void {
        // Load language tileset if not already loaded
        const tilesetPath = this.glyphRegistry.getTilesetPath();
        if (!this.textures.exists(this.TILESET_KEY)) {
            this.load.spritesheet(this.TILESET_KEY, tilesetPath, {
                frameWidth: 32,
                frameHeight: 32,
            });
        }

        // Load NPC sprites (sailorNS, sailorEW, Lyuba, Mage4)
        // TODO: Load these based on which NPCs are in the game
        const npcAppearances = ['sailorNS', 'sailorEW', 'Lyuba', 'Mage4'];
        for (const appearanceId of npcAppearances) {
            if (this.appearanceRegistry.hasAppearance(appearanceId)) {
                const spritePath = this.appearanceRegistry.getSpritePath(appearanceId);
                if (!this.textures.exists(appearanceId)) {
                    this.load.spritesheet(appearanceId, spritePath, {
                        frameWidth: 32,
                        frameHeight: 32,
                    });
                }
            }
        }

        // Load high-resolution face sprites for conversations
        const faceSprites = [
            'faces/Lyuba neutral',
            'faces/Lyuba happy',
            'faces/Lyuba frown',
            'faces/Lyuba cleric neutral',
            'faces/Lyuba cleric happy',
            'faces/Lyuba cleric frown',
            'faces/Lyuba cleric vhappy',
            'faces/Lyuba cleric wink',
            'faces/Ruby neutral',
            'faces/Ruby happy',
            'faces/Ruby frown',
            'faces/Ruby vhappy',
            'faces/Ruby wink',
        ];
        for (const faceKey of faceSprites) {
            if (!this.textures.exists(faceKey)) {
                this.load.image(faceKey, `resources/sprites/${faceKey}.png`);
            }
        }
    }

    /**
     * Create the conversation UI
     */
    create(): void {
        // Create semi-transparent overlay
        this.overlay = this.add.rectangle(
            0,
            0,
            this.scale.width,
            this.scale.height,
            0xffffff,
            0.5
        );
        this.overlay.setOrigin(0, 0);
        this.overlay.setDepth(0);

        // Create speech bubble
        this.speechBubble = new SpeechBubble(this, this.TILESET_KEY);
        this.speechBubble.setDepth(10);
        // If a tracker was provided before create() was called, wire it up now
        if (this.glyphTracker) {
            this.speechBubble.setGlyphTracker(this.glyphTracker);
        }

        // Set up keyboard navigation for choices
        this.setupKeyboardNavigation();

        // Initially hidden
        this.setVisible(false);
    }

    /**
     * Start a conversation with an NPC
     */
    startConversation(spec: ConversationSpec, npc: NPC): void {
        console.log('ConversationScene: startConversation called', { spec, npc });

        this.currentNPC = npc;

        // Create controller if not exists
        if (!this.controller) {
            console.log('ConversationScene: Creating new controller');
            this.controller = new ConversationController(
                this,
                this.glyphRegistry,
                this.appearanceRegistry
            );
        }

        // Create portraits
        this.createPortraits(npc);

        // Make sure the scene itself is visible
        console.log('ConversationScene: Making scene visible');
        this.scene.setVisible(true, 'ConversationScene');

        // Show UI elements
        console.log('ConversationScene: Setting UI visible to true');
        this.setVisible(true);

        // Start conversation through controller
        console.log('ConversationScene: Starting conversation through controller');
        this.controller.startConversation(spec, npc);

        console.log('ConversationScene: startConversation complete');
    }    /**
     * ConversationHost interface: Display NPC line
     */
    displayNPCLine(expression: string, glyphFrames: number[], language: string, customFrame?: string): void {
        console.log('ConversationScene: displayNPCLine called', { expression, glyphFrames: glyphFrames.length, language, customFrame });

        if (!this.speechBubble) return;

        // Create/update speech bubble with 2x scale
        this.speechBubble.create(glyphFrames, language, this.glyphRegistry, this.SPEECH_BUBBLE_SCALE);

        // Center the speech bubble horizontally (accounting for scale)
        const bubbleWidth = (glyphFrames.length + 2) * 32 * this.SPEECH_BUBBLE_SCALE;
        const bubbleX = (this.scale.width - bubbleWidth) / 2;
        this.speechBubble.setPosition(bubbleX, this.SPEECH_BUBBLE_Y);
        this.speechBubble.setVisible(true);

        console.log('ConversationScene: Speech bubble displayed');

        // Update NPC portrait
        if (this.npcPortrait && this.currentNPC) {
            let frameKey = customFrame;

            // If no custom frame provided, try to get face texture from appearance registry
            if (!frameKey) {
                const faceKey = this.appearanceRegistry.getFaceTextureKey(
                    this.currentNPC.appearanceId,
                    expression
                );

                // Only use face texture if it exists
                if (faceKey && this.textures.exists(faceKey)) {
                    frameKey = faceKey;
                }
            }

            if (frameKey) {
                this.updatePortraitFrame(this.npcPortrait, frameKey);
            }
        }
    }

    /**
     * ConversationHost interface: Display player choices
     */
    displayChoices(choices: Array<{ text: string; index: number }>): void {
        console.log('ConversationScene: displayChoices called with', choices.length, 'choices');

        // Clear existing choice buttons
        this.clearChoices();

        // If no choices, show a "[Leave]" button to dismiss the conversation
        if (choices.length === 0) {
            console.log('ConversationScene: No choices, showing [Leave] button');
            const centerX = this.scale.width / 2;
            const button = new ChoiceButton(
                this,
                centerX - this.CHOICE_WIDTH / 2,
                this.CHOICES_START_Y,
                this.CHOICE_WIDTH,
                this.CHOICE_HEIGHT,
                '[Leave]',
                -1, // Special index for continue
                () => this.onContinueClicked()
            );
            button.setDepth(10);
            this.choiceButtons.push(button);

            // Add test marker for automation
            if (isTestMode()) {
                attachTestMarker(this, button, {
                    id: 'choice-leave',
                    testId: 'choice-leave',
                    width: this.CHOICE_WIDTH,
                    height: this.CHOICE_HEIGHT,
                    showBorder: true,
                    onClick: () => this.onContinueClicked()
                });
                console.log('[TEST] Added test marker for Leave button');
            }

            console.log('ConversationScene: [Leave] button created');
            return;
        }

        // Create choice buttons horizontally for multiple choices
        const centerX = this.scale.width / 2;
        const totalWidth = choices.length * this.CHOICE_WIDTH + (choices.length - 1) * this.CHOICE_SPACING;
        let currentX = centerX - totalWidth / 2;

        for (const choice of choices) {
            const button = new ChoiceButton(
                this,
                currentX,
                this.CHOICES_START_Y,
                this.CHOICE_WIDTH,
                this.CHOICE_HEIGHT,
                choice.text,
                choice.index,
                (index: number) => this.onChoiceSelected(index)
            );
            button.setDepth(10);
            this.choiceButtons.push(button);

            // Add test marker for automation
            if (isTestMode()) {
                // Normalize choice text to create a valid ID (remove spaces, special chars)
                const normalizedText = choice.text.toLowerCase().replace(/[^a-z0-9]/g, '-');
                attachTestMarker(this, button, {
                    id: `choice-${choice.index}-${normalizedText}`,
                    testId: `choice-${normalizedText}`,
                    width: this.CHOICE_WIDTH,
                    height: this.CHOICE_HEIGHT,
                    showBorder: true,
                    onClick: () => this.onChoiceSelected(choice.index)
                });
                console.log(`[TEST] Added test marker for choice: "${choice.text}" (choice-${normalizedText})`);
            }

            currentX += this.CHOICE_WIDTH + this.CHOICE_SPACING;
        }

        // Auto-focus the first choice so E/SPACE immediately selects it without
        // requiring the player to press Left/Right first.
        this.controller?.focusNextChoice();
        this.updateChoiceFocus();

        console.log('ConversationScene: Choice buttons created');
    }

    /**
     * Handle choice selection
     */
    private onChoiceSelected(index: number): void {
        if (!this.controller) return;

        // Disable all choice buttons to prevent double-clicking
        for (const button of this.choiceButtons) {
            button.setEnabled(false);
        }

        this.controller.selectChoice(index);
    }

    /**
     * Handle continue button click (when conversation has ended with final message)
     */
    private onContinueClicked(): void {
        console.log('ConversationScene: Continue button clicked, ending conversation');
        if (this.controller) {
            this.controller.endConversation(); // Emit test event and clear state
        }
        this.hideConversation();
        this.onConversationEnd();
    }

    /**
     * ConversationHost interface: Hide conversation UI
     */
    hideConversation(): void {
        console.log('ConversationScene: hideConversation called');
        this.setVisible(false);
        this.clearChoices();

        if (this.speechBubble) {
            this.speechBubble.clear();
            this.speechBubble.setVisible(false);
        }

        // Hide portraits
        if (this.npcPortrait) {
            this.npcPortrait.setVisible(false);
        }
        if (this.playerPortrait) {
            this.playerPortrait.setVisible(false);
        }
    }

    /**
     * ConversationHost interface: Apply conversation effects
     */
    applyEffects(effects: ConversationEffect[]): void {
        // This will be handled by the game state/overworld scene
        // For now, just emit an event
        this.events.emit('conversationEffects', effects);
    }

    /**
     * ConversationHost interface: Conversation ended
     */
    onConversationEnd(): void {
        console.log('ConversationScene: onConversationEnd called');

        // Notify overworld that conversation has ended
        this.events.emit('conversationEnded');
    }

    /**
     * Clear all choice buttons
     */
    private clearChoices(): void {
        for (const button of this.choiceButtons) {
            button.destroy();
        }
        this.choiceButtons = [];
    }

    /**
     * Set overall scene visibility
     */
    private setVisible(visible: boolean): void {
        if (this.overlay) this.overlay.setVisible(visible);
        if (this.speechBubble) this.speechBubble.setVisible(visible);

        for (const button of this.choiceButtons) {
            button.setVisible(visible);
        }

        if (this.npcPortrait) this.npcPortrait.setVisible(visible);
        if (this.playerPortrait) this.playerPortrait.setVisible(visible);
    }

    /**
     * Force end conversation (e.g., Escape key)
     */
    forceEndConversation(): void {
        if (this.controller) {
            this.controller.forceEnd();
        }
    }

    /**
     * Set up keyboard listeners for navigating and selecting conversation choices.
     * LEFT/RIGHT arrows cycle focus; E or SPACE confirms the focused choice.
     */
    private setupKeyboardNavigation(): void {
        if (!this.input.keyboard) return;

        this.input.keyboard.on('keydown-LEFT', () => {
            if (!this.controller?.isActive()) return;
            this.controller.focusPreviousChoice();
            this.updateChoiceFocus();
        });

        this.input.keyboard.on('keydown-RIGHT', () => {
            if (!this.controller?.isActive()) return;
            this.controller.focusNextChoice();
            this.updateChoiceFocus();
        });

        for (const key of ['keydown-E', 'keydown-SPACE']) {
            this.input.keyboard.on(key, () => this.onConfirmKey());
        }
    }

    /**
     * Handle E or SPACE key press: select focused choice, or trigger leave if only
     * the leave button is showing.
     */
    private onConfirmKey(): void {
        const now = Date.now();
        if (now - this.lastConfirmTime < this.CONFIRM_DEBOUNCE_MS) return;
        this.lastConfirmTime = now;

        const focusedIndex = this.controller?.isActive()
            ? this.controller.getFocusedChoiceIndex()
            : null;

        if (focusedIndex !== null) {
            this.onChoiceSelected(focusedIndex);
        } else if (this.choiceButtons.length === 1) {
            this.onContinueClicked();
        }
    }

    /**
     * Update choice button highlight colours to reflect the current keyboard focus.
     */
    private updateChoiceFocus(): void {
        const focusedIndex = this.controller?.getFocusedChoiceIndex() ?? null;
        for (let i = 0; i < this.choiceButtons.length; i++) {
            this.choiceButtons[i].setFocused(i === focusedIndex);
        }
    }

    /**
     * Check if conversation is active
     */
    isConversationActive(): boolean {
        return this.controller !== null && this.controller.isActive();
    }

    /**
     * Create NPC and player portraits
     */
    private createPortraits(npc: NPC): void {
        // Clear existing portraits
        if (this.npcPortrait) {
            this.npcPortrait.destroy();
        }
        if (this.playerPortrait) {
            this.playerPortrait.destroy();
        }

        // Get NPC appearance info
        const appearance = this.appearanceRegistry.getAppearance(npc.appearanceId);
        if (!appearance) {
            console.warn(`No appearance found for NPC ${npc.appearanceId}`);
            return;
        }

        // Create NPC portrait (top left)
        this.npcPortrait = this.createPortrait(
            appearance.spriteKey,
            0, // neutral expression
            this.PORTRAIT_PADDING,
            this.PORTRAIT_PADDING
        );

        // Create player portrait (top right)
        // TODO: Get player sprite key from game state
        this.playerPortrait = this.createPortrait(
            'player_face', // Player sprite key
            0, // neutral frame
            this.scale.width - this.PORTRAIT_PADDING - (this.PORTRAIT_SIZE * this.PORTRAIT_SCALE),
            this.PORTRAIT_PADDING
        );
    }

    /**
     * Create a single portrait sprite with border
     */
    private createPortrait(spriteKey: string, frame: number, x: number, y: number): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        // Create border background (slightly larger than sprite)
        const spriteSize = this.PORTRAIT_SIZE * this.PORTRAIT_SCALE;
        const borderPadding = 4;
        const borderSize = spriteSize + (borderPadding * 2);

        const border = this.add.rectangle(
            -borderPadding,
            -borderPadding,
            borderSize,
            borderSize,
            0x333333
        );
        border.setStrokeStyle(4, 0xffffff);
        border.setOrigin(0, 0);
        container.add(border);

        // Create sprite at 4x scale
        const sprite = this.add.sprite(0, 0, spriteKey, frame);
        sprite.setOrigin(0, 0);
        sprite.setScale(this.PORTRAIT_SCALE);
        container.add(sprite);

        container.setDepth(15); // Above other UI elements

        return container;
    }

    /**
     * Update portrait to use a different sprite frame
     */
    private updatePortraitFrame(portrait: Phaser.GameObjects.Container, spriteKey: string): void {
        // Get the sprite from the container (index 1, after the border)
        const sprite = portrait.getAt(1) as Phaser.GameObjects.Sprite;
        if (sprite) {
            sprite.setTexture(spriteKey, 0);
        }
    }
}
