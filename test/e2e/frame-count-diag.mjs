import { chromium } from 'playwright';

async function checkFrameCount(playerStartID, label) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addInitScript((testConfig) => {
        window.__TEST_MODE__ = true;
        window.__TEST_CONFIG__ = testConfig;
        // Hook into Phaser to track frame count and visibility changes
        window.__FRAME_LOG__ = [];
        window.__PAGE_ERRORS__ = [];
        window.addEventListener('visibilitychange', () => {
            window.__FRAME_LOG__.push(`visibilitychange: hidden=${document.hidden} at ${Date.now()}`);
        });
        window.addEventListener('blur', () => {
            window.__FRAME_LOG__.push(`window.blur at ${Date.now()}`);
        });
        window.addEventListener('focus', () => {
            window.__FRAME_LOG__.push(`window.focus at ${Date.now()}`);
        });
        window.addEventListener('error', (e) => {
            window.__PAGE_ERRORS__.push(e.message);
        });
    }, { playerStartID });
    const page = await context.newPage();
    page.on('pageerror', (e) => {
        console.error(`  [PAGEERROR:${label}] ${e.message}`);
    });
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.error(`  [CONSOLE ERROR:${label}] ${msg.text()}`);
    });

    await page.goto('http://localhost:5173/test.html');
    await page.waitForFunction(() => window.Phaser !== undefined, { timeout: 15000, polling: 500 });
    // Wait 1 second, capture frame count, wait another second, capture again
    await page.waitForTimeout(1000);
    const snap1 = await page.evaluate(() => ({
        frame: window.game?.loop?.frame ?? -1,
        running: window.game?.loop?.running ?? false,
        paused: window.game?.isPaused ?? 'unknown',
        docHidden: document.hidden,
        frameLog: window.__FRAME_LOG__?.slice(-5) ?? [],
    }));
    await page.waitForTimeout(1000);
    const snap2 = await page.evaluate(() => ({
        frame: window.game?.loop?.frame ?? -1,
        running: window.game?.loop?.running ?? false,
        paused: window.game?.isPaused ?? 'unknown',
        docHidden: document.hidden,
        frameLog: window.__FRAME_LOG__?.slice(-5) ?? [],
        errors: window.__PAGE_ERRORS__ ?? [],
    }));
    await page.waitForTimeout(1000);
    const snap3 = await page.evaluate(() => ({
        frame: window.game?.loop?.frame ?? -1,
        running: window.game?.loop?.running ?? false,
        paused: window.game?.isPaused ?? 'unknown',
        docHidden: document.hidden,
    }));

    console.log(`\n=== ${label} (start: ${playerStartID}) ===`);
    console.log(`  @1s: frame=${snap1.frame} running=${snap1.running} paused=${snap1.paused} hidden=${snap1.docHidden}`);
    console.log(`  @2s: frame=${snap2.frame} running=${snap2.running} paused=${snap2.paused} hidden=${snap2.docHidden}`);
    console.log(`  @3s: frame=${snap3.frame} running=${snap3.running} paused=${snap3.paused} hidden=${snap3.docHidden}`);
    console.log(`  Frames 1→2: ${snap2.frame - snap1.frame} (expect ~60), 2→3: ${snap3.frame - snap2.frame}`);
    if (snap1.frameLog.length) console.log(`  Event log (1s):`, snap1.frameLog);
    if (snap2.frameLog.length) console.log(`  Event log (2s):`, snap2.frameLog);
    if (snap2.errors.length) console.log(`  Page errors:`, snap2.errors);

    await browser.close();
}

// Test forestPuzzle0 alone first
await checkFrameCount('forestPuzzle0', 'forestPuzzle0 (alone)');
// Then forest alone
await checkFrameCount('forest', 'forest (alone)');
