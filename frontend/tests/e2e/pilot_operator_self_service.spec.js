import { test, expect } from '@playwright/test';

test.describe('Pilot Operator Self-Service Simulation (B2B2N) End-to-End Suite', () => {
  test('Saat pilot operator aktif: form login operator tampil, autentikasi cookie-only berhasil memuat batch list, item sequence detail tampil, dan logout mengembalikan ke form login', async ({ page }) => {
    // 1. Mock status API with both simulation and pilot operator enabled
    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'online',
          safe_demo_mode: false,
          sap_shadow_simulation_enabled: true,
          pilot_operator_enabled: true,
        }),
      });
    });

    let isAuthenticated = false;

    // 2. Mock operator session probe (strictly without session_id in JSON)
    await page.route('**/api/v1/simulation/operator/session', async (route) => {
      if (isAuthenticated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pilot_operator_enabled: true,
            authenticated: true,
            csrf_token: 'csrf-pilot-mock-token',
            role: 'pilot_operator',
            expires_at_epoch: Date.now() / 1000 + 3600,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pilot_operator_enabled: true,
            authenticated: false,
          }),
        });
      }
    });

    // 3. Mock operator login (HttpOnly cookie, strictly NO session_id in response JSON)
    await page.route('**/api/v1/simulation/operator/login', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.password === 'OperatorPilotSecret2026!') {
        isAuthenticated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Set-Cookie': 'pilot_session=sess-pilot-mock-uuid; HttpOnly; SameSite=Strict; Path=/',
          },
          body: JSON.stringify({
            status: 'authenticated',
            role: 'pilot_operator',
            csrf_token: 'csrf-pilot-mock-token',
            expires_at_epoch: Date.now() / 1000 + 3600,
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Invalid operator credentials.' }),
        });
      }
    });

    // 4. Mock operator batches list
    await page.route('**/api/v1/simulation/operator/batches', async (route) => {
      if (!isAuthenticated) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Operator session required.' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            batch_id: 'batch-sap-demo-001',
            request_id: 'REQ-DEMO-2026',
            label_code: 'N001',
            profile_version: 'v1.0-dev',
            status: 'completed',
            total_items: 2,
            completed_items: 2,
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            has_pdf: true,
          },
        ]),
      });
    });

    // 5. Mock operator batch detail with sequential items (P2)
    await page.route('**/api/v1/simulation/operator/batches/batch-sap-demo-001', async (route) => {
      if (!isAuthenticated) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Operator session required.' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          batch_id: 'batch-sap-demo-001',
          producer_namespace: 'SAP_DEV_TRD',
          request_id: 'REQ-DEMO-2026',
          printer_id: 'VIRTUAL_SINK_DEV',
          status: 'completed',
          total_items: 2,
          completed_items: 2,
          items: [
            {
              item_id: 'ITEM-ROLL-001',
              item_sequence: 1,
              template_version_id: 'label_roll_80x200',
              copies: 1,
              status: 'completed',
            },
            {
              item_id: 'ITEM-ROLL-002',
              item_sequence: 2,
              template_version_id: 'label_roll_80x200',
              copies: 1,
              status: 'completed',
            },
          ],
          created_at: new Date().toISOString(),
        }),
      });
    });

    // 6. Mock operator logout
    await page.route('**/api/v1/simulation/operator/logout', async (route) => {
      isAuthenticated = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'logged_out' }),
      });
    });

    // Navigate to root
    await page.goto('/');

    // Open simulation modal
    const simBtn = page.getByTestId('btn-sap-simulation');
    await expect(simBtn).toBeVisible();
    await simBtn.click();

    const modal = page.getByTestId('sap-shadow-simulation-modal');
    await expect(modal).toBeVisible();

    // Verify safety warning is displayed
    await expect(modal).toContainText('Batas Keamanan Fail-Closed');
    await expect(modal).toContainText('SIMULASI — BUKAN UNTUK CETAK FISIK');

    // Operator login card should be visible
    const pwdInput = page.getByTestId('input-pilot-password');
    await expect(pwdInput).toBeVisible();
    await expect(pwdInput).toHaveAttribute('type', 'password');

    // Test failed login
    await pwdInput.fill('WrongSecret');
    await page.getByTestId('btn-pilot-login').click();
    await expect(modal).toContainText('Kata sandi operator pilot tidak valid.');

    // Test successful login
    await pwdInput.fill('OperatorPilotSecret2026!');
    await page.getByTestId('btn-pilot-login').click();

    // Verify batch list is displayed
    const table = page.getByTestId('table-simulation-batches');
    await expect(table).toBeVisible();
    await expect(modal).toContainText('REQ-DEMO-2026');
    await expect(modal).toContainText('2/2');
    await expect(modal).toContainText('Bukti PDF');

    // P2: Verify toggle item sequence detail sub-panel
    const toggleItemsBtn = page.getByTestId('btn-toggle-items-batch-sap-demo-001');
    await expect(toggleItemsBtn).toBeVisible();
    await toggleItemsBtn.click();

    // Detail panel and item sequence table should appear
    const detailPanel = page.getByTestId('panel-batch-items-detail');
    await expect(detailPanel).toBeVisible();
    await expect(page.getByTestId('table-batch-items')).toBeVisible();

    // Verify item sequence ordering: #1 and #2
    const rowItem1 = page.getByTestId('row-item-1');
    await expect(rowItem1).toBeVisible();
    await expect(rowItem1).toContainText('#1');
    await expect(rowItem1).toContainText('ITEM-ROLL-001');
    await expect(rowItem1).toContainText('label_roll_80x200');

    const rowItem2 = page.getByTestId('row-item-2');
    await expect(rowItem2).toBeVisible();
    await expect(rowItem2).toContainText('#2');
    await expect(rowItem2).toContainText('ITEM-ROLL-002');

    // Close detail panel
    await toggleItemsBtn.click();
    await expect(page.getByTestId('table-batch-items')).not.toBeVisible();

    // Verify operator active badge and logout button
    await expect(page.getByTestId('badge-operator-active')).toBeVisible();
    const logoutBtn = page.getByTestId('btn-pilot-logout');
    await expect(logoutBtn).toBeVisible();

    // Perform logout
    await logoutBtn.click();

    // Form login should reappear
    await expect(page.getByTestId('input-pilot-password')).toBeVisible();
    await expect(page.getByTestId('badge-operator-active')).not.toBeVisible();
  });
});
