import Phaser from 'phaser';
import type { PuzzleSpellSpec, SpellRect } from '@model/spell/PuzzleSpell';
import { SpellAnimator, type SpellAnimationOptions } from './SpellAnimator';

export class OpenSpellAnimator extends SpellAnimator {
    protected async animateEffect(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void,
        options: SpellAnimationOptions
    ): Promise<void> {
        if (spell.effect.type !== 'open') {
            await applyEffect();
            return;
        }

        if (options.isRepeat) {
            await applyEffect();
            await this.wait(700);
            return;
        }

        const leftWallRect = this.isSpellRect(spell.effect.leftWall) ? spell.effect.leftWall : undefined;
        const rightWallRect = this.isSpellRect(spell.effect.rightWall) ? spell.effect.rightWall : undefined;
        const leftWall = leftWallRect ? this.createWallBlock(leftWallRect) : null;
        const rightWall = rightWallRect ? this.createWallBlock(rightWallRect) : null;
        const wallShiftDistance = 32;

        await Promise.all([
            leftWall ? this.tween({
                targets: leftWall,
                x: leftWall.x - wallShiftDistance,
                duration: 1500,
                ease: 'Sine.easeOut',
            }) : Promise.resolve(),
            rightWall ? this.tween({
                targets: rightWall,
                x: rightWall.x + wallShiftDistance,
                duration: 1500,
                ease: 'Sine.easeOut',
            }) : Promise.resolve()
        ]);

        await applyEffect();
        await this.wait(700);
        leftWall?.destroy();
        rightWall?.destroy();
    }

    private createWallBlock(rect: { x: number; y: number; width: number; height: number }): Phaser.GameObjects.Rectangle {
        return this.scene.add.rectangle(
            rect.x + (rect.width / 2),
            rect.y + (rect.height / 2),
            rect.width,
            rect.height,
            0xffffff,
            0.4
        ).setDepth(246);
    }

    private isSpellRect(rect: unknown): rect is SpellRect {
        if (!rect || typeof rect === 'string') {
            return false;
        }

        return typeof rect.x === 'number' &&
            typeof rect.y === 'number' &&
            typeof rect.width === 'number' &&
            typeof rect.height === 'number';
    }
}
