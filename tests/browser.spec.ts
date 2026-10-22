import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'BEGIN YOUR SHIFT' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.loading-screen')).toHaveCount(0, { timeout: 30000 });
}

async function approach(page: Page, id: string) {
  await page.evaluate(async objectId => {
    const { OBJECTS } = await import('/src/game/world.ts');
    const engine = window.__nightshift!;
    const obj = OBJECTS.find((o: { id: string }) => o.id === objectId)!;
    engine.state.player.x = obj.x;
    engine.state.player.z = obj.z + (objectId === 'exit' ? 2.3 : -2.3);
    engine.state.player.yaw = objectId === 'exit' ? 0 : Math.PI;
    engine.state.player.pitch = -.08;
    engine.refresh(); engine.interact();
  }, id);
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('main menu, settings persistence, and information panels work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'THE LAST NIGHT SHIFT.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /CONTINUE/ })).toBeDisabled();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('button', { name: 'advanced', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'advanced', exact: true })).toHaveClass(/selected/);
  await expect(page.getByRole('switch', { name: 'Reduced motion' })).toBeChecked();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'HOW TO PLAY' }).click();
  await expect(page.getByRole('heading', { name: 'How to survive' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /CREDITS/ }).click();
  await expect(page.getByRole('heading', { name: 'Credits & field notes' })).toBeVisible();
});

test('opening mission, collision, notebook, pause, checkpoint, and continue work', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  const beforeStall = await page.evaluate(() => window.__nightshift!.state.elapsed);
  await page.evaluate(() => { Object.defineProperty(window.__nightshift!, 'last', { value: performance.now() - 1600, writable: true }); });
  await expect.poll(() => page.evaluate(() => window.__nightshift!.state.elapsed)).toBeGreaterThan(beforeStall + 1.5);
  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: 'Your name is already here.' })).toBeVisible();
  await page.getByRole('button', { name: /LANGUAGE HELP/ }).click();
  await expect(page.locator('.language-help p')).toContainText('Keep watching');
  await page.getByRole('button', { name: 'TAKE THE KEY & CLOCK IN' }).click();
  await expect(page.locator('.hud-objective strong')).toHaveText('Bring the lights back.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('last-night-shift-save-v1')!).mission)).toBe(1);
  await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w');
  expect(await page.evaluate(() => window.__nightshift!.state.player.z)).toBeLessThan(6.97);
  await page.keyboard.press('j');
  await expect(page.getByRole('heading', { name: 'Words from the dark.' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search vocabulary' }).fill('auxiliary');
  await expect(page.locator('.vocabulary-entry')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Take a breath.' })).toBeVisible();
  const pausedTime = await page.evaluate(() => window.__nightshift!.state.elapsed);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__nightshift!.state.elapsed)).toBe(pausedTime);
  await page.getByRole('button', { name: /Save & return to menu/ }).click();
  await page.getByRole('button', { name: /CONTINUE/ }).click();
  await expect(page.locator('.loading-screen')).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('.hud-objective strong')).toHaveText('Bring the lights back.');
  expect(await page.evaluate(() => window.__nightshift!.state.flags.includes('staff-key'))).toBe(true);
  expect(errors).toEqual([]);
});

test('every mission UI reaches the secret ending and stores a high score', async ({ page }) => {
  await start(page);
  await page.keyboard.press('e'); await page.getByRole('button', { name: 'TAKE THE KEY & CLOCK IN' }).click();
  await approach(page, 'generator');
  await page.getByRole('textbox', { name: 'Access code' }).fill('0000');
  await page.getByRole('button', { name: 'RESTORE POWER', exact: true }).click();
  await expect(page.locator('.inline-error')).toContainText('ACCESS DENIED');
  await page.getByRole('textbox', { name: 'Access code' }).fill('0317');
  await page.getByRole('button', { name: 'RESTORE POWER', exact: true }).click();
  await approach(page, 'monitor');
  await page.getByRole('button', { name: /02.*WARD C/ }).click();
  await page.getByRole('button', { name: 'MARK THE MOVEMENT' }).click();
  await approach(page, 'ward');
  await page.getByRole('button', { name: /Search beneath the empty bed/ }).click();
  await approach(page, 'records');
  await page.getByRole('textbox', { name: 'Access code' }).fill('1984');
  await page.getByRole('button', { name: 'UNSEAL THE FILE' }).click();
  await page.getByRole('button', { name: /Keep a private copy/ }).click();
  await approach(page, 'isolation');
  await page.getByRole('button', { name: /Restore the patient's oxygen/ }).click();
  await approach(page, 'tape');
  await page.getByRole('button', { name: 'TAKE THE WITNESS TAPE' }).click();
  await approach(page, 'secret');
  await page.getByRole('textbox', { name: 'Memorial safe answer' }).fill('silence');
  await page.getByRole('button', { name: 'Unlock memorial safe' }).click();
  await approach(page, 'monitor');
  await page.getByRole('button', { name: 'BROADCAST THE TESTIMONY' }).click();
  expect(await page.evaluate(() => window.__nightshift!.state.mission)).toBe(7);
  await page.evaluate(() => { window.__nightshift!.state.elapsed = 480; window.__nightshift!.refresh(); });
  await approach(page, 'exit');
  await page.getByRole('button', { name: 'OPEN THE FRONT DOORS' }).click();
  await expect(page.getByRole('heading', { name: 'No one left behind.' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('last-night-shift-scores-v1')!)[0].ending)).toBe('secret');
});

test('enemy freezes under observation, investigates sound, and respects hiding', async ({ page }) => {
  await start(page);
  expect(await page.evaluate(() => window.__nightshift!.state.enemy.mode)).toBe('dormant');
  await page.evaluate(() => {
    const e = window.__nightshift!;
    e.perform('shift'); e.perform('generator', '0317'); e.perform('camera', 'ward');
    e.state.player.x = 19.55; e.state.player.z = 24.65; e.state.player.yaw = Math.PI; e.state.player.pitch = 0;
    e.state.enemy.x = 19.55; e.state.enemy.z = 31.45; e.state.enemy.mode = 'patrolling'; e.refresh();
  });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__nightshift!.state.enemy.z)).toBeCloseTo(31.45, 1);
  await expect(page.locator('.watch-warning')).toBeVisible();
  await page.evaluate(() => { window.__nightshift!.state.player.yaw = 0; });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__nightshift!.state.enemy.z)).toBeLessThan(31.3);
  await page.evaluate(() => {
    const e = window.__nightshift!;
    e.state.player.x = 9.35; e.state.player.z = 9.35; e.state.player.yaw = 0;
    e.state.enemy.x = 19.55; e.state.enemy.z = 12.75; e.state.enemy.mode = 'patrolling';
    e.distract();
  });
  expect(await page.evaluate(() => window.__nightshift!.state.enemy.mode)).toBe('investigating');
  await page.evaluate(() => {
    const e = window.__nightshift!; e.state.player.x = 12.75; e.state.player.z = 11.05; e.state.enemy.x = 19.55; e.state.enemy.z = 41.65; e.state.enemy.mode = 'patrolling'; e.toggleHide();
  });
  expect(await page.evaluate(() => window.__nightshift!.state.player.hidden)).toBe(true);
  expect(await page.evaluate(() => window.__nightshift!.state.player.flashlight)).toBe(false);
  await page.keyboard.press('h');
  expect(await page.evaluate(() => window.__nightshift!.state.player.hidden)).toBe(false);
});

test('mobile title fits and touch controls move, look, and interact', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await start(page);
  await expect(page.getByRole('button', { name: 'Interact', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Interact', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Your name is already here.' })).toBeVisible();
  await page.getByRole('button', { name: 'TAKE THE KEY & CLOCK IN' }).tap();
  const x = await page.evaluate(() => window.__nightshift!.state.player.x);
  const joystick = await page.locator('.touch-joystick').boundingBox();
  await page.mouse.move(joystick!.x + 48, joystick!.y + 48); await page.mouse.down(); await page.mouse.move(joystick!.x + 78, joystick!.y + 48); await page.waitForTimeout(800); await page.mouse.up();
  expect(Math.abs(await page.evaluate(() => window.__nightshift!.state.player.x) - x)).toBeGreaterThan(.3);
  const yaw = await page.evaluate(() => window.__nightshift!.state.player.yaw);
  await page.mouse.move(250, 350); await page.mouse.down(); await page.mouse.move(320, 350, { steps: 4 }); await page.mouse.up();
  expect(Math.abs(await page.evaluate(() => window.__nightshift!.state.player.yaw) - yaw)).toBeGreaterThan(.1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await context.close();
});

test('the bad ending keeps the checkpoint and allows immediate retry', async ({ page }) => {
  await start(page);
  await page.keyboard.press('e');
  await page.getByRole('button', { name: 'TAKE THE KEY & CLOCK IN' }).click();
  await approach(page, 'exit');
  await page.getByRole('button', { name: /Follow the voice downstairs/ }).click();
  await expect(page.getByRole('heading', { name: 'Your shift never ends.' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('last-night-shift-save-v1')!).mission)).toBe(1);
  await page.getByRole('button', { name: 'RETRY FROM CHECKPOINT' }).click();
  await expect(page.locator('.loading-screen')).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('.hud-objective strong')).toHaveText('Bring the lights back.');
});

test('language, avatar, camera modes, sanity, and cinematic transitions are functional', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /AVATAR/ }).click();
  await page.getByRole('button', { name: /Investigator/ }).click();
  await page.getByRole('button', { name: 'READY FOR THE SHIFT' }).click();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('button', { name: 'Монгол', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тохиргоо' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: /ШИНЭ ЭЭЛЖ ЭХЛҮҮЛЭХ/ })).toBeVisible();
  await page.getByRole('button', { name: /ШИНЭ ЭЭЛЖ ЭХЛҮҮЛЭХ/ }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.loading-screen')).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('.camera-readout')).toContainText('THIRD');
  await page.keyboard.press('v'); await expect(page.locator('.camera-readout')).toContainText('SHOULDER');
  await page.keyboard.press('v'); await expect(page.locator('.camera-readout')).toContainText('FIRST');
  await page.keyboard.press('v'); await expect(page.locator('.camera-readout')).toContainText('THIRD');
  expect(await page.evaluate(() => {
    const engine = window.__nightshift as unknown as { avatarGroup: { children: Array<{ userData: { avatarName?: string } }> } };
    return engine.avatarGroup.children.some(child => child.userData.avatarName === 'PRIVATE INVESTIGATOR');
  })).toBe(true);
  await page.evaluate(() => {
    const e = window.__nightshift!; e.state.mission = 3; e.state.enemy.mode = 'chasing'; e.state.enemy.x = e.state.player.x + 1.5; e.state.enemy.z = e.state.player.z; e.state.player.flashlight = false;
  });
  const sanity = await page.evaluate(() => window.__nightshift!.state.player.sanity);
  await expect.poll(() => page.evaluate(() => window.__nightshift!.state.player.sanity)).toBeLessThan(sanity);
  await page.evaluate(() => { const e = window.__nightshift!; e.state.player.x = 8; e.state.player.z = 23; e.refresh(); });
  await expect(page.locator('.camera-readout')).toContainText('FIXED');
});