import { expect, test, type Page } from '@playwright/test';

const routes = [
  ['/', /Good (morning|afternoon|evening)/i],
  ['/report', 'Weekly Report'],
  ['/members', 'Members'],
  ['/campaign', 'Campaign'],
  ['/events', 'Events & Goals'],
  ['/analytics', 'Analytics'],
  ['/history', 'Weekly history'],
  ['/settings', 'Settings'],
] as const;

async function expectViewportStable(page: Page) {
  const sizes = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.innerWidth + 1);
}

async function resetMainScroll(page: Page) {
  await page.locator('#main-content').evaluate((main) => main.scrollTo({ top: 0, left: 0 }));
}

test('first run, core workflows, routes, and responsive layout', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Set up Life Group Tracker' })).toBeVisible();
  await page.getByRole('button', { name: 'Load fictional sample data' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i })).toBeVisible();
  await expectViewportStable(page);

  if (testInfo.project.name === 'desktop-chrome') {
    await resetMainScroll(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png') });
  } else {
    await resetMainScroll(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png') });
  }

  for (const [route, heading] of routes) {
    await page.goto(`./#${route}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectViewportStable(page);
  }

  await page.goto('./#/members');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page).toHaveURL(/#\/members$/);

  await page.goto('./#/report');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByRole('button', { name: 'Reopen for edits' })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen for edits' }).click();
  await expect(page.getByText('Reopened for edits', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/^attendance$/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /check-in/i }).first()).toBeVisible();

  if (testInfo.project.name === 'desktop-chrome') {
    await resetMainScroll(page);
    await page.screenshot({ path: testInfo.outputPath('report-desktop.png') });
  } else {
    await resetMainScroll(page);
    await page.screenshot({ path: testInfo.outputPath('report-mobile.png') });
  }

  await page.goto('./#/members');
  await page.getByRole('button', { name: /add member/i }).click();
  const memberName = page.getByPlaceholder('Member name');
  await memberName.fill('Browser Test Member');
  await memberName.blur();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /Browser Test Member/i })).toBeVisible();

  await page.goto('./#/campaign');
  const campaignActual = page.getByRole('heading', { name: 'Milestone goals' }).locator('..').locator('input[type="number"]').first();
  await campaignActual.click();
  await campaignActual.press('Control+A');
  await campaignActual.pressSequentially('25');
  await campaignActual.blur();
  await expect(campaignActual).toHaveValue('25');
  const campaignGoal = page.getByRole('heading', { name: 'Milestone goals' }).locator('..').locator('input[type="number"]').nth(1);
  await campaignGoal.click();
  await campaignGoal.press('Control+A');
  await campaignGoal.pressSequentially('30');
  await campaignGoal.blur();
  await expect(campaignGoal).toHaveValue('30');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Campaign' })).toBeVisible();
  const persistedMilestones = page.getByRole('heading', { name: 'Milestone goals' }).locator('..').locator('input[type="number"]');
  await expect(persistedMilestones.first()).toHaveValue('25');
  await expect(persistedMilestones.nth(1)).toHaveValue('30');
  await page.goto('./#/members');
  await expect(page.getByRole('button', { name: /Browser Test Member/i })).toBeVisible();

  await page.goto('./#/events');
  await page.getByRole('button', { name: /add event/i }).click();
  const eventName = page.locator('input[placeholder="Event name"]:focus');
  await expect(eventName).toBeFocused();
  await eventName.fill('Browser Test Gathering');
  await eventName.blur();
  await expect
    .poll(() => page.getByPlaceholder('Event name').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)))
    .toContain('Browser Test Gathering');

  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectViewportStable(page);

  if (testInfo.project.name === 'desktop-chrome') {
    await resetMainScroll(page);
    await page.screenshot({ path: testInfo.outputPath('settings-desktop.png') });
  }

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});
