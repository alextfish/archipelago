import type { PuzzleSpellSpec } from '@model/spell/PuzzleSpell';
import { SpellAnimator, type SpellAnimationOptions } from './SpellAnimator';

export class IslandSpellAnimator extends SpellAnimator {
    protected async animateEffect(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void,
        options: SpellAnimationOptions
    ): Promise<void> {
        if (spell.effect.type !== 'island') {
            await applyEffect();
            return;
        }

        if (options.isRepeat) {
            await applyEffect();
            await this.wait(700);
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
