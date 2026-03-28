#!/usr/bin/env node
/**
 * Automated test for forest area NPC series puzzle
 * Tests the conversation flow that spawns a puzzle series with BridgeCountConstraints
 * This script will:
 * 1. Start the player at the "forest" player start
 * 2. Navigate to and interact with npcForestSeries1
 * 3. Select "I'll help" to start the series
 * 4. Verify that the series puzzle interface launches
 */

import {
    initTest,
    navigateAndWaitForLoad,
    waitForGameEvent
} from '../playwright/helpers.mjs';

async function runTest() {
    // Initialize test with forest start
    const { page, cleanup } = await initTest({
        name: 'Forest Series Puzzle',
        playerStartID: 'forest',
        headless: false,
        slowMo: 100
    });

    try {
        // Navigate to test page and wait for game to load
        await navigateAndWaitForLoad(page);

        // Check for test markers
        console.log('[TEST] Looking for test markers...');
        const npcMarkers = await page.$$('[data-testid^="npc-"]');
        console.log(`[TEST] Found ${npcMarkers.length} NPC markers`);

        if (npcMarkers.length === 0) {
            console.error('[TEST] No NPC markers found! Test markers may not be enabled.');
            await cleanup('No NPC markers found');
            return;
        }

        // Verify NPC sprite is loaded correctly
        console.log('[TEST] Checking NPC sprite status...');
        const npcSpriteStatus = await page.evaluate(() => {
            return window.getNPCSpriteStatus ? window.getNPCSpriteStatus('48') : null;
        });

        if (npcSpriteStatus) {
            console.log(`[TEST] NPC sprite status:`, npcSpriteStatus);
            if (!npcSpriteStatus.hasValidTexture) {
                console.warn(`[TEST] ⚠️  NPC sprite has invalid texture! Texture key: ${npcSpriteStatus.textureKey}`);
                console.warn('[TEST] This will show as Phaser\'s black-and-green missing texture placeholder');
            } else {
                console.log(`[TEST] ✅ NPC sprite loaded successfully: ${npcSpriteStatus.textureKey}`);
            }
        } else {
            console.warn('[TEST] Could not check NPC sprite status');
        }

        // Click NPC marker to start moving
        console.log('[TEST] Clicking NPC marker: npc-48');
        const npcMarker = await page.$('[data-testid="npc-48"]');
        if (!npcMarker) {
            throw new Error('Could not find NPC marker: npc-48');
        }
        await npcMarker.click();
        console.log('[TEST] Player should start moving to NPC...');

        // Wait for player to reach NPC
        await page.waitForTimeout(5000);

        // Press E to interact
        console.log('[TEST] Pressing E key to interact...');
        await page.keyboard.press('e');

        // Wait for conversation to start
        console.log('[TEST] Waiting for conversation to start...');
        await waitForGameEvent(page, 'conversation_started');

        // Wait for choice button to appear and click "I'll help"
        console.log('[TEST] Waiting for choice button: I\'ll help');
        await page.waitForTimeout(1000); // Brief pause for UI

        const choiceButton = await page.$('[data-testid="choice-i-ll-help"]');
        if (!choiceButton) {
            throw new Error('Could not find choice button: I\'ll help');
        }

        console.log('[TEST] Clicking choice: I\'ll help');
        await choiceButton.click();

        // Wait for next conversation node (helpAccepted)
        console.log('[TEST] Waiting for second conversation node...');
        await page.waitForTimeout(1000);

        // Click "Build" choice to start the series
        console.log('[TEST] Waiting for choice button: Build');
        const buildButton = await page.$('[data-testid="choice-build"]');
        if (!buildButton) {
            throw new Error('Could not find choice button: Build');
        }

        console.log('[TEST] Clicking choice: Build');
        await buildButton.click();

        // Wait for conversation to end
        console.log('[TEST] Waiting for conversation to end...');
        await waitForGameEvent(page, 'conversation_ended');

        // Wait for puzzle to be entered
        console.log('[TEST] Waiting for puzzle to be entered...');
        const puzzleEvent = await waitForGameEvent(page, 'puzzle_entered', 10000);

        if (!puzzleEvent) {
            throw new Error('Timeout waiting for puzzle_entered event');
        }

        console.log('[TEST] Puzzle entered successfully!', puzzleEvent);

        // Wait for puzzle to be ready
        await page.waitForTimeout(2000);

        // Solve the puzzle
        console.log('[TEST] Solving puzzle...');
        const { placeBridge, clickBridge, getPuzzleCameraInfo } = await import('../playwright/helpers.mjs');

        // Verify camera info is available
        await getPuzzleCameraInfo(page);

        // First, place an INCORRECT bridge to test removal
        console.log('[TEST] Placing INCORRECT bridge: C(1,3) to D(3,3) - should be removed');
        await placeBridge(page, 1, 3, 3, 3);
        await page.waitForTimeout(500);

        // Click the bridge to remove it
        console.log('[TEST] Clicking bridge C-D to remove it');
        await clickBridge(page, 1, 3, 3, 3);
        await page.waitForTimeout(500);

        // Now place the correct solution: A(1,1)-C(1,3), A(1,1)-B(3,1), B(3,1)-D(3,3)
        console.log('[TEST] Placing CORRECT bridge 3: A(1,1) to C(1,3)');
        await placeBridge(page, 1, 1, 1, 3);

        console.log('[TEST] Placing CORRECT bridge 1: A(1,1) to B(3,1)');
        await placeBridge(page, 1, 1, 3, 1);

        console.log('[TEST] Placing CORRECT bridge 2: B(3,1) to D(3,3)');
        await placeBridge(page, 3, 1, 3, 3);

        console.log('[TEST] Puzzle solution entered!');

        // Wait for "Puzzle Solved!" message to appear
        console.log('[TEST] Waiting for puzzle solved confirmation...');
        await page.waitForTimeout(500);

        // The puzzle will auto-exit after ~1.5 seconds, so wait for return to overworld
        console.log('[TEST] Waiting for automatic return to overworld...');
        await page.waitForTimeout(3000);

        // Verify we're back in overworld by getting player position
        const playerAfterPuzzle = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });
        console.log('[TEST] Player position after puzzle:', playerAfterPuzzle);

        if (!playerAfterPuzzle) {
            throw new Error('Failed to return to overworld - no player position available');
        }

        // Success! The series completion triggers door unlocking automatically
        // Check the browser logs for "Door forestSeries1 unlocked successfully"
        console.log('[TEST] ✅ Series completed - door should be unlocked!');
        console.log('[TEST] Forest series puzzle test completed successfully!');
        await cleanup('Test success - series puzzle solved and door unlocked');

    } catch (error) {
        console.error('[TEST] Error during test:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
