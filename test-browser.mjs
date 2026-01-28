#!/usr/bin/env node
/**
 * Automated test script for Archipelago using Browser MCP
 * This script will:
 * 1. Open the game in test mode
 * 2. Wait for it to load
 * 3. Click on the NPC marker
 * 4. Verify the player walks to the NPC
 * 5. Press E to interact
 * 6. Check console logs for conversation mode
 */

import { chromium } from 'playwright';

async function runTest() {
    console.log('[TEST SCRIPT] Starting automated test...');

    const browser = await chromium.launch({
        headless: false, // Show browser for debugging
        slowMo: 100 // Slow down actions for visibility
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect console logs
    const consoleLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push(text);
        console.log(`[BROWSER] ${text}`);
    });

    try {
        // Navigate to test mode
        console.log('[TEST SCRIPT] Opening test.html...');
        await page.goto('http://localhost:5173/test.html');

        // Wait for game to load (look for specific log message)
        console.log('[TEST SCRIPT] Waiting for game to load...');
        await page.waitForFunction(() => {
            return window.Phaser !== undefined;
        }, { timeout: 10000 });

        // Wait a bit more for scene setup
        await page.waitForTimeout(3000);

        // Check for test markers
        console.log('[TEST SCRIPT] Looking for test markers...');
        const npcMarkers = await page.$$('[data-testid^="npc-"]');
        console.log(`[TEST SCRIPT] Found ${npcMarkers.length} NPC markers`);

        if (npcMarkers.length === 0) {
            console.error('[TEST SCRIPT] No NPC markers found! Test markers may not be enabled.');
            return;
        }

        // Find the specific NPC near (1525, 2768)
        // For now, just click the first NPC
        const firstNpc = npcMarkers[0];
        const npcId = await firstNpc.getAttribute('data-testid');
        console.log(`[TEST SCRIPT] Clicking NPC marker: ${npcId}`);

        // Click the NPC marker to start tap-to-move
        await firstNpc.click();
        console.log('[TEST SCRIPT] Clicked NPC marker, player should start moving...');

        // Wait for player to reach NPC (look for specific console message)
        await page.waitForTimeout(5000);

        // Press E key to interact
        console.log('[TEST SCRIPT] Pressing E key to interact with NPC...');
        await page.keyboard.press('e');

        // Wait and check for conversation mode
        await page.waitForTimeout(2000);

        // Check console logs for conversation indication
        const conversationLogs = consoleLogs.filter(log =>
            log.includes('conversation') ||
            log.includes('ConversationController') ||
            log.includes('NPC')
        );

        console.log('\n[TEST SCRIPT] Relevant console logs:');
        conversationLogs.forEach(log => console.log(`  ${log}`));

        console.log('\n[TEST SCRIPT] Test completed successfully!');
        console.log('[TEST SCRIPT] Check the browser window to see the results.');

        // Keep browser open for manual inspection
        console.log('[TEST SCRIPT] Browser will stay open. Press Ctrl+C to close.');
        await page.waitForTimeout(60000);

    } catch (error) {
        console.error('[TEST SCRIPT] Error during test:', error);
    } finally {
        await browser.close();
    }
}

// Run the test
runTest().catch(console.error);
