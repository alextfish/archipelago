#!/usr/bin/env node
/**
 * Automated test for Translation Mode in an overworld puzzle context.
 * This script will:
 * 1. Start the player at the "forestPuzzle0" player start (adjacent to forest puzzle 0)
 * 2. Press E to enter the overworld puzzle
 * 3. Click island at grid (2,3) then (5,3) to place a bridge that violates a constraint
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
 * Compute the screen coordinates of the centre of a puzzle grid cell by
 * reading the overworld camera and the active EmbeddedPuzzleRenderer from
 * inside the browser, then click there.
 */
async function clickOverworldPuzzleGrid(page, gridX, gridY) {
    const coords = await page.evaluate((gx, gy) => {
        const game = window.game;
        if (!game) return null;
        const scene = game.scene.getScene('OverworldScene');
        if (!scene) return null;
        const pc = scene.puzzleController;
        if (!pc) return null;
        const renderer = pc.puzzleRenderer;
        if (!renderer) return null;

        // gridToWorld returns top-left of the cell; add half cell size for centre
        const cellSize = 32;
        const worldPos = renderer.gridToWorld(gx, gy);
        const worldCentreX = worldPos.x + cellSize / 2;
        const worldCentreY = worldPos.y + cellSize / 2;

        const cam = scene.cameras.main;
        // Phaser world-to-screen: screenX = cam.x + (worldX - cam.scrollX) * cam.zoom
        const screenX = cam.x + (worldCentreX - cam.scrollX) * cam.zoom;
        const screenY = cam.y + (worldCentreY - cam.scrollY) * cam.zoom;

        return { screenX, screenY, worldX: worldCentreX, worldY: worldCentreY, zoom: cam.zoom };
    }, gridX, gridY);

    if (!coords) {
        throw new Error(`Could not compute screen position for grid (${gridX}, ${gridY})`);
    }

    console.log(
        `[TEST] Grid (${gridX},${gridY}) -> World (${coords.worldX.toFixed(0)},${coords.worldY.toFixed(0)}) ` +
        `-> Screen (${coords.screenX.toFixed(0)},${coords.screenY.toFixed(0)}) [zoom=${coords.zoom.toFixed(2)}]`
    );

    await page.mouse.click(coords.screenX, coords.screenY);
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

        console.log('[TEST] Clicking island at grid (5,3)...');
        await clickOverworldPuzzleGrid(page, 5, 3);

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
