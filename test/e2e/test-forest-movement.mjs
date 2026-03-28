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
    // Initialize test with forest-start position
    const { page, cleanup } = await initTest({
        name: 'Forest Movement Collision',
        playerStartID: 'forest-start',
        headless: false,
        slowMo: 100
    });

    try {
        // Navigate to test page and wait for game to load
        await navigateAndWaitForLoad(page);

        // Wait for player to be ready
        console.log('[TEST] Waiting for player position to be available...');
        await page.waitForTimeout(2000);

        // Get initial player position
        const initialPosition = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });

        console.log('[TEST] Initial player position:', initialPosition);
        if (!initialPosition) {
            throw new Error('Could not get initial player position');
        }

        // Attempt to walk north for 5 seconds (should be blocked by trees after 2-3 tiles)
        console.log('[TEST] Holding ArrowUp for 5 seconds to walk north...');
        await page.keyboard.down('ArrowUp');
        await page.waitForTimeout(5000); // Hold for 5 seconds
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
        console.log(`[TEST] Player moved ${tilesMoved} tiles north (held key for 5s)`);

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

        // Try moving east for 3 seconds
        console.log('[TEST] Holding ArrowRight for 3 seconds to walk east...');
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(3000); // Hold for 3 seconds
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
        await cleanup('Test success - collision working correctly');

    } catch (error) {
        console.error('[TEST] ❌ Test failed:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
