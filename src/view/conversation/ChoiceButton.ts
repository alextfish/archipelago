/**
 * Interactive button for player dialogue choices.
 * Displays English text with hover/click feedback.
 */

import Phaser from 'phaser';

export class ChoiceButton extends Phaser.GameObjects.Container {
    private background: Phaser.GameObjects.Rectangle;
    private textLabel: Phaser.GameObjects.Text;
    private choiceIndex: number;
    private callback: (index: number) => void;

    private readonly normalColor = 0x444444;
    private readonly hoverColor = 0x666666;
    private readonly textColor = '#ffffff';

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        width: number,
        height: number,
        text: string,
        index: number,
        callback: (index: number) => void
    ) {
        super(scene, x, y);

        this.choiceIndex = index;
        this.callback = callback;

        // Create background rectangle
        this.background = scene.add.rectangle(0, 0, width, height, this.normalColor);
        this.background.setStrokeStyle(2, 0x888888);
        this.background.setOrigin(0, 0);
        this.add(this.background);

        // Create text label
        this.textLabel = scene.add.text(width / 2, height / 2, text, {
            fontSize: '18px',
            color: this.textColor,
            fontFamily: 'Arial',
            align: 'center',
        });
        this.textLabel.setOrigin(0.5, 0.5);
        this.add(this.textLabel);

        // Make interactive with explicit hit area
        // Note: Container hit area is relative to container position
        const hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
        this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
        this.input!.cursor = 'pointer';

        // Set up event handlers
        this.on('pointerover', this.onHoverStart, this);
        this.on('pointerout', this.onHoverEnd, this);
        this.on('pointerdown', this.onClick, this);

        scene.add.existing(this);
    }

    /**
     * Handle hover start
     */
    private onHoverStart(): void {
        this.background.setFillStyle(this.hoverColor);
    }

    /**
     * Handle hover end
     */
    private onHoverEnd(): void {
        this.background.setFillStyle(this.normalColor);
    }

    /**
     * Handle click
     */
    private onClick(): void {
        this.callback(this.choiceIndex);
    }

    /**
     * Update the button text
     */
    setText(text: string): void {
        this.textLabel.setText(text);
    }

    /**
     * Enable or disable the button
     */
    setEnabled(enabled: boolean): void {
        this.setInteractive(enabled);
        this.setAlpha(enabled ? 1 : 0.5);
    }
}
