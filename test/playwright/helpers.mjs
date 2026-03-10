/**
 * Common utilities for Playwright-based browser tests
 * Provides helpers for interacting with test markers, waiting for game events, and more
 */

import { chromium } from 'playwright';

// Test constants
export const MAX_TEST_DURATION = 60000;  // 1 minute maximum
export const IDLE_TIMEOUT = 10000;       // 10 seconds of no activity
export const ACTIVITY_CHECK_INTERVAL = 1000; // Check every second

/**
 * Initialize a browser test session
 * @param {Object} config - Test configuration
 * @param {string} config.name - Name of the test for logging
 * @param {string} [config.playerStartID] - Player start ID to use (e.g., "beach", "forest")
 * @param {boolean} [config.headless] - Whether to show browser (false = headless)
 * @param {number} [config.slowMo] - Slow down actions for visibility (milliseconds)
 * @returns {Promise<Object>} Test context with browser, page, and utilities
 */
export async function initTest(config) {
    console.log(`[TEST: ${config.name}] Starting automated test...`);

    const testStartTime = Date.now();
    const lastActivityTime = { value: Date.now() };
    let activityCheckInterval;
    let maxDurationTimeout;

    const browser = await chromium.launch({
        headless: config.headless ?? false,
        slowMo: config.slowMo ?? 100
    });

    const context = await browser.newContext();

    // Set test mode and configuration before creating the page
    await context.addInitScript((testConfig) => {
        window.__TEST_MODE__ = true;
        window.__TEST_CONFIG__ = testConfig;
    }, { playerStartID: config.playerStartID });

    const page = await context.newPage();

    // Collect console logs and track activity
    const consoleLogs = [];
    page.on('console', (msg) => {
        const text = msg.text();
        consoleLogs.push(text);
        console.log(`[BROWSER] ${text}`);
        lastActivityTime.value = Date.now();
    });

    // Track page activity
    page.on('request', () => { lastActivityTime.value = Date.now(); });
    page.on('response', () => { lastActivityTime.value = Date.now(); });

    // Cleanup function
    const cleanup = async (reason) => {
        console.log(`\n[TEST: ${config.name}] Closing browser: ${reason}`);
        clearInterval(activityCheckInterval);
        clearTimeout(maxDurationTimeout);

        try {
            await browser.close();
        } catch (e) {
            console.error(`[TEST: ${config.name}] Error closing browser:`, e.message);
        }

        const duration = Date.now() - testStartTime;
        console.log(`[TEST: ${config.name}] Test completed in ${(duration / 1000).toFixed(1)}s`);

        // Exit with appropriate code
        if (reason.includes('success') || reason.includes('completed') || reason.includes('conversation')) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    };

    // Set up maximum duration timeout
    maxDurationTimeout = setTimeout(() => {
        cleanup('Maximum test duration exceeded');
    }, MAX_TEST_DURATION);

    // Set up idle timeout checker
    activityCheckInterval = setInterval(async () => {
        const idleTime = Date.now() - lastActivityTime.value;
        const elapsed = Date.now() - testStartTime;

        if (idleTime > IDLE_TIMEOUT) {
            await cleanup(`Idle timeout - no activity for ${(idleTime / 1000).toFixed(1)}s`);
            return;
        }

        // Progress indicator
        if (elapsed % 5000 < ACTIVITY_CHECK_INTERVAL) {
            console.log(`[TEST: ${config.name}] Running... ${(elapsed / 1000).toFixed(0)}s elapsed, idle for ${(idleTime / 1000).toFixed(1)}s`);
        }
    }, ACTIVITY_CHECK_INTERVAL);

    return {
        browser,
        page,
        cleanup,
        lastActivityTime
    };
}

/**
 * Navigate to test.html and wait for game to load
 * @param {Object} page - Playwright page
 */
export async function navigateAndWaitForLoad(page) {
    console.log('[TEST] Opening test.html...');
    await page.goto('http://localhost:5173/test.html');

    // Wait for Phaser to be available
    console.log('[TEST] Waiting for game to load...');
    await page.waitForFunction(() => {
        return window.Phaser !== undefined;
    }, { timeout: 10000 });

    // Wait a bit more for scene setup
    await page.waitForTimeout(3000);
}

/**
 * Wait for a specific game event to occur
 * @param {Object} page - Playwright page
 * @param {string} eventType - The event type to wait for (e.g., "conversation_started")
 * @param {number} [timeout=10000] - Timeout in milliseconds
 * @returns {Promise<any>} The event data, or null if timeout
 */
export async function waitForGameEvent(page, eventType, timeout = 10000) {
    console.log(`[TEST] Waiting for game event: ${eventType}...`);

    try {
        await page.waitForFunction((type) => {
            if (!window.__GAME_EVENTS__) return false;
            return window.__GAME_EVENTS__.some((e) => e.type === type);
        }, eventType, { timeout });

        const eventData = await page.evaluate((type) => {
            const event = window.__GAME_EVENTS__.find((e) => e.type === type);
            return event ? event.data : null;
        }, eventType);

        console.log(`[TEST] Event "${eventType}" occurred:`, eventData);
        return eventData;
    } catch (e) {
        console.warn(`[TEST] Timeout waiting for event "${eventType}"`);
        return null;
    }
}

/**
 * Click an NPC marker by its testid
 * @param {Object} page - Playwright page
 * @param {string} npcID - The NPC ID or testid to click
 */
export async function clickNPCMarker(page, npcID) {
    console.log(`[TEST] Looking for NPC marker: ${npcID}...`);

    const marker = await page.$(`[data-testid="${npcID}"]`);
    if (!marker) {
        throw new Error(`Could not find NPC marker: ${npcID}`);
    }

    console.log(`[TEST] Clicking NPC marker: ${npcID}`);
    await marker.click();
    console.log('[TEST] Clicked NPC marker, player should start moving...');
}

/**
 * Press the E key to interact
 * @param {Object} page - Playwright page
 */
export async function pressInteractKey(page) {
    console.log('[TEST] Pressing E key to interact...');
    await page.keyboard.press('e');
}

/**
 * Click a conversation choice button
 * @param {Object} page - Playwright page
 * @param {string} choiceID - The choice testid (e.g., "choice-ok", "choice-leave")
 */
export async function clickChoice(page, choiceID) {
    console.log(`[TEST] Looking for choice button: ${choiceID}...`);

    await page.waitForTimeout(500); // Brief pause for UI to render
    const button = await page.$(`[data-testid="${choiceID}"]`);

    if (!button) {
        throw new Error(`Could not find choice button: ${choiceID}`);
    }

    const buttonBox = await button.boundingBox();
    console.log(`[TEST] Choice button "${choiceID}" found:`, buttonBox);

    console.log(`[TEST] Clicking choice button: ${choiceID}`);
    await button.click();
}

/**
 * Complete a simple conversation flow: start → click choice → end
 * @param {Object} page - Playwright page
 * @param {string} npcID - The NPC to interact with
 * @param {string[]} choices - Array of choice IDs to click in order
 * @param {number} [waitTime=5000] - Time to wait for player to reach NPC (milliseconds)
 */
export async function completeConversation(
    page,
    npcID,
    choices,
    waitTime = 5000
) {
    // Click NPC marker to start moving
    await clickNPCMarker(page, npcID);

    // Wait for player to reach NPC
    await page.waitForTimeout(waitTime);

    // Press E to interact
    await pressInteractKey(page);

    // Wait for conversation to start
    await waitForGameEvent(page, 'conversation_started');

    // Click through choices
    for (const choiceID of choices) {
        await clickChoice(page, choiceID);
        await page.waitForTimeout(1500); // Wait for conversation to advance
    }

    // Wait for conversation to end
    await waitForGameEvent(page, 'conversation_ended');
}
