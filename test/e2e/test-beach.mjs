#!/usr/bin/env node
/**
 * Automated test for beach area conversation
 * Tests the conversation flow starting at the beach player start using keyboard navigation.
 * This script will:
 * 1. Start the player at the "beach" player start
 * 2. Navigate to and interact with an NPC
 * 3. Navigate conversation choices using arrow keys and E to confirm
 * 4. Verify the conversation completed successfully
 */

import {
    initTest,
    navigateAndWaitForLoad,
    clickNPCMarker,
    pressInteractKey,
    pressArrowKey,
    selectChoiceWithKeyboard,
    waitForGameEvent
} from '../playwright/helpers.mjs';

async function runTest() {
    // Initialize test with beach start
    const { page, cleanup } = await initTest({
        name: 'Beach Area Keyboard Navigation',
        playerStartID: 'beach',
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

        // Click NPC marker to start moving toward sailor NPC (ID 51 near beach)
        await clickNPCMarker(page, 'npc-51');

        // Wait for player to reach NPC
        await page.waitForTimeout(5000);

        // Press E to start the conversation
        await pressInteractKey(page);

        // Wait for conversation to start
        await waitForGameEvent(page, 'conversation_started');
        await page.waitForTimeout(500); // Brief pause for UI to render

        // --- Keyboard navigation test ---
        // First node has 2 choices: "OK" (index 0) and "I don't understand" (index 1).
        // Press RIGHT to focus choice 0, then RIGHT again to focus choice 1,
        // then LEFT to cycle back to choice 0, and confirm with E.
        console.log('[TEST] Navigating choices with keyboard...');
        await pressArrowKey(page, 'right'); // focus choice 0 ("OK")
        await pressArrowKey(page, 'right'); // advance to choice 1 ("I don't understand")
        await pressArrowKey(page, 'left');  // back to choice 0 ("OK")
        console.log('[TEST] Confirming choice 0 ("OK") with E key...');
        await page.keyboard.press('e');
        await page.waitForTimeout(1500); // Wait for conversation to advance

        // Second node ends the conversation - press E to dismiss the leave button
        console.log('[TEST] Pressing E to dismiss the leave button...');
        await page.keyboard.press('e');
        await page.waitForTimeout(500);

        // Wait for conversation to end
        await waitForGameEvent(page, 'conversation_ended');

        console.log('[TEST] Beach area keyboard navigation test completed successfully!');
        await cleanup('Test success - completed beach conversation via keyboard');

    } catch (error) {
        console.error('[TEST] Error during test:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
