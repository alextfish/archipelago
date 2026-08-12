import Phaser from 'phaser';
import { BridgeSpriteFrames } from '@view/BridgeSpriteFrameRegistry';
import type {
    PuzzleSpellSpec,
    SpellGridPoint,
    SpellNearbyGlyphPlacement,
} from '@model/spell/PuzzleSpell';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';

export interface SpellAnimationOptions {
    isRepeat?: boolean;
}

export abstract class SpellAnimator {
    protected readonly glyphRegistry: LanguageGlyphRegistry = new LanguageGlyphRegistry();
    protected static readonly REPEAT_TINT = 0x8a8a8a;
    protected static readonly DEFAULT_TINT = 0xffffff;

    constructor(
        protected readonly scene: Phaser.Scene,
        protected readonly gridToWorld: (x: number, y: number) => SpellGridPoint,
        protected readonly languageTextureKey: string = 'language',
        protected readonly bridgeTextureKey: string = 'sprout-tiles',
    ) { }

    async play(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void,
        options: SpellAnimationOptions = {}
    ): Promise<void> {
        const tint = this.getTint(options);
        const traceGraphics = this.createTraceGraphics(spell, tint);
        const glyphSprites = this.createGlyphSprites(spell, tint);

        const fadeInTargets: Promise<void>[] = [
            this.fadeGameObject(traceGraphics, 1, 1000),
            ...glyphSprites.map((glyphSprite) => this.fadeGameObject(glyphSprite, 1, 1000))
        ];
        await Promise.all(fadeInTargets);

        await this.animateEffect(spell, applyEffect, options);

        const fadeOutTargets: Promise<void>[] = [
            this.fadeGameObject(traceGraphics, 0, 600),
            ...glyphSprites.map((glyphSprite) => this.fadeGameObject(glyphSprite, 0, 600))
        ];
        await Promise.all(fadeOutTargets);

        traceGraphics.destroy();
        for (const glyphSprite of glyphSprites) {
            glyphSprite.destroy();
        }
    }

    protected abstract animateEffect(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void,
        options: SpellAnimationOptions
    ): Promise<void>;

    protected createIslandSprite(point: SpellGridPoint): Phaser.GameObjects.Sprite {
        const world = this.gridToWorld(point.x, point.y);
        return this.scene.add.sprite(
            world.x,
            world.y,
            this.bridgeTextureKey,
            BridgeSpriteFrames.FRAME_ISLAND
        ).setOrigin(0, 0).setDepth(250).setAlpha(0);
    }

    protected wait(duration: number): Promise<void> {
        return new Promise((resolve) => {
            this.scene.time.delayedCall(duration, () => resolve());
        });
    }

    protected tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
        return new Promise((resolve) => {
            this.scene.tweens.add({
                ...config,
                onComplete: () => {
                    config.onComplete?.();
                    resolve();
                }
            });
        });
    }

    protected getTint(options: SpellAnimationOptions): number {
        return options.isRepeat ? SpellAnimator.REPEAT_TINT : SpellAnimator.DEFAULT_TINT;
    }

    private createTraceGraphics(spell: PuzzleSpellSpec, tint: number): Phaser.GameObjects.Graphics {
        const graphics = this.scene.add.graphics();
        graphics.setDepth(240);
        graphics.setAlpha(0);
        graphics.lineStyle(8, tint, 1);

        for (const component of spell.trace.components) {
            for (const bridge of component.bridges) {
                const start = this.resolveSpellPoint(bridge.start);
                const end = this.resolveSpellPoint(bridge.end);
                if (!start || !end) {
                    continue;
                }

                const worldStart = this.gridToWorld(start.x, start.y);
                const worldEnd = this.gridToWorld(end.x, end.y);
                graphics.beginPath();
                graphics.moveTo(worldStart.x + 16, worldStart.y + 16);
                graphics.lineTo(worldEnd.x + 16, worldEnd.y + 16);
                graphics.strokePath();
            }
        }

        return graphics;
    }

    private createGlyphSprites(spell: PuzzleSpellSpec, tint: number): Phaser.GameObjects.Sprite[] {
        const sprites: Phaser.GameObjects.Sprite[] = [];
        const mainGlyphSprite = this.createGlyphSprite(
            spell.glyphPlacement,
            spell.glyphLanguage ?? 'fire',
            spell.glyph,
            tint
        );
        if (mainGlyphSprite) {
            sprites.push(mainGlyphSprite);
        }

        for (const nearbyGlyph of spell.nearbyGlyphs ?? []) {
            const glyphSprite = this.createNearbyGlyphSprite(nearbyGlyph, tint);
            if (glyphSprite) {
                sprites.push(glyphSprite);
            }
        }

        return sprites;
    }

    private createNearbyGlyphSprite(nearbyGlyph: SpellNearbyGlyphPlacement, tint: number): Phaser.GameObjects.Sprite | null {
        return this.createGlyphSprite(
            nearbyGlyph,
            nearbyGlyph.language ?? 'fire',
            nearbyGlyph.word,
            tint
        );
    }

    private createGlyphSprite(
        glyphPlacement: PuzzleSpellSpec['glyphPlacement'] | SpellNearbyGlyphPlacement | undefined,
        language: 'grass' | 'fire',
        glyphWord: PuzzleSpellSpec['glyph'] | string,
        tint: number
    ): Phaser.GameObjects.Sprite | null {
        if (!glyphPlacement) {
            return null;
        }

        const frame = glyphPlacement.frame ?? this.glyphRegistry.getGlyphFrame(language, glyphWord);
        const position = glyphPlacement.coordinateSpace === 'world'
            ? { x: glyphPlacement.x, y: glyphPlacement.y }
            : this.gridToWorld(glyphPlacement.x, glyphPlacement.y);

        return this.scene.add.sprite(position.x, position.y, this.languageTextureKey, frame)
            .setOrigin(0, 0)
            .setScale(glyphPlacement.scale ?? 1)
            .setDepth(245)
            .setTint(tint)
            .setAlpha(0);
    }

    private resolveSpellPoint(ref: string | SpellGridPoint): SpellGridPoint | null {
        return typeof ref === 'string' ? null : ref;
    }

    private fadeGameObject(target: Phaser.GameObjects.GameObject, alpha: number, duration: number): Promise<void> {
        return this.tween({
            targets: target,
            alpha,
            duration,
        });
    }
}
