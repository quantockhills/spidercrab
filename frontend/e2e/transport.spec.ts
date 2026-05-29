import { test, expect } from '@playwright/test';

test.describe('Transport controls (play/stop)', () => {
  test('play and stop buttons appear on Tracks tab', async ({ page }) => {
    await page.goto('/');
    // Navigate to Tracks tab
    await page.getByText('Tracks').first().click();
    // Check transport buttons exist
    await expect(page.getByTestId('transport-play')).toBeVisible();
    await expect(page.getByTestId('transport-stop')).toBeVisible();
  });

  test('shows Stopped state by default', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Tracks').first().click();
    // Default state should be Stopped
    await expect(page.getByText('Stopped')).toBeVisible();
  });

  test('clicking play dispatches transport/play command', async ({ page }) => {
    const wsMessages: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        wsMessages.push(frame.payload as string);
      });
    });

    await page.goto('/');
    await page.getByText('Tracks').first().click();
    await page.getByTestId('transport-play').click();

    // Wait for the async send + any reconnect delay
    await page.waitForTimeout(1500);

    const playMsg = wsMessages.find(m => m.includes('transport/play'));
    expect(playMsg).toBeTruthy();
  });

  test('clicking stop dispatches transport/stop command', async ({ page }) => {
    const wsMessages: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        wsMessages.push(frame.payload as string);
      });
    });

    await page.goto('/');
    await page.getByText('Tracks').first().click();
    await page.getByTestId('transport-stop').click();

    await page.waitForTimeout(1500);

    const stopMsg = wsMessages.find(m => m.includes('transport/stop'));
    expect(stopMsg).toBeTruthy();
  });
});
