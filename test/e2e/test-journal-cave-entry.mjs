#!/usr/bin/env node

import {
    initTest,
    navigateAndWaitForLoad,
} from '../playwright/helpers.mjs';

async function runTest() {
    const { page, cleanup, baseURL } = await initTest({
        name: 'Journal Cave Entry',
        playerStartID: 'forestcave',
        headless: false,
        slowMo: 100,
    });

    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    page.on('pageerror', (error) => {
        pageErrors.push(error.message);
    });

    const failIfBrowserErrors = async (phase) => {
        if (consoleErrors.length === 0 && pageErrors.length === 0) {
            return;
        }

        console.error(`[TEST] Browser errors detected during ${phase}`);
        for (const error of consoleErrors) {
            console.error(`[TEST][CONSOLE ERROR] ${error}`);
        }
        for (const error of pageErrors) {
            console.error(`[TEST][PAGE ERROR] ${error}`);
        }

        await cleanup(`Browser errors during ${phase}`);
    };

    try {
        await navigateAndWaitForLoad(page, baseURL);

        console.log('[TEST] Waiting for initial overworld state...');
        await page.waitForTimeout(2000);

        const initialPosition = await page.evaluate(() => {
            return window.getPlayerPosition ? window.getPlayerPosition() : null;
        });

        console.log('[TEST] Initial player position:', initialPosition);
        if (!initialPosition) {
            throw new Error('Could not read initial player position');
        }

        await failIfBrowserErrors('initial load');

        console.log('[TEST] Holding ArrowUp to walk into the cave portal...');
        await page.keyboard.down('ArrowUp');
        await page.waitForTimeout(1800);
        await page.keyboard.up('ArrowUp');

        console.log('[TEST] Waiting for Journal Cave interior scene to activate...');
        await page.waitForFunction(() => {
            const game = window.game;
            if (!game?.scene) {
                return false;
            }

            const interiorScene = game.scene.getScene('InteriorScene');
            if (!interiorScene) {
                return false;
            }

            const systems = interiorScene.scene;
            return systems?.isActive?.() && interiorScene.mapKey === 'journalcave';
        }, { timeout: 10000, polling: 100 });

        await page.waitForTimeout(1000);

        const caveState = await page.evaluate(() => {
            const game = window.game;
            const overworldScene = game?.scene?.getScene?.('OverworldScene');
            const interiorScene = game?.scene?.getScene?.('InteriorScene');

            return {
                interiorActive: interiorScene?.scene?.isActive?.() ?? false,
                interiorVisible: interiorScene?.scene?.isVisible?.() ?? false,
                mapKey: interiorScene?.mapKey,
                playerX: interiorScene?.player?.x ?? null,
                playerY: interiorScene?.player?.y ?? null,
                overworldSleeping: overworldScene?.scene?.isSleeping?.() ?? false,
            };
        });

        console.log('[TEST] Cave state after portal transition:', caveState);

        if (!caveState.interiorActive || caveState.mapKey !== 'journalcave') {
            throw new Error(`Expected active InteriorScene for journalcave, got ${JSON.stringify(caveState)}`);
        }

        if (caveState.playerX === null || caveState.playerY === null) {
            throw new Error('Interior player was not created');
        }

        await failIfBrowserErrors('portal transition');

        console.log('[TEST] Journal cave entry completed without browser errors');
        await cleanup('Test success - journal cave entry completed');
    } catch (error) {
        console.error('[TEST] Error during test:', error.message);
        await cleanup(`Test error: ${error.message}`);
    }
}

runTest().catch(console.error);