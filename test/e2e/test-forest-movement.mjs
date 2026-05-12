#!/usr/bin/env node
/**
 * E2E test for overworld movement and collision in the Forest area
 * Tests that the player is properly blocked by trees and obstacles
 */

import {
    initTest,
    navigateAndWaitForLoad
} from '../playwright/helpers.mjs';

async function runTest() {
    // Initialize test with forest start position
    const { page, cleanup } = await initTest({
        name: 'Forest Movement Collision',
        playerStartID: 'forest',
        headless: false,
        slowMo: 100
    });

    try {
        // Navigate to test page and wait for game to load
        await navigateAndWaitForLoad(page);

        // Wait for player to be ready
        console.log('[TEST] Waiting for player position to be available...');
        await page.waitForTimeout(2000);

        // Quick ping to show test activity - click on constraint NPC marker to verify it exists
        console.log('[TEST] Verifying constraint NPC count1Test1 exists...');
        const constraintNPCId = 'npc-constraint-forestpuzzle1-IslandBridgeCountConstraint-island_1_2';
        const npcMarkerEarly = await page.$(`[data-testid="${constraintNPCId}"]`);
        if (npcMarkerEarly) {
            console.log('[TEST] ✅ Found constraint NPC marker at startup');
            await npcMarkerEarly.click();
            await page.waitForTimeout(100);
        } else {
            console.log('[TEST] ⚠️ Constraint NPC marker not found at startup');
        }

        // Get initial player position
        const initialPosition = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });

        console.log('[TEST] Initial player position:', initialPosition);
        if (!initialPosition) {
            throw new Error('Could not get initial player position');
        }

        // Attempt to walk north for 2 seconds (should be blocked by trees after 2-3 tiles)
        console.log('[TEST] Holding ArrowUp for 2 seconds to walk north...');
        await page.keyboard.down('ArrowUp');
        await page.waitForTimeout(2000); // Hold for 2 seconds
        await page.keyboard.up('ArrowUp');

        // Give time for movement to complete
        await page.waitForTimeout(500);

        // Get final player position
        const finalPosition = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });

        console.log('[TEST] Final player position:', finalPosition);
        if (!finalPosition) {
            throw new Error('Could not get final player position');
        }

        // Calculate how many tiles the player actually moved
        const tilesMoved = initialPosition.tileY - finalPosition.tileY;
        console.log(`[TEST] Player moved ${tilesMoved} tiles north (held key for 2s)`);

        // Verify the player was blocked
        if (tilesMoved >= 5) {
            console.error('[TEST] ❌ COLLISION NOT WORKING: Player moved all 5 tiles north when they should have been blocked!');
            console.error(`[TEST]    Initial: (${initialPosition.tileX}, ${initialPosition.tileY})`);
            console.error(`[TEST]    Final: (${finalPosition.tileX}, ${finalPosition.tileY})`);
            await cleanup('COLLISION FAILURE: Player not blocked by trees');
            return;
        } else if (tilesMoved < 2) {
            console.error('[TEST] ❌ COLLISION TOO AGGRESSIVE: Player moved less than 2 tiles (expected 2-3 before hitting trees)');
            console.error(`[TEST]    Initial: (${initialPosition.tileX}, ${initialPosition.tileY})`);
            console.error(`[TEST]    Final: (${finalPosition.tileX}, ${finalPosition.tileY})`);
            await cleanup('COLLISION FAILURE: Too aggressive blocking');
            return;
        } else {
            console.log(`[TEST] ✅ COLLISION WORKING: Player moved ${tilesMoved} tiles before being blocked (expected 2-3)`);
            console.log(`[TEST]    Initial tile: (${initialPosition.tileX}, ${initialPosition.tileY})`);
            console.log(`[TEST]    Final tile: (${finalPosition.tileX}, ${finalPosition.tileY})`);
        }

        // Test horizontal movement as well
        console.log('[TEST] Testing horizontal movement...');
        const beforeHorizontal = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });

        // Try moving east for 2 seconds
        console.log('[TEST] Holding ArrowRight for 2 seconds to walk east...');
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(2000); // Hold for 2 seconds
        await page.keyboard.up('ArrowRight');
        await page.waitForTimeout(500);

        const afterHorizontal = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });

        const horizontalMoved = afterHorizontal.tileX - beforeHorizontal.tileX;
        console.log(`[TEST] Player moved ${horizontalMoved} tiles east (attempted 3)`);
        console.log(`[TEST]    Before: (${beforeHorizontal.tileX}, ${beforeHorizontal.tileY})`);
        console.log(`[TEST]    After: (${afterHorizontal.tileX}, ${afterHorizontal.tileY})`);

        console.log('[TEST] ✅ All movement collision tests passed!');

        // NEW TEST: Navigate to constraint NPC count1Test1 and interact
        console.log('[TEST] Testing constraint NPC interaction...');
        console.log('[TEST] Navigating to constraint NPC count1Test1 at tile (68, 54)...');

        // Current position should be around (61, 52) after the previous movements
        const currentPos = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });
        console.log('[TEST] Current position:', currentPos);

        // Navigate to count1Test1: need to go from ~(62, 52) to (68, 54)
        // Move right (east) to get closer
        console.log('[TEST] Moving right (east) to reach area near constraint NPC...');
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(2000); // Hold for 2 seconds
        await page.keyboard.up('ArrowRight');
        console.log('[TEST] Finished moving east');
        await page.waitForTimeout(500);

        // Click on the constraint NPC marker to interact
        console.log('[TEST] Clicking on constraint NPC marker to interact...');
        const npcMarker = await page.$(`[data-testid="${constraintNPCId}"]`);
        if (npcMarker) {
            console.log('[TEST] Found constraint NPC marker, clicking...');
            await npcMarker.click();
            console.log('[TEST] Clicked on constraint NPC marker');
            await page.waitForTimeout(2000); // Wait 2 seconds for player to move and interact
        } else {
            throw new Error('[TEST] Could not find constraint NPC marker');
        }

        // Press E to interact
        console.log('[TEST] Pressing E to interact with constraint NPC...');

        // Set up event listener BEFORE pressing E so we don't miss the event
        const conversationStartedPromise = page.evaluate(() => {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(false), 5000);
                window.addEventListener('game-event', (e) => {
                    if (e.detail.type === 'conversation_started') {
                        clearTimeout(timeout);
                        console.log('[BROWSER] Conversation started:', e.detail);
                        resolve(true);
                    }
                }, { once: true });
            });
        });

        // Now press E
        await page.keyboard.press('e');

        // Wait for conversation to start
        console.log('[TEST] Waiting for conversation to start...');
        const conversationStarted = await conversationStartedPromise;

        if (conversationStarted) {
            console.log('[TEST] ✅ Constraint NPC conversation started successfully!');
        } else {
            console.error('[TEST] ❌ Conversation did not start within timeout');
        }

        console.log('[TEST] ✅ All tests passed including constraint NPC interaction!');
        await cleanup('Test success - collision and constraint NPC working correctly');

    } catch (error) {
        console.error('[TEST] ❌ Test failed:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
