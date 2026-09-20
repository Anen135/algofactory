import { expect, test, type Page } from '@playwright/test';
import type { FactoryGraph } from '../src/core/types';
import { solution } from '../src/core/test-factories';
import { levels } from '../src/content/levels';

async function graph(page: Page, level = 'first-signal'): Promise<FactoryGraph> {
  return page.evaluate(id => JSON.parse(localStorage.getItem(`data-factory:v1:graph:${id}`) ?? '{"version":1,"machines":[],"connections":[]}'), level);
}

test('build first level using the canvas, run, save and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/first-screen.png' });
  const canvas = page.locator('#game canvas');
  await page.locator('[data-machine="source"]').dragTo(canvas, { targetPosition: { x: 150, y: 110 } });
  await expect.poll(async () => (await graph(page)).machines.length).toBe(1);
  await page.locator('[data-machine="output"]').dragTo(canvas, { targetPosition: { x: 480, y: 110 } });
  await expect.poll(async () => (await graph(page)).machines.length).toBe(2);
  const bounds = (await canvas.boundingBox())!;
  const source = (await graph(page)).machines.find(m => m.type === 'source')!;
  const output = (await graph(page)).machines.find(m => m.type === 'output')!;
  await page.mouse.move(bounds.x + source.x + 180, bounds.y + source.y + 68);
  await page.mouse.down();
  await page.mouse.move(bounds.x + output.x, bounds.y + output.y + 68, { steps: 15 });
  await page.mouse.up();
  await expect.poll(async () => (await graph(page)).connections.length).toBe(1);
  await page.locator('#speed').selectOption('4');
  await page.locator('#run-btn').click();
  await expect(page.locator('#test-count')).toHaveText('5/5');
  await expect(page.locator('.test-summary')).toContainText('ФАБРИКА РАБОТАЕТ');
  await page.reload();
  await expect(page.locator('#graph-count')).toContainText('2 машин · 1 связей');
  await expect(page.locator('#progress-label')).toContainText('1 / 10');
  expect(errors).toEqual([]);
});

test('move, undo and redo machines', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#game canvas');
  await page.locator('[data-machine="source"]').dragTo(canvas, { targetPosition: { x: 150, y: 110 } });
  const source = (await graph(page)).machines[0];
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + source.x + 35, b.y + source.y + 25);
  await page.mouse.down();
  await page.mouse.move(b.x + source.x + 131, b.y + source.y + 73, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await graph(page)).machines[0].x).toBe(source.x + 96);
  await expect(page.locator('.selected-machine')).toContainText('SOURCE');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await graph(page)).machines[0].x).toBe(source.x);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await graph(page)).machines[0].x).toBe(source.x + 96);
});

test('pause, step, code view and runtime lock', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="map"]').click();
  await page.locator('[data-level="double"]').click();
  await page.locator('#import-file').setInputFiles({ name: 'double.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(solution(1))) });
  await page.locator('[data-action="fit"]').click();
  await page.locator('#speed').selectOption('0.25');
  await page.locator('#run-btn').click();
  await expect(page.locator('#run-btn')).toContainText('Пауза');
  await page.locator('#run-btn').click();
  await expect(page.locator('#mode')).toContainText('PAUSED');
  const ticks = await page.locator('#stats-line').textContent();
  await page.waitForTimeout(600);
  await expect(page.locator('#stats-line')).toHaveText(ticks!);
  await page.locator('#step-btn').click();
  await expect(page.locator('#stats-line')).toContainText('1 тиков');
  const before = await graph(page, 'double');
  await expect(page.locator('[data-machine="source"]')).toBeDisabled();
  expect(await graph(page, 'double')).toEqual(before);
  await page.locator('#speed').selectOption('0');
  await page.locator('#run-btn').click();
  await expect(page.locator('#test-count')).toHaveText('5/5');
  await page.locator('[data-tab="code"]').click();
  await expect(page.locator('.code-view')).toContainText('def factory(input_value)');
  await page.locator('#language').selectOption('JavaScript');
  await expect(page.locator('.code-view')).toContainText('function factory(inputValue)');
});

test('inspector configuration, visible packets, wire deletion and camera controls', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('[data-action="map"]').click();
  await page.locator('[data-level="double"]').click();
  const g = solution(1);
  const positions: Record<string, [number, number]> = { s: [48, 48], c: [48, 240], m: [384, 120], o: [720, 120] };
  for (const m of g.machines) [m.x, m.y] = positions[m.id];
  await page.locator('#import-file').setInputFiles({ name: 'double.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(g)) });
  const canvas = page.locator('#game canvas'), b = (await canvas.boundingBox())!;
  await page.mouse.click(b.x + 90, b.y + 260);
  await expect(page.locator('.selected-machine')).toContainText('CONSTANT');
  await page.locator('[data-config="value"]').fill('true');
  await page.locator('[data-config="value"]').press('Tab');
  await expect(page.locator('#status-message')).toContainText('Несовместимые типы');
  await expect(page.locator('[data-config="value"]')).toHaveValue('2');
  await page.locator('[data-config="value"]').fill('3');
  await page.locator('[data-config="value"]').press('Tab');
  await expect.poll(async () => (await graph(page, 'double')).machines.find(m => m.id === 'c')!.config.value).toBe(3);
  await page.locator('#undo-btn').click();
  await expect.poll(async () => (await graph(page, 'double')).machines.find(m => m.id === 'c')!.config.value).toBe(2);
  await page.locator('#step-btn').click();
  await page.locator('#step-btn').click();
  await expect(page.locator('#stats-line')).toContainText('2 тиков');
  await page.waitForTimeout(450);
  const beforePacket = await canvas.screenshot();
  await page.locator('#step-btn').click();
  await expect(page.locator('#stats-line')).toContainText('3 тиков');
  const afterPacket = await canvas.screenshot();
  expect(afterPacket.equals(beforePacket)).toBe(false);
  await page.screenshot({ path: 'test-results/packet-step-1920.png' });
  await page.locator('#step-btn').click();
  await page.mouse.click(b.x + 420, b.y + 144);
  await expect(page.locator('.selected-machine')).toContainText('MATH');
  await expect(page.locator('#inspector-content')).toContainText('[5]');
  await page.locator('#edit-btn').click();
  // Wire midpoint between Source (228,116) and Math A (384,188).
  await page.mouse.click(b.x + 306, b.y + 152);
  await expect(page.locator('#inspector-content')).toContainText('Соединение');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await graph(page, 'double')).connections.length).toBe(2);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await graph(page, 'double')).connections.length).toBe(3);
  await page.locator('[data-action="zoom-out"]').click();
  await expect(page.locator('#game')).toHaveAttribute('data-zoom', '83%');
  await page.mouse.move(b.x + 500, b.y + 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x + 600, b.y + 450, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.locator('[data-action="fit"]').click();
  expect(await graph(page, 'double')).toEqual(g);
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect(page.locator('#game canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('all ten levels pass through import, run, tests and next level UI', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  for (let index = 0; index < levels.length; index++) {
    const level = levels[index];
    await expect(page.locator('#level-name')).toHaveText(level.name);
    await page.locator('#import-file').setInputFiles({ name: `${level.id}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(solution(index))) });
    await page.locator('[data-action="fit"]').click();
    await page.locator('#speed').selectOption('0');
    await page.locator('#run-btn').click();
    await expect(page.locator('#test-count')).toHaveText(`${level.tests.length}/${level.tests.length}`);
    await page.locator('[data-action="next"]').click();
  }
  await expect(page.locator('.level-card.completed')).toHaveCount(10);
  await page.reload();
  await expect(page.locator('#progress-label')).toContainText('10 / 10');
  expect(errors).toEqual([]);
});
