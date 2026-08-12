import type { PuzzleSpellSpec } from '@model/spell/PuzzleSpell';
import { SpellAnimator } from './SpellAnimator';

export class IslandSpellAnimator extends SpellAnimator {
    protected async animateEffect(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void
    ): Promise<void> {
        if (spell.effect.type !== 'island') {
            await applyEffect();
            return;
        }

        const islandSprite = this.createIslandSprite(spell.effect.island);
        islandSprite.y += 24;

        await this.tween({
            targets: islandSprite,
            alpha: 1,
            y: islandSprite.y - 24,
            duration: 1800,
            ease: 'Sine.easeOut',
        });

        await applyEffect();
        await this.wait(700);
        islandSprite.destroy();
    }
}
