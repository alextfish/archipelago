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

export class ConversationScene extends Phaser.Scene implements ConversationHost {
    private controller: ConversationController | null = null;
    private glyphRegistry: LanguageGlyphRegistry;
    private appearanceRegistry: NPCAppearanceRegistry;

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
    private readonly PORTRAIT_SCALE = 4;
    private readonly PORTRAIT_PADDING = 20;

    constructor() {
        super({ key: 'ConversationScene' });
        this.glyphRegistry = new LanguageGlyphRegistry();
        this.appearanceRegistry = new NPCAppearanceRegistry();
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

        // Load NPC sprites (sailorNS and sailorEW)
        // TODO: Load these based on which NPCs are in the game
        const npcAppearances = ['sailorNS', 'sailorEW'];
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
    displayNPCLine(expression: string, glyphFrames: number[], language: string): void {
        console.log('ConversationScene: displayNPCLine called', { expression, glyphFrames: glyphFrames.length, language });

        if (!this.speechBubble) return;

        // Create/update speech bubble with 2x scale
        this.speechBubble.create(glyphFrames, language, this.glyphRegistry, this.SPEECH_BUBBLE_SCALE);

        // Center the speech bubble horizontally (accounting for scale)
        const bubbleWidth = (glyphFrames.length + 2) * 32 * this.SPEECH_BUBBLE_SCALE;
        const bubbleX = (this.scale.width - bubbleWidth) / 2;
        this.speechBubble.setPosition(bubbleX, this.SPEECH_BUBBLE_Y);
        this.speechBubble.setVisible(true);

        console.log('ConversationScene: Speech bubble displayed');

        // TODO: Update NPC sprite expression
        // For now, we'll implement sprite display later
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

            currentX += this.CHOICE_WIDTH + this.CHOICE_SPACING;
        }

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
            'builder', // Player sprite key
            0, // neutral frame
            this.scale.width - this.PORTRAIT_PADDING - (32 * this.PORTRAIT_SCALE),
            this.PORTRAIT_PADDING
        );
    }

    /**
     * Create a single portrait sprite with border
     */
    private createPortrait(spriteKey: string, frame: number, x: number, y: number): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        // Create border background (slightly larger than sprite)
        const spriteSize = 32 * this.PORTRAIT_SCALE;
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
}
