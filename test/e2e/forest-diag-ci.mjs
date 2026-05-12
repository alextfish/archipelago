import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript((testConfig) => {
    window.__TEST_MODE__ = true;
    window.__TEST_CONFIG__ = testConfig;
}, { playerStartID: 'forest' });
const page = await context.newPage();

await page.goto('http://localhost:5173/test.html');
await page.waitForFunction(() => window.Phaser !== undefined, { timeout: 15000, polling: 1000 });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
    return {
        scrollWidth:  document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth:   window.innerWidth,
        innerHeight:  window.innerHeight,
        hasHOverflow: document.documentElement.scrollWidth  > window.innerWidth,
        hasVOverflow: document.documentElement.scrollHeight > window.innerHeight,
        offscreenDivs: Array.from(document.querySelectorAll('[data-testid], #player')).map(el => {
            const r = el.getBoundingClientRect();
            return {
                id: el.id,
                testId: el.dataset.testid,
                styleLeft: el.style.left,
                styleTop: el.style.top,
                docRight: Math.round(r.right + window.scrollX),
                docBottom: Math.round(r.bottom + window.scrollY),
            };
        }).filter(el => el.docRight > window.innerWidth || el.docBottom > window.innerHeight)
    };
});
console.log('=== FOREST (start: forest) ===');
console.log('Document size:', info.scrollWidth, 'x', info.scrollHeight, 'Viewport:', info.innerWidth, 'x', info.innerHeight);
console.log('Has overflow H:', info.hasHOverflow, 'V:', info.hasVOverflow);
console.log('Off-screen markers:', info.offscreenDivs.length);
for (const d of info.offscreenDivs.slice(0, 5)) {
    console.log(' ', d.id, d.testId, 'styleLeft:', d.styleLeft, 'styleTop:', d.styleTop, 'docRight:', d.docRight, 'docBottom:', d.docBottom);
}

// Also check forestPuzzle0
const context2 = await browser.newContext();
await context2.addInitScript((testConfig) => {
    window.__TEST_MODE__ = true;
    window.__TEST_CONFIG__ = testConfig;
}, { playerStartID: 'forestPuzzle0' });
const page2 = await context2.newPage();

await page2.goto('http://localhost:5173/test.html');
await page2.waitForFunction(() => window.Phaser !== undefined, { timeout: 15000, polling: 1000 });
await page2.waitForTimeout(3000);

const info2 = await page2.evaluate(() => {
    return {
        scrollWidth:  document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth:   window.innerWidth,
        innerHeight:  window.innerHeight,
        hasHOverflow: document.documentElement.scrollWidth  > window.innerWidth,
        hasVOverflow: document.documentElement.scrollHeight > window.innerHeight,
        offscreenDivs: Array.from(document.querySelectorAll('[data-testid], #player')).map(el => {
            const r = el.getBoundingClientRect();
            return {
                id: el.id,
                testId: el.dataset.testid,
                styleLeft: el.style.left,
                styleTop: el.style.top,
                docRight: Math.round(r.right + window.scrollX),
                docBottom: Math.round(r.bottom + window.scrollY),
            };
        }).filter(el => el.docRight > window.innerWidth || el.docBottom > window.innerHeight)
    };
});
console.log('\n=== forestPuzzle0 (start: forestPuzzle0) ===');
console.log('Document size:', info2.scrollWidth, 'x', info2.scrollHeight, 'Viewport:', info2.innerWidth, 'x', info2.innerHeight);
console.log('Has overflow H:', info2.hasHOverflow, 'V:', info2.hasVOverflow);
console.log('Off-screen markers:', info2.offscreenDivs.length);
for (const d of info2.offscreenDivs.slice(0, 5)) {
    console.log(' ', d.id, d.testId, 'styleLeft:', d.styleLeft, 'styleTop:', d.styleTop, 'docRight:', d.docRight, 'docBottom:', d.docBottom);
}

await browser.close();
