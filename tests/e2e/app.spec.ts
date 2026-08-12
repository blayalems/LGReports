import { expect, test, type Page } from '@playwright/test';

test.setTimeout(240_000);

const routes = [
  ['/', /Good (morning|afternoon|evening)/i],
  ['/report', 'Weekly Report'],
  ['/members', 'Members'],
  ['/campaign', 'Retention & qualification'],
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

  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Set up Life Group Tracker' })).toBeVisible();
  await page.getByRole('button', { name: 'Load fictional sample data' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i })).toBeVisible();
  await expectViewportStable(page);

  if (testInfo.project.name === 'desktop-chrome') {
    await resetMainScroll(page);
    await page.screenshot({ path: testInfo.outputPath('01-dashboard-desktop.png') });
  } else {
    await resetMainScroll(page);
    await page.screenshot({ path: testInfo.outputPath('01-dashboard-mobile.png') });
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
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: /Browser Test Member/i })).toBeVisible();

  await page.goto('./#/campaign');
  await page.getByRole('button', { name: /add official cycle 6 instead/i }).click();
  await expect(page.getByRole('tab', { name: 'One More for Jesus Campaign Cycle 6' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Light Up blocked by KGC')).toBeVisible();
  await expectViewportStable(page);

  // Journey A: create a named VIP, then build KGC eligibility from two distinct LG dates.
  await page.goto('./#/report');
  await page.locator('input[type="date"]').first().fill('2026-09-01');
  await page
    .getByRole('button', { name: /check-in/i })
    .first()
    .click();
  const firstLgDialog = page.getByRole('dialog');
  await firstLgDialog.getByRole('searchbox', { name: /search or add a member/i }).fill('Journey Test VIP');
  await firstLgDialog.getByRole('button', { name: /add “Journey Test VIP” as VIP & check in/i }).click();
  await firstLgDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.goto('./#/campaign');
  await page.getByRole('tab', { name: 'One More for Jesus Campaign Cycle 6' }).click();
  await page.getByRole('button', { name: /1 LG away from KGC/i }).click();
  await expect(page.getByRole('button', { name: /Journey Test VIP/i })).toBeVisible();

  await page.goto('./#/report');
  await page.locator('input[type="date"]').nth(1).fill('2026-09-02');
  await page
    .getByRole('button', { name: /check-in/i })
    .nth(1)
    .click();
  const secondLgDialog = page.getByRole('dialog');
  await secondLgDialog.getByRole('searchbox', { name: /search or add a member/i }).fill('Journey Test VIP');
  await secondLgDialog.getByRole('button', { name: /Journey Test VIP/i }).click();
  await secondLgDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.goto('./#/campaign');
  await page.getByRole('tab', { name: 'One More for Jesus Campaign Cycle 6' }).click();
  await page.getByRole('button', { name: /KGC eligible now/i }).click();
  await expect(page.getByRole('button', { name: /Journey Test VIP/i })).toBeVisible();

  await page.locator('#campaign-action-queue').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`02-kgc-queue-${testInfo.project.name}.png`) });

  // One KGC schedule completes KGC; NLS and BYNL remain explicitly non-gating.
  await page.getByText(/Cycle schedule & event check-in/i).click();
  const kgcSection = page.getByRole('heading', { name: 'Knowing God Class' }).locator('..').locator('..');
  await kgcSection
    .getByRole('button', { name: /Check in Knowing God Class/i })
    .first()
    .click();
  const kgcDialog = page.getByRole('dialog');
  await kgcDialog.getByRole('searchbox', { name: /search people/i }).fill('Journey Test VIP');
  await page.screenshot({ path: testInfo.outputPath(`03-kgc-checkin-${testInfo.project.name}.png`) });
  await kgcDialog.getByRole('button', { name: /Journey Test VIP/i }).click();
  await kgcDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'All people', exact: true }).click();
  await page.getByRole('button', { name: /Journey Test VIP/i }).click();
  const kgcMemberDialog = page.getByRole('dialog');
  await expect(kgcMemberDialog.getByText(/Completed Sep 27/i)).toBeVisible();
  await expect(kgcMemberDialog.getByRole('button', { name: 'New Life Sunday VIPs' })).toHaveAttribute('aria-pressed', 'false');
  await expect(kgcMemberDialog.getByRole('button', { name: 'Beginning Your New Life' })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(2_800);
  await kgcMemberDialog.getByText('Active-cycle qualification').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`04-member-kgc-qualified-${testInfo.project.name}.png`) });
  await kgcMemberDialog.getByRole('button', { name: 'Done', exact: true }).click();

  // Journey B: a third distinct LG date unlocks Light Up after KGC.
  await page.goto('./#/report');
  await page.locator('input[type="date"]').nth(2).fill('2026-09-03');
  await page
    .getByRole('button', { name: /check-in/i })
    .nth(2)
    .click();
  const thirdLgDialog = page.getByRole('dialog');
  await thirdLgDialog.getByRole('searchbox', { name: /search or add a member/i }).fill('Journey Test VIP');
  await thirdLgDialog.getByRole('button', { name: /Journey Test VIP/i }).click();
  await thirdLgDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.goto('./#/campaign');
  await page.getByRole('tab', { name: 'One More for Jesus Campaign Cycle 6' }).click();
  await page.getByRole('button', { name: 'Light Up ready', exact: true }).click();
  await expect(page.getByRole('button', { name: /Journey Test VIP/i })).toBeVisible();
  await page.locator('#campaign-action-queue').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`05-light-up-ready-${testInfo.project.name}.png`) });
  await page.getByText(/Cycle schedule & event check-in/i).click();
  const lightSection = page.getByRole('heading', { name: 'Light Up Retreat' }).locator('..').locator('..');
  await lightSection
    .getByRole('button', { name: /Check in Light Up Retreat/i })
    .first()
    .click();
  const lightUpDialog = page.getByRole('dialog');
  await lightUpDialog.getByRole('searchbox', { name: /search people/i }).fill('Journey Test VIP');
  await lightUpDialog.getByRole('button', { name: /Journey Test VIP/i }).click();
  await lightUpDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Baptism ready', exact: true }).click();
  await expect(page.getByRole('button', { name: /Journey Test VIP/i })).toBeVisible();
  await page.getByRole('button', { name: /Journey Test VIP/i }).click();
  const lightUpMemberDialog = page.getByRole('dialog');
  await expect(lightUpMemberDialog.getByText('0 / 2')).toBeVisible();
  await expect(lightUpMemberDialog.getByText('Ready', { exact: true })).toBeVisible();
  await lightUpMemberDialog.getByRole('button', { name: 'Done', exact: true }).click();

  // Journey C: distinct LIV Sundays produce 1/2, then 2/2.
  const livSection = page.getByRole('heading', { name: 'Living in Victory' }).locator('..').locator('..');
  const livButtons = livSection.getByRole('button', { name: /Check in Living in Victory/i });
  await livButtons.nth(0).click();
  const firstLivDialog = page.getByRole('dialog');
  await firstLivDialog.getByRole('searchbox', { name: /search people/i }).fill('Journey Test VIP');
  await firstLivDialog.getByRole('button', { name: /Journey Test VIP/i }).click();
  await firstLivDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /Journey Test VIP/i }).click();
  const firstMemberDialog = page.getByRole('dialog');
  await expect(firstMemberDialog.getByText('1 / 2')).toBeVisible();
  await page.waitForTimeout(2_800);
  await firstMemberDialog.getByText('Active-cycle qualification').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`06-liv-one-of-two-${testInfo.project.name}.png`) });
  await firstMemberDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await livButtons.nth(3).click();
  const secondLivDialog = page.getByRole('dialog');
  await secondLivDialog.getByRole('searchbox', { name: /search people/i }).fill('Journey Test VIP');
  await secondLivDialog.getByRole('button', { name: /Journey Test VIP/i }).click();
  await secondLivDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /Journey Test VIP/i }).click();
  const secondMemberDialog = page.getByRole('dialog');
  await expect(secondMemberDialog.getByText('2 / 2')).toBeVisible();
  await secondMemberDialog.getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('button', { name: 'All people', exact: true }).click();
  await page.locator('#campaign-action-queue').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`07-action-queue-${testInfo.project.name}.png`) });
  await resetMainScroll(page);
  await page.waitForTimeout(3_500);
  if (testInfo.project.name === 'desktop-chrome') {
    await page.screenshot({ path: testInfo.outputPath('08-command-center-desktop.png') });
  } else {
    await page.screenshot({ path: testInfo.outputPath('08-command-center-mobile.png') });
  }
  await expectViewportStable(page);

  await page.getByRole('heading', { name: 'Follow-up by Life Group' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`09-leader-accountability-${testInfo.project.name}.png`) });

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

  await page.goto('./#/campaign');
  await page.getByRole('tab', { name: 'One More for Jesus Campaign Cycle 6' }).click();
  await resetMainScroll(page);
  await expectViewportStable(page);
  await page.screenshot({ path: testInfo.outputPath(testInfo.project.name === 'desktop-chrome' ? 'campaign-dark-desktop.png' : 'campaign-dark-mobile.png') });

  expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
});
