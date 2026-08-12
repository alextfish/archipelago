import Phaser from 'phaser';
import type { PuzzleSpellSpec } from '@model/spell/PuzzleSpell';
import { SpellAnimator } from './SpellAnimator';

export class OpenSpellAnimator extends SpellAnimator {
    protected async animateEffect(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void
    ): Promise<void> {
        if (spell.effect.type !== 'open') {
            await applyEffect();
            return;
        }

        const leftWall = spell.effect.leftWall ? this.createWallBlock(spell.effect.leftWall) : null;
        const rightWall = spell.effect.rightWall ? this.createWallBlock(spell.effect.rightWall) : null;

        await Promise.all([
            leftWall ? this.tween({
                targets: leftWall,
                x: leftWall.x - 24,
                duration: 1500,
                ease: 'Sine.easeOut',
            }) : Promise.resolve(),
            rightWall ? this.tween({
                targets: rightWall,
                x: rightWall.x + 24,
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
}
