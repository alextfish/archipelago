import type { PuzzleSpellSpec } from '@model/spell/PuzzleSpell';
import { SpellAnimator } from './SpellAnimator';

export class BridgeSpellAnimator extends SpellAnimator {
    protected async animateEffect(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void
    ): Promise<void> {
        if (spell.effect.type !== 'bridge') {
            await applyEffect();
            return;
        }

        const graphics = this.scene.add.graphics().setDepth(246).setAlpha(0);
        graphics.lineStyle(6, 0xffffff, 1);
        const start = this.gridToWorld(spell.effect.start.x, spell.effect.start.y);
        const end = this.gridToWorld(spell.effect.end.x, spell.effect.end.y);
        graphics.beginPath();
        graphics.moveTo(start.x + 16, start.y + 16);
        graphics.lineTo(end.x + 16, end.y + 16);
        graphics.strokePath();

        await this.tween({
            targets: graphics,
            alpha: 1,
            duration: 700,
        });
        await this.wait(900);
        await applyEffect();
        await this.tween({
            targets: graphics,
            alpha: 0,
            duration: 500,
        });
        graphics.destroy();
    }
}
