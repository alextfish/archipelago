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
        console.log('[TEST] Forest series puzzle test completed successfully!');
        await cleanup('Test success - series puzzle launched');

    } catch (error) {
        console.error('[TEST] Error during test:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
