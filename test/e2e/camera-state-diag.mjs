import { chromium } from 'playwright';

async function checkCameraState(playerStartID) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addInitScript((testConfig) => {
        window.__TEST_MODE__ = true;
        window.__TEST_CONFIG__ = testConfig;
    }, { playerStartID });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error(`  [PAGEERROR] ${e.message}`));

    await page.goto('http://localhost:5173/test.html');
    await page.waitForFunction(() => window.Phaser !== undefined, { timeout: 15000, polling: 500 });
    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
        const game = window.game;
        if (!game) return { error: 'no game' };
        const scene = game.scene.getScene('OverworldScene');
        if (!scene) return { error: 'no OverworldScene' };
        const cam = scene.cameras.main;
        const player = scene.player;
        
        // Check if game loop is ticking by looking at frame count
        const frame1 = game.loop.frame;
        return {
            camScrollX: cam.scrollX,
            camScrollY: cam.scrollY,
            camZoom: cam.zoom,
            camWorldViewX: cam.worldView.x,
            camWorldViewY: cam.worldView.y,
            camIsFollowing: !!cam._follow,
            followTargetX: cam._follow ? cam._follow.x : null,
            followTargetY: cam._follow ? cam._follow.y : null,
            playerX: player ? player.x : null,
            playerY: player ? player.y : null,
            gameFrame: frame1,
            gameMode: scene.gameMode,
            docScrollW: document.documentElement.scrollWidth,
            docScrollH: document.documentElement.scrollHeight,
            viewportW: window.innerWidth,
            viewportH: window.innerHeight,
        };
    });

    console.log(`\n=== playerStartID: ${playerStartID} ===`);
    console.log(`  Camera: scroll=(${info.camScrollX?.toFixed(0)}, ${info.camScrollY?.toFixed(0)}) zoom=${info.camZoom?.toFixed(2)}`);
    console.log(`  Camera worldView: (${info.camWorldViewX?.toFixed(0)}, ${info.camWorldViewY?.toFixed(0)})`);
    console.log(`  Camera following: ${info.camIsFollowing}  target=(${info.followTargetX?.toFixed(0)}, ${info.followTargetY?.toFixed(0)})`);
    console.log(`  Player: (${info.playerX?.toFixed(0)}, ${info.playerY?.toFixed(0)})`);
    console.log(`  Game frame: ${info.gameFrame}  gameMode: ${info.gameMode}`);
    console.log(`  Document: ${info.docScrollW}x${info.docScrollH}  Viewport: ${info.viewportW}x${info.viewportH}`);
    console.log(`  Overflow: H=${info.docScrollW > info.viewportW} V=${info.docScrollH > info.viewportH}`);

    // Also check a few marker positions
    const markers = await page.evaluate(() => {
        const player = document.getElementById('player');
        const divs = Array.from(document.querySelectorAll('[data-testid]')).slice(0, 5);
        const all = player ? [player, ...divs] : divs;
        return all.map(el => ({
            id: el.id,
            testId: el.dataset.testid,
            styleLeft: el.style.left,
            styleTop: el.style.top,
        }));
    });
    console.log(`  Sample marker positions:`);
    for (const m of markers.slice(0, 6)) {
        console.log(`    id=${m.id} testId=${m.testId}  left=${m.styleLeft} top=${m.styleTop}`);
    }

    await browser.close();
}

await checkCameraState('forest');
await checkCameraState('forestPuzzle0');
