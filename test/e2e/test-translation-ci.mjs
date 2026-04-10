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
 * Diagnostic helper: check for document overflow and identify offending elements.
 * Logs detailed information about viewport vs. document dimensions, all
 * absolutely/fixed-positioned elements that extend beyond the viewport, the
 * Phaser canvas rect, and the game-container / Phaser DOM container rects.
 *
 * Run this at any point in the test to capture a snapshot of the layout state.
 */
async function runViewportDiagnostics(page, label = '') {
    const prefix = label ? `[DIAG:${label}]` : '[DIAG]';

    // Tolerance (px) for rounding when deciding an element has reached the document edge.
    const OVERFLOW_TOLERANCE_PX = 2;
    // Cap the number of off-screen elements reported to avoid log spam.
    const MAX_REPORTED_ELEMENTS = 30;

    const info = await page.evaluate(({ overflowTolerance, maxReported }) => {
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
        };

        const docSize = {
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            bodyScrollWidth: document.body.scrollWidth,
            bodyScrollHeight: document.body.scrollHeight
        };

        const hasHorizontalOverflow = docSize.scrollWidth > viewport.width;
        const hasVerticalOverflow   = docSize.scrollHeight > viewport.height;

        // Scan every element for anything that extends beyond the viewport.
        const allElements = Array.from(document.querySelectorAll('*'));
        const offscreen = [];
        for (const el of allElements) {
            const style = window.getComputedStyle(el);
            // Only care about absolutely / fixedly positioned elements – these
            // are the ones that can push the scroll area outward.
            if (style.position !== 'absolute' && style.position !== 'fixed') continue;

            const rect = el.getBoundingClientRect();
            // Adjust for current scroll so we see the true document position.
            const docLeft   = rect.left   + window.scrollX;
            const docTop    = rect.top    + window.scrollY;
            const docRight  = rect.right  + window.scrollX;
            const docBottom = rect.bottom + window.scrollY;

            const overflowsRight  = docRight  > docSize.scrollWidth  - overflowTolerance;
            const overflowsBottom = docBottom > docSize.scrollHeight - overflowTolerance;
            const isLargeOffset   = docLeft > viewport.width || docTop > viewport.height;

            if (overflowsRight || overflowsBottom || isLargeOffset) {
                offscreen.push({
                    tag:      el.tagName,
                    id:       el.id || '(none)',
                    testId:   el.dataset.testid || '(none)',
                    className: el.className || '',
                    position: style.position,
                    styleLeft: el.style.left,
                    styleTop:  el.style.top,
                    docLeft:  Math.round(docLeft),
                    docTop:   Math.round(docTop),
                    docRight: Math.round(docRight),
                    docBottom: Math.round(docBottom),
                    width:  Math.round(rect.width),
                    height: Math.round(rect.height),
                });
            }
        }

        // Phaser canvas
        const canvas = document.querySelector('canvas');
        const canvasRect = canvas ? {
            left:   Math.round(canvas.getBoundingClientRect().left   + window.scrollX),
            top:    Math.round(canvas.getBoundingClientRect().top    + window.scrollY),
            right:  Math.round(canvas.getBoundingClientRect().right  + window.scrollX),
            bottom: Math.round(canvas.getBoundingClientRect().bottom + window.scrollY),
            width:  canvas.width,
            height: canvas.height,
        } : null;

        // #game-container
        const gc = document.getElementById('game-container');
        const gcRect = gc ? {
            left:   Math.round(gc.getBoundingClientRect().left   + window.scrollX),
            top:    Math.round(gc.getBoundingClientRect().top    + window.scrollY),
            right:  Math.round(gc.getBoundingClientRect().right  + window.scrollX),
            bottom: Math.round(gc.getBoundingClientRect().bottom + window.scrollY),
        } : null;

        // Phaser DOM overlay container (div sibling to canvas inside #game-container)
        const phaserDomDivs = gc
            ? Array.from(gc.querySelectorAll('div')).map(d => {
                const r = d.getBoundingClientRect();
                return {
                    id: d.id || '(none)',
                    className: d.className || '',
                    styleWidth:  d.style.width,
                    styleHeight: d.style.height,
                    styleLeft:   d.style.left,
                    styleTop:    d.style.top,
                    overflow:    window.getComputedStyle(d).overflow,
                    docLeft:   Math.round(r.left   + window.scrollX),
                    docTop:    Math.round(r.top    + window.scrollY),
                    docRight:  Math.round(r.right  + window.scrollX),
                    docBottom: Math.round(r.bottom + window.scrollY),
                };
            })
            : [];

        return {
            viewport, docSize,
            hasHorizontalOverflow, hasVerticalOverflow,
            offscreen: offscreen.slice(0, maxReported),
            canvasRect, gcRect, phaserDomDivs
        };
    }, { overflowTolerance: OVERFLOW_TOLERANCE_PX, maxReported: MAX_REPORTED_ELEMENTS });

    console.log(`${prefix} ─── Viewport diagnostics ────────────────────────────`);
    console.log(`${prefix} Viewport:  ${info.viewport.width}×${info.viewport.height}  scroll=(${info.viewport.scrollX}, ${info.viewport.scrollY})`);
    console.log(`${prefix} Document:  scroll ${info.docSize.scrollWidth}×${info.docSize.scrollHeight}  body ${info.docSize.bodyScrollWidth}×${info.docSize.bodyScrollHeight}`);
    console.log(`${prefix} Overflow → horizontal: ${info.hasHorizontalOverflow}, vertical: ${info.hasVerticalOverflow}`);

    if (info.canvasRect) {
        console.log(`${prefix} Canvas (doc):  left=${info.canvasRect.left} top=${info.canvasRect.top} right=${info.canvasRect.right} bottom=${info.canvasRect.bottom}  native ${info.canvasRect.width}×${info.canvasRect.height}`);
    }
    if (info.gcRect) {
        console.log(`${prefix} #game-container: left=${info.gcRect.left} top=${info.gcRect.top} right=${info.gcRect.right} bottom=${info.gcRect.bottom}`);
    }
    for (const d of info.phaserDomDivs) {
        console.log(`${prefix} Phaser div #${d.id} .${d.className}  size=${d.styleWidth}×${d.styleHeight} at (${d.styleLeft}, ${d.styleTop})  overflow=${d.overflow}  doc(${d.docLeft},${d.docTop})–(${d.docRight},${d.docBottom})`);
    }

    if (info.offscreen.length > 0) {
        console.log(`${prefix} ⚠️  ${info.offscreen.length} element(s) extending beyond viewport / document edge:`);
        for (const el of info.offscreen) {
            console.log(
                `${prefix}   [${el.position}] <${el.tag}> id=${el.id} testId=${el.testId}` +
                `  styleLeft=${el.styleLeft} styleTop=${el.styleTop}` +
                `  doc(${el.docLeft},${el.docTop})–(${el.docRight},${el.docBottom})` +
                `  size=${el.width}×${el.height}`
            );
        }
    } else {
        console.log(`${prefix} ✅ No off-screen positioned elements found`);
    }
    console.log(`${prefix} ─────────────────────────────────────────────────────`);

    return info;
}

/**
 * Compute the screen coordinates of the centre of a puzzle grid cell by
 * reading the overworld camera and the active EmbeddedPuzzleRenderer from
 * inside the browser, then click there.
 */
async function clickOverworldPuzzleGrid(page, gridX, gridY) {
    const coords = await page.evaluate(({ gx, gy }) => {
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
    }, { gx: gridX, gy: gridY });

    if (!coords) {
        throw new Error(`Could not compute screen position for grid (${gridX}, ${gridY})`);
    }

    // Phaser's cam.x / cam.y are offsets *within* the canvas, not viewport offsets.
    // To convert canvas-relative coords to viewport coords we need to add the
    // canvas element's position in the viewport.
    const canvasViewportOffset = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { left: 0, top: 0 };
        const rect = canvas.getBoundingClientRect();
        return { left: rect.left, top: rect.top };
    });

    const viewportX = canvasViewportOffset.left + coords.screenX;
    const viewportY = canvasViewportOffset.top  + coords.screenY;

    console.log(
        `[TEST] Grid (${gridX},${gridY}) -> World (${coords.worldX.toFixed(0)},${coords.worldY.toFixed(0)}) ` +
        `-> CanvasRelative (${coords.screenX.toFixed(0)},${coords.screenY.toFixed(0)}) [zoom=${coords.zoom.toFixed(2)}]` +
        ` canvasOffset=(${canvasViewportOffset.left.toFixed(0)},${canvasViewportOffset.top.toFixed(0)})` +
        ` -> Viewport (${viewportX.toFixed(0)},${viewportY.toFixed(0)})`
    );

    await page.mouse.click(viewportX, viewportY);
    await page.waitForTimeout(300);
}

async function runTest() {
    const { page, cleanup } = await initTest({
        name: 'Translation Mode',
        playerStartID: 'forestPuzzle0',
        headless: true,
        slowMo: 100
    });

    try {
        await navigateAndWaitForLoad(page);

        // ── Diagnostic: check for page overflow immediately after game load ──
        console.log('[TEST] Running viewport diagnostics immediately after page load...');
        await runViewportDiagnostics(page, 'after-load');

        // ── Diagnostic: also capture layout a moment later (after camera settles) ──
        await page.waitForTimeout(1000);
        await runViewportDiagnostics(page, 'after-1s');

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

        // ── Diagnostic: layout after entering puzzle ──
        await runViewportDiagnostics(page, 'after-puzzle-entered');

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
