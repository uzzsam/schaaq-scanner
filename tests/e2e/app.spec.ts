/**
 * Schaaq Scanner — Electron E2E Tests
 *
 * Launches the packaged (unpacked) Electron app and exercises core UI flows.
 * Prerequisite: `npm run electron:build:win` (creates installer-output/win-unpacked/)
 *
 * The app boots an embedded Express server on port 23847, then loads
 * the React UI in a BrowserWindow. These tests interact with the
 * renderer process via Playwright's Electron support.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..', '..');
const EXECUTABLE = path.join(ROOT, 'installer-output', 'win-unpacked', 'Schaaq Scanner.exe');

/** Launch the Electron app and wait for the main window to be ready. */
async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    // Give the embedded Express server time to boot
    timeout: 60_000,
  });

  // The app creates a splash window first, then the main window.
  // The splash is destroyed once the main window finishes loading.
  // We poll app.windows() looking for the main window (localhost:23847).
  // We must try/catch because accessing a destroyed window throws.
  let page: Page | null = null;
  const deadline = Date.now() + 50_000;

  while (Date.now() < deadline) {
    for (const w of app.windows()) {
      try {
        const url = w.url();
        if (url.includes('localhost:23847')) {
          page = w;
          break;
        }
      } catch {
        // Window was destroyed (e.g. splash) — skip it
      }
    }
    if (page) break;
    await new Promise((r) => setTimeout(r, 1_000));
  }

  if (!page) {
    // Fallback: grab the last surviving window
    const windows = app.windows();
    if (windows.length > 0) {
      page = windows[windows.length - 1];
    } else {
      throw new Error('No Electron windows found after 50 s');
    }
  }

  // Wait for DOM content to finish loading
  await page.waitForLoadState('domcontentloaded');

  // Wait until the React root has mounted with real content
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      if (!root) return false;
      return root.children.length > 0 && (root.innerText?.length ?? 0) > 10;
    },
    { timeout: 30_000 },
  );

  // Extra settle time for React hydration / sidebar render
  await page.waitForTimeout(2_000);

  return { app, page };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const launched = await launchApp();
  electronApp = launched.app;
  page = launched.page;

  // On fresh install with 0 projects, the Dashboard shows a full-screen
  // WelcomeWizard overlay (z-index: 9999) that blocks all pointer events
  // including sidebar navigation. Dismiss it by programmatically clicking
  // the Projects sidebar button via DOM (bypasses the overlay).
  const isWelcomeVisible = await page
    .getByText('Welcome to Schaaq Scanner')
    .isVisible()
    .catch(() => false);

  if (isWelcomeVisible) {
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim().includes('Projects')) {
          btn.click();
          return;
        }
      }
    });
    await page.waitForTimeout(1_000);
  }
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

// ── Test 1: App launches ─────────────────────────────────────────────────

test('app launches and renders without crash', async () => {
  // Debug: log window count and URLs
  const debugInfo = await electronApp.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    return wins.map((w) => ({
      id: w.id,
      title: w.getTitle(),
      url: w.webContents.getURL(),
      visible: w.isVisible(),
      size: w.getSize(),
      destroyed: w.isDestroyed(),
    }));
  });
  console.log('=== Window debug info ===');
  console.log(`Window count: ${debugInfo.length}`);
  for (const w of debugInfo) {
    console.log(`  Window ${w.id}: visible=${w.visible}, size=${w.size}, title="${w.title}", url="${w.url}"`);
  }
  console.log('=========================');

  // Window should exist and be visible
  const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.getSize()[0] > 500,
    );
    return win?.isVisible() ?? false;
  });
  expect(isVisible).toBe(true);

  // The page should not be blank — check that a meaningful element loaded
  // The Layout sidebar always renders the "Schaaq" brand text
  const body = await page.locator('body');
  await expect(body).not.toBeEmpty();

  // Confirm no crash/blank screen: check for the sidebar or main content area
  const pageContent = await page.textContent('body');
  expect(pageContent).toBeTruthy();
  expect(pageContent!.length).toBeGreaterThan(10);
});

// ── Test 2: Navigation — all sidebar links work ─────────────────────────

test('sidebar navigation links work without blank screens', async () => {
  // Sidebar buttons may be partially overlapped by the content area div,
  // so we use { force: true } to bypass the actionability check.
  //
  // Note: Dashboard is skipped because on fresh install the WelcomeWizard
  // overlay blocks all sidebar interaction. We test Projects ↔ Settings instead.

  // Navigate to Projects
  await page.locator('button:has-text("Projects")').first().click({ force: true });
  await page.waitForLoadState('networkidle');
  let content = await page.textContent('body');
  expect(content!.length).toBeGreaterThan(10);
  // Should show either project list or empty state
  const hasProjectsContent =
    content!.includes('Projects') ||
    content!.includes('No projects yet');
  expect(hasProjectsContent).toBe(true);

  // Navigate to Settings
  await page.locator('button:has-text("Settings")').first().click({ force: true });
  await page.waitForLoadState('networkidle');
  content = await page.textContent('body');
  expect(content!.length).toBeGreaterThan(10);

  // Navigate back to Projects
  await page.locator('button:has-text("Projects")').first().click({ force: true });
  await page.waitForLoadState('networkidle');
  content = await page.textContent('body');
  expect(content!.length).toBeGreaterThan(10);
});

// ── Test 3: Fullscreen toggle — enter and exit ──────────────────────────

test('fullscreen toggle enters and exits correctly', async () => {
  // Start in non-fullscreen
  const initialFullscreen = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.getSize()[0] > 500,
    );
    return win?.isFullScreen() ?? false;
  });
  expect(initialFullscreen).toBe(false);

  // Enter fullscreen via Electron API
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.getSize()[0] > 500,
    );
    win?.setFullScreen(true);
  });
  await page.waitForTimeout(1000); // Wait for fullscreen transition

  const isFullscreen = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.getSize()[0] > 500,
    );
    return win?.isFullScreen() ?? false;
  });
  expect(isFullscreen).toBe(true);

  // Exit fullscreen — the exit button should appear in fullscreen mode
  // Use Electron API to exit (reliable across platforms)
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.getSize()[0] > 500,
    );
    win?.setFullScreen(false);
  });
  await page.waitForTimeout(1000);

  const exitedFullscreen = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.getSize()[0] > 500,
    );
    return win?.isFullScreen() ?? false;
  });
  expect(exitedFullscreen).toBe(false);
});

// ── Test 4: Projects page loads ─────────────────────────────────────────

test('projects page loads without error', async () => {
  await page.locator('button:has-text("Projects")').first().click({ force: true });
  await page.waitForLoadState('networkidle');

  // Should show either the project list or the empty state — not an error
  const content = await page.textContent('body');
  const hasValidState =
    content!.includes('Projects') ||
    content!.includes('No projects yet') ||
    content!.includes('Create Project');
  expect(hasValidState).toBe(true);

  // Should NOT show an unhandled error
  const hasError = content!.includes('Something went wrong') ||
    content!.includes('Unhandled') ||
    content!.includes('Cannot read properties');
  expect(hasError).toBe(false);
});

// ── Test 5: Connection wizard opens ─────────────────────────────────────

test('connection wizard opens from projects page', async () => {
  await page.locator('button:has-text("Projects")').first().click({ force: true });
  await page.waitForLoadState('networkidle');

  // Click the button that opens the wizard — either "Create Project" (empty state)
  // or "+ New Project" (when projects exist)
  const createBtn = page.locator('button:has-text("Create Project"), button:has-text("New Project")');
  await createBtn.first().click();

  // The wizard modal should appear with Step 1 — database type selection
  // Use exact matching to avoid collision with project cards (e.g. "postgresql · localhost:5432")
  await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('MySQL', { exact: true })).toBeVisible();
  await expect(page.getByText('SQL Server', { exact: true })).toBeVisible();
});

// ── Test 6: Wizard navigation — step through all 3 steps ────────────────

test('wizard navigates forward and backward through steps', async () => {
  // Wizard should still be open from Test 5.
  // If not, re-open it.
  const pgLabel = page.getByText('PostgreSQL', { exact: true });
  if (!(await pgLabel.isVisible().catch(() => false))) {
    await page.locator('button:has-text("Projects")').first().click({ force: true });
    await page.waitForLoadState('networkidle');
    const createBtn = page.locator('button:has-text("Create Project"), button:has-text("New Project")');
    await createBtn.first().click();
    await expect(pgLabel).toBeVisible({ timeout: 5_000 });
  }

  // Step 1: Select PostgreSQL
  await page.getByText('PostgreSQL', { exact: true }).click();

  // Click Next to go to Step 2
  await page.click('button:has-text("Next")');

  // Step 2: Verify connection fields exist
  await expect(page.locator('input[placeholder*="localhost"], input[value="localhost"]').first()).toBeVisible({ timeout: 5_000 });

  // Verify the expected fields are present (Host, Port, Database, Username, Password)
  const step2Content = await page.textContent('body');
  expect(step2Content).toContain('Host');
  expect(step2Content).toContain('Port');
  expect(step2Content).toContain('Database');

  // Click Back to return to Step 1
  await page.click('button:has-text("Back")');

  // Verify Step 1 is visible again
  await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('MySQL', { exact: true })).toBeVisible();
  await expect(page.getByText('SQL Server', { exact: true })).toBeVisible();
});

// ── Test 7: Wizard cancel ───────────────────────────────────────────────

test('wizard cancel closes the modal', async () => {
  // Ensure wizard is open
  const pgLabel = page.getByText('PostgreSQL', { exact: true });
  if (!(await pgLabel.isVisible().catch(() => false))) {
    await page.locator('button:has-text("Projects")').first().click({ force: true });
    await page.waitForLoadState('networkidle');
    const createBtn = page.locator('button:has-text("Create Project"), button:has-text("New Project")');
    await createBtn.first().click();
    await expect(pgLabel).toBeVisible({ timeout: 5_000 });
  }

  // Click Cancel
  await page.click('button:has-text("Cancel")');

  // The wizard modal should close — the exact "PostgreSQL" label should no longer be visible
  // (project cards show lowercase "postgresql · localhost:5432" which won't match exact)
  await expect(page.getByText('PostgreSQL', { exact: true })).not.toBeVisible({ timeout: 5_000 });

  // The Projects page should still be visible underneath
  const content = await page.textContent('body');
  const projectsVisible =
    content!.includes('Projects') ||
    content!.includes('No projects yet');
  expect(projectsVisible).toBe(true);
});

// ── Test 8: Demo mode — full flow ───────────────────────────────────────

test('demo mode creates project and appears in list', async () => {
  // Navigate to Projects page
  await page.locator('button:has-text("Projects")').first().click({ force: true });
  await page.waitForLoadState('networkidle');

  // Open the connection wizard
  const createBtn = page.locator('button:has-text("Create Project"), button:has-text("New Project")');
  await createBtn.first().click();

  // Verify Demo Database option is visible in Step 1
  await expect(page.getByText('Demo Database')).toBeVisible({ timeout: 5_000 });

  // Click Demo Database
  await page.getByText('Demo Database').click();

  // Verify "Start Demo Scan" button appears (steps 2/3 skipped)
  const demoBtn = page.locator('button:has-text("Start Demo Scan")');
  await expect(demoBtn).toBeVisible({ timeout: 3_000 });

  // Click Start Demo Scan — should create project and navigate to edit page
  await demoBtn.click();
  await page.waitForURL(/\/projects\/.*\/edit/, { timeout: 15_000 });

  // Navigate back to projects list
  await page.locator('button:has-text("Projects")').first().click({ force: true });
  await page.waitForLoadState('networkidle');

  // Verify "Pilbara Resources — Demo" appears in the project list
  await expect(page.getByText('Pilbara Resources', { exact: false })).toBeVisible({ timeout: 5_000 });
});

// ── Test 9: Dry run scan (uses demo project from Test 8) ────────────────

test('dry run scan navigates to progress screen', async () => {
  await page.locator('button:has-text("Projects")').first().click({ force: true });
  await page.waitForLoadState('networkidle');

  // Check if any projects exist by looking for the Dry Run button
  const dryRunBtn = page.locator('button:has-text("Dry Run")');
  const projectExists = await dryRunBtn.first().isVisible().catch(() => false);

  if (!projectExists) {
    test.skip();
    return;
  }

  // Click Dry Run on the first project
  await dryRunBtn.first().click();

  // Should navigate to scan progress screen
  await page.waitForURL(/\/scans\/.*\/progress/, { timeout: 10_000 });

  // The progress page should render with some status content
  const content = await page.textContent('body');
  expect(content!.length).toBeGreaterThan(10);

  // Should not show an unhandled error
  const hasError = content!.includes('Cannot read properties') ||
    content!.includes('Unhandled');
  expect(hasError).toBe(false);
});
