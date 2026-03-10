#!/usr/bin/env node
/**
 * Automated test for beach area conversation
 * Tests the conversation flow starting at the beach player start
 * This script will:
 * 1. Start the player at the "beach" player start
 * 2. Navigate to and interact with an NPC
 * 3. Complete a conversation
 * 4. Verify the conversation completed successfully
 */

import {
    initTest,
    navigateAndWaitForLoad,
    completeConversation
} from './test/playwright/helpers.mjs';

async function runTest() {
    // Initialize test with beach start
    const { page, cleanup } = await initTest({
        name: 'Beach Area',
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

        // Complete the conversation flow
        // Click sailor NPC (ID 51 from Tiled, near beach at 1504, 2720)
        await completeConversation(page, 'npc-51', ['choice-ok', 'choice-leave']);

        console.log('[TEST] Beach area conversation test completed successfully!');
        await cleanup('Test success - completed beach conversation flow');

    } catch (error) {
        console.error('[TEST] Error during test:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
