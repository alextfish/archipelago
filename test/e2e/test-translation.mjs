#!/usr/bin/env node
/**
 * Automated test for Translation Mode in an overworld puzzle context.
 * This script will:
 * 1. Start the player at the "forestPuzzle0" player start (adjacent to forest puzzle 0)
 * 2. Press E to enter the overworld puzzle
 * 3. Click island at grid (2,3) then (6,3) to place a bridge that violates a constraint
 * 4. Verify that the constraint violation registered glyphs via ActiveGlyphTracker
 * 5. Press Tab to enter Translation Mode
 * 6. Verify that TranslationModeScene built highlights from those glyphs
 */

import {
    initTest,
    navigateAndWaitForLoad,
    waitForGameEvent
} from '../playwright/helpers.mjs';

/**
 * Directly invoke tryPlaceAt on the active PuzzleController for the given
 * overworld puzzle grid cell.  This bypasses screen-coordinate arithmetic
 * entirely — the PuzzleController only needs grid coords to place a bridge.
 */
async function clickOverworldPuzzleGrid(page, gridX, gridY) {
    const result = await page.evaluate(({ gx, gy }) => {
        const game = window.game;
        if (!game) return { error: 'no game' };
        const scene = game.scene.getScene('OverworldScene');
        if (!scene) return { error: 'no OverworldScene' };
        const pc = scene.puzzleController;
        if (!pc) return { error: 'no puzzleController' };
        const controller = pc.activePuzzleController;
        if (!controller) return { error: 'no activePuzzleController' };

        controller.tryPlaceAt(gx, gy);
        return { ok: true };
    }, { gx: gridX, gy: gridY });

    if (!result || result.error) {
        throw new Error(`clickOverworldPuzzleGrid(${gridX},${gridY}) failed: ${result?.error}`);
    }

    console.log(`[TEST] Triggered island click at grid (${gridX},${gridY})`);
    await page.waitForTimeout(300);
}

async function runTest() {
    const { page, cleanup } = await initTest({
        name: 'Translation Mode',
        playerStartID: 'forestPuzzle0',
        headless: false,
        slowMo: 100
    });

    try {
        await navigateAndWaitForLoad(page);

        // Basic sanity check
        console.log('[TEST] Looking for test markers...');
        const npcMarkers = await page.$$('[data-testid^="npc-"]');
        console.log(`[TEST] Found ${npcMarkers.length} NPC markers`);

        if (npcMarkers.length === 0) {
            console.error('[TEST] No NPC markers found! Test markers may not be enabled.');
            await cleanup('No NPC markers found');
            return;
        }

        // Press E to enter the overworld puzzle (player starts adjacent to it)
        console.log('[TEST] Pressing E to enter overworld puzzle...');
        await page.keyboard.press('e');

        // Wait for puzzle to be entered
        console.log('[TEST] Waiting for puzzle_entered event...');
        await waitForGameEvent(page, 'puzzle_entered', 15000);
        console.log('[TEST] ✅ Puzzle entered');

        // Allow camera transition to finish
        await page.waitForTimeout(2000);

        // Click island at grid (2,3) then (5,3) to place a bridge
        console.log('[TEST] Clicking island at grid (2,3)...');
        await clickOverworldPuzzleGrid(page, 2, 3);

        console.log('[TEST] Clicking island at grid (6,3)...');
        await clickOverworldPuzzleGrid(page, 6, 3);

        // Verify the bridge was actually placed before checking for constraint feedback
        const bridgeCount = await page.evaluate(() => {
            const scene = window.game?.scene.getScene('OverworldScene');
            const pc = scene?.puzzleController;
            const controller = pc?.activePuzzleController;
            if (!controller) return -1;
            return controller.puzzle.placedBridges.length;
        });
        console.log(`[TEST] Placed bridge count: ${bridgeCount}`);
        if (bridgeCount <= 0) {
            throw new Error(`Expected ≥1 placed bridge after clicking islands, but found ${bridgeCount}`);
        }
        console.log('[TEST] ✅ Bridge placed successfully');

        // Wait for constraint feedback
        await page.waitForTimeout(1000);

        // Verify glyphs were registered by the constraint violation speech bubble
        const glyphCount = await page.evaluate(() => {
            const scene = window.game?.scene.getScene('OverworldScene');
            const tracker = scene?.gameState?.glyphTracker;
            return tracker ? tracker.getRegistrations().size : -1;
        });
        console.log(`[TEST] ActiveGlyphTracker registration count: ${glyphCount}`);
        if (glyphCount <= 0) {
            throw new Error(`Expected ≥1 glyph registration from constraint violation, but got ${glyphCount}`);
        }
        console.log('[TEST] ✅ Constraint violation speech bubble registered glyphs');

        // Press Tab to activate Translation Mode
        console.log('[TEST] Pressing Tab to activate Translation Mode...');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(500);

        // Verify TranslationModeScene built highlights from the registered glyphs
        const highlightCount = await page.evaluate(() => {
            const scene = window.game?.scene.getScene('TranslationModeScene');
            if (!scene) return -1;
            const overlay = scene.overlay;
            if (!overlay || !overlay.visible) return 0;
            const highlights = scene.highlights;
            return Array.isArray(highlights) ? highlights.length : -1;
        });
        console.log(`[TEST] TranslationModeScene highlight count: ${highlightCount}`);
        if (highlightCount <= 0) {
            throw new Error(`Expected ≥1 glyph highlight in TranslationModeScene, but got ${highlightCount}`);
        }
        console.log('[TEST] ✅ TranslationModeScene highlighted glyphs from constraint speech bubble');

        console.log('[TEST] Translation mode test completed successfully!');
        await cleanup('Test success - translation mode verified');

    } catch (error) {
        console.error('[TEST] Error during test:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

runTest().catch(console.error);
