import Phaser from 'phaser';
import { BridgeSpriteFrames } from '@view/BridgeSpriteFrameRegistry';
import type { PuzzleSpellSpec, SpellGridPoint } from '@model/spell/PuzzleSpell';
import { LanguageGlyphRegistry } from '@model/conversation/LanguageGlyphRegistry';

export abstract class SpellAnimator {
    protected readonly glyphRegistry: LanguageGlyphRegistry = new LanguageGlyphRegistry();

    constructor(
        protected readonly scene: Phaser.Scene,
        protected readonly gridToWorld: (x: number, y: number) => SpellGridPoint,
        protected readonly languageTextureKey: string = 'language',
        protected readonly bridgeTextureKey: string = 'sprout-tiles',
    ) { }

    async play(spell: PuzzleSpellSpec, applyEffect: () => Promise<void> | void): Promise<void> {
        const traceGraphics = this.createTraceGraphics(spell);
        const glyphSprite = this.createGlyphSprite(spell);

        await Promise.all([
            this.fadeGameObject(traceGraphics, 1, 1000),
            glyphSprite ? this.fadeGameObject(glyphSprite, 1, 1000) : Promise.resolve()
        ]);

        await this.animateEffect(spell, applyEffect);

        await Promise.all([
            this.fadeGameObject(traceGraphics, 0, 600),
            glyphSprite ? this.fadeGameObject(glyphSprite, 0, 600) : Promise.resolve()
        ]);

        traceGraphics.destroy();
        glyphSprite?.destroy();
    }

    protected abstract animateEffect(
        spell: PuzzleSpellSpec,
        applyEffect: () => Promise<void> | void
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

    private createTraceGraphics(spell: PuzzleSpellSpec): Phaser.GameObjects.Graphics {
        const graphics = this.scene.add.graphics();
        graphics.setDepth(240);
        graphics.setAlpha(0);
        graphics.lineStyle(8, 0xffffff, 1);

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

    private createGlyphSprite(spell: PuzzleSpellSpec): Phaser.GameObjects.Sprite | null {
        if (!spell.glyphPlacement) {
            return null;
        }

        const frame = spell.glyphPlacement.frame ?? this.defaultGlyphFrame(spell.glyph);
        const position = spell.glyphPlacement.coordinateSpace === 'world'
            ? { x: spell.glyphPlacement.x, y: spell.glyphPlacement.y }
            : this.gridToWorld(spell.glyphPlacement.x, spell.glyphPlacement.y);

        return this.scene.add.sprite(position.x, position.y, this.languageTextureKey, frame)
            .setOrigin(0, 0)
            .setScale(spell.glyphPlacement.scale ?? 1)
            .setDepth(245)
            .setAlpha(0);
    }

    private defaultGlyphFrame(glyph: PuzzleSpellSpec['glyph']): number {
        if (glyph === 'island') {
            return this.glyphRegistry.getGlyphFrame('grass', 'island');
        }
        if (glyph === 'bridge') {
            return this.glyphRegistry.getGlyphFrame('grass', 'bridge');
        }
        return this.glyphRegistry.getGlyphFrame('grass', 'good');
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
