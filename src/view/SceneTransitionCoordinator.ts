import Phaser from 'phaser';
import type { PlayerController } from '@view/PlayerController';
import type { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';

export interface SceneTransitionContext {
    scene: Phaser.Scene;
    playerController?: PlayerController;
    hud?: OverworldHUDScene | null;
    onDisable?: () => void;
    onEnable?: () => void;
}

export class SceneTransitionCoordinator {
    static readonly DEFAULT_FADE_DURATION_MS = 400;

    static disableInteraction(context: SceneTransitionContext): void {
        context.onDisable?.();
        context.scene.input.enabled = false;
        if (context.scene.input.keyboard) {
            context.scene.input.keyboard.enabled = false;
        }

        context.playerController?.stopAndIdle();
        context.playerController?.setEnabled(false);
    }

    static enableInteraction(context: SceneTransitionContext): void {
        context.onEnable?.();
        context.scene.input.enabled = true;
        if (context.scene.input.keyboard) {
            context.scene.input.keyboard.enabled = true;
        }

        context.playerController?.setEnabled(true);
    }

    static async fadeOutAndDisable(
        context: SceneTransitionContext,
        durationMs: number = SceneTransitionCoordinator.DEFAULT_FADE_DURATION_MS,
    ): Promise<void> {
        SceneTransitionCoordinator.disableInteraction(context);
        await context.hud?.fadeOutToBlack(durationMs);
    }

    static async fadeInAndEnable(
        context: SceneTransitionContext,
        durationMs: number = SceneTransitionCoordinator.DEFAULT_FADE_DURATION_MS,
    ): Promise<void> {
        await context.hud?.fadeInFromBlack(durationMs);
        SceneTransitionCoordinator.enableInteraction(context);
    }
}