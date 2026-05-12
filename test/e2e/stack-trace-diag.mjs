import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript((testConfig) => {
    window.__TEST_MODE__ = true;
    window.__TEST_CONFIG__ = testConfig;
    // Capture first uncaught error with stack
    window.__FIRST_ERROR__ = null;
    window.addEventListener('error', (e) => {
        if (!window.__FIRST_ERROR__) {
            window.__FIRST_ERROR__ = {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                stack: e.error ? e.error.stack : 'no stack'
            };
        }
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('UNHANDLED_REJECTION:', e.reason);
    });
}, { playerStartID: 'forestPuzzle0' });

const page = await context.newPage();
page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[ERROR] ${msg.text()}`);
    else if (msg.text().includes('Setting visibility') || msg.text().includes('HUD init') || msg.text().includes('PuzzleHUD') || msg.text().includes('created and'))
        console.log(`[INFO] ${msg.text()}`);
});

await page.goto('http://localhost:5173/test.html');
await page.waitForFunction(() => window.Phaser !== undefined, { timeout: 15000 });
await page.waitForTimeout(2000);

const err = await page.evaluate(() => window.__FIRST_ERROR__);
console.log('\n=== First uncaught error ===');
if (err) {
    console.log('Message:', err.message);
    console.log('File:', err.filename);
    console.log('Line:', err.lineno, 'Col:', err.colno);
    console.log('Stack:\n', err.stack);
} else {
    console.log('No uncaught errors captured');
}

const frames = await page.evaluate(() => window.game?.loop?.frame ?? -1);
console.log('\nGame frames:', frames);

await browser.close();
