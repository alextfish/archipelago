#!/usr/bin/env node
/**
 * Automated test script for Archipelago using Browser MCP
 * This script will:
 * 1. Open the game in test mode
 * 2. Wait for it to load
 * 3. Click on the NPC marker
 * 4. Wait for player to reach NPC
 * 5. Press E to interact
 * 6. Wait for conversation to complete
 * 7. Close browser automatically with timeout protection
 */

import { chromium } from 'playwright';

const MAX_TEST_DURATION = 60000;  // 1 minute maximum
const IDLE_TIMEOUT = 10000;       // 10 seconds of no activity
const ACTIVITY_CHECK_INTERVAL = 1000; // Check every second

async function runTest() {
    console.log('[TEST SCRIPT] Starting automated test...');

    const testStartTime = Date.now();
    let lastActivityTime = Date.now();
    let activityCheckInterval;
    let maxDurationTimeout;

    const browser = await chromium.launch({
        headless: false, // Show browser for debugging
        slowMo: 100 // Slow down actions for visibility
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect console logs and track activity
    const consoleLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push(text);
        console.log(`[BROWSER] ${text}`);

        // Any console output counts as activity
        lastActivityTime = Date.now();
    });

    // Track page activity
    page.on('request', () => { lastActivityTime = Date.now(); });
    page.on('response', () => { lastActivityTime = Date.now(); });

    // Cleanup function
    const cleanup = async (reason) => {
        console.log(`\n[TEST SCRIPT] Closing browser: ${reason}`);
        clearInterval(activityCheckInterval);
        clearTimeout(maxDurationTimeout);

        try {
            await browser.close();
        } catch (e) {
            console.error('[TEST SCRIPT] Error closing browser:', e.message);
        }

        const duration = Date.now() - testStartTime;
        console.log(`[TEST SCRIPT] Test completed in ${(duration / 1000).toFixed(1)}s`);

        // Exit with appropriate code
        if (reason.includes('success') || reason.includes('completed') || reason.includes('conversation')) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    };    // Set up maximum duration timeout
    maxDurationTimeout = setTimeout(() => {
        cleanup('Maximum test duration exceeded');
    }, MAX_TEST_DURATION);

    // Set up idle timeout checker
    activityCheckInterval = setInterval(async () => {
        const idleTime = Date.now() - lastActivityTime;
        const elapsed = Date.now() - testStartTime;

        if (idleTime > IDLE_TIMEOUT) {
            await cleanup(`Idle timeout - no activity for ${(idleTime / 1000).toFixed(1)}s`);
            return;
        }

        // Check for test completion event
        try {
            const hasConversationEnded = await page.evaluate(() => {
                if (!window.__GAME_EVENTS__) return false;
                return window.__GAME_EVENTS__.some(e => e.type === 'conversation_ended');
            });

            if (hasConversationEnded) {
                const conversationData = await page.evaluate(() => {
                    const event = window.__GAME_EVENTS__.find(e => e.type === 'conversation_ended');
                    return event ? event.data : null;
                });

                console.log('[TEST SCRIPT] Conversation ended:', conversationData);
                await cleanup('Test success - conversation_ended event received');
                return;
            }
        } catch (e) {
            // Page might be closed, ignore
        }

        // Progress indicator
        if (elapsed % 5000 < ACTIVITY_CHECK_INTERVAL) {
            console.log(`[TEST SCRIPT] Running... ${(elapsed / 1000).toFixed(0)}s elapsed, idle for ${(idleTime / 1000).toFixed(1)}s`);
        }
    }, ACTIVITY_CHECK_INTERVAL);

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
        ``
        // Click the NPC marker to start tap-to-move
        await firstNpc.click();
        console.log('[TEST SCRIPT] Clicked NPC marker, player should start moving...');

        // Wait for player to reach NPC (look for specific console message)
        await page.waitForTimeout(5000);

        // Press E key to interact
        console.log('[TEST SCRIPT] Pressing E key to interact with NPC...');
        await page.keyboard.press('e');

        // Wait for conversation to start
        console.log('[TEST SCRIPT] Waiting for conversation to start...');
        await page.waitForFunction(() => {
            if (!window.__GAME_EVENTS__) return false;
            return window.__GAME_EVENTS__.some(e => e.type === 'conversation_started');
        }, { timeout: 10000 });

        const conversationData = await page.evaluate(() => {
            const event = window.__GAME_EVENTS__.find(e => e.type === 'conversation_started');
            return event ? event.data : null;
        });

        console.log('[TEST SCRIPT] Conversation started successfully!', conversationData);

        // Click the "OK" button
        console.log('[TEST SCRIPT] Looking for "OK" choice button...');
        await page.waitForTimeout(500); // Brief pause for UI to render
        const okButton = await page.$('[data-testid="choice-ok"]');
        if (!okButton) {
            throw new Error('Could not find OK button');
        }

        // Get button position and size for debugging
        const okButtonBox = await okButton.boundingBox();
        console.log('[TEST SCRIPT] OK button found:', okButtonBox);

        console.log('[TEST SCRIPT] Clicking "OK" button...');
        await okButton.click();

        // Check if click had any effect by looking at console
        console.log('[TEST SCRIPT] Click sent, checking for game response...');

        // Wait longer for second conversation node to display
        console.log('[TEST SCRIPT] Waiting for conversation to advance...');
        await page.waitForTimeout(1500);

        // Click the "[Leave]" button
        console.log('[TEST SCRIPT] Looking for "[Leave]" button...');
        const leaveButton = await page.$('[data-testid="choice-leave"]');
        if (!leaveButton) {
            throw new Error('Could not find Leave button');
        }
        console.log('[TEST SCRIPT] Clicking "[Leave]" button...');
        await leaveButton.click();

        // Wait for conversation to end
        console.log('[TEST SCRIPT] Waiting for conversation to end...');
        await page.waitForFunction(() => {
            if (!window.__GAME_EVENTS__) return false;
            return window.__GAME_EVENTS__.some(e => e.type === 'conversation_ended');
        }, { timeout: 5000 });

        const endData = await page.evaluate(() => {
            const event = window.__GAME_EVENTS__.find(e => e.type === 'conversation_ended');
            return event ? event.data : null;
        });

        console.log('[TEST SCRIPT] Conversation ended successfully!', endData);

        // Exit after successful full conversation flow
        await cleanup('Test success - completed full conversation flow');

    } catch (error) {
        console.error('[TEST SCRIPT] Error during test:', error.message);
        await cleanup('Test error: ' + error.message);
    }
}

// Run the test
runTest().catch(console.error);
