#!/usr/bin/env node
/**
 * Automated test for forest area conversation
 * Tests the conversation flow starting at the forest player start
 * This script will:
 * 1. Start the player at the "forest" player start
 * 2. Navigate to and interact with npcForestSeries1
 * 3. Complete a conversation
 * 4. Verify the conversation completed successfully
 */

import {
    initTest,
    navigateAndWaitForLoad,
    completeConversation
} from '../playwright/helpers.mjs';

async function runTest() {
    // Initialize test with forest start
    const { page, cleanup } = await initTest({
        name: 'Forest Area',
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

        // Complete the conversation flow with forest NPC
        // The NPC is at (1824, 1696), ID 48 from Tiled, close to the forest start at (1952, 1760)
        // This NPC's conversation has different choices: "Can I help you?" and "Leave"
        await completeConversation(page, 'npc-48', ['choice-can-i-help-you-']);

        console.log('[TEST] Forest area conversation test completed successfully!');
        await cleanup('Test success - completed forest conversation flow');

    } catch (error) {
        console.error('[TEST] Error during test:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
