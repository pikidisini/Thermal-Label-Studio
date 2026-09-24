import { test, expect } from '@playwright/test';

test.describe('App Login & Unified Simulation Self-Service E2E Suite (Fase 3.3)', () => {
  // Start unauthenticated so test exercises login, studio transition, and logout lifecycle
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Alur login aplikasi PPIC -> masuk Studio -> buka Simulasi Label -> periksa batch & urutan item -> periksa bukti PDF -> logout aplikasi global', async ({ page }) => {
    let isAuthenticated = false;

    // 1. Mock status API
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

    // 2. Mock auth probe (/auth/me)
    await page.route('**/api/v1/auth/me', async (route) => {
      if (isAuthenticated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            user: {
              id: 'usr-ppic-001',
              username: 'ppic_operator',
              role: 'PPIC',
              is_active: true,
              created_at: new Date().toISOString(),
            },
            csrf_token: 'csrf-app-mock-token-ppic',
            expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Sesi aplikasi belum terotentikasi.' }),
        });
      }
    });

    // 3. Mock auth login (/auth/login)
    await page.route('**/api/v1/auth/login', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.username === 'ppic_operator' && body.password === 'PpicPassword2026!') {
        isAuthenticated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Set-Cookie': 'app_session=sess-app-mock-uuid; HttpOnly; SameSite=Lax; Path=/',
          },
          body: JSON.stringify({
            status: 'authenticated',
            user: {
              id: 'usr-ppic-001',
              username: 'ppic_operator',
              role: 'PPIC',
              is_active: true,
            },
            csrf_token: 'csrf-app-mock-token-ppic',
            expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Nama pengguna atau kata sandi tidak valid.' }),
        });
      }
    });

    // 4. Mock auth CSRF probe (/auth/csrf)
    await page.route('**/api/v1/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrf_token: 'csrf-app-mock-token-ppic' }),
      });
    });

    // 5. Mock auth logout (/auth/logout)
    await page.route('**/api/v1/auth/logout', async (route) => {
      isAuthenticated = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'logged_out' }),
      });
    });

    // 6. Mock templates list for studio
    await page.route('**/api/v1/templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'label_roll_80x200',
            name: 'Roll 80x200 mm',
            width_mm: 80,
            height_mm: 200,
            is_system: true,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]),
      });
    });

    // 7. Mock simulation session probe
    await page.route('**/api/v1/simulation/operator/session', async (route) => {
      if (isAuthenticated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pilot_operator_enabled: true,
            authenticated: true,
            csrf_token: 'csrf-app-mock-token-ppic',
            operator_label: '[PPIC] ppic_operator',
            role: 'PPIC',
            username: 'ppic_operator',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
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

    // 8. Mock batches list
    await page.route('**/api/v1/simulation/operator/batches', async (route) => {
      if (!isAuthenticated) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Sesi aplikasi tidak valid.' }),
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

    // 9. Mock batch item sequence detail
    await page.route('**/api/v1/simulation/operator/batches/batch-sap-demo-001', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          batch_id: 'batch-sap-demo-001',
          producer_namespace: 'SAP_DEV',
          request_id: 'REQ-DEMO-2026',
          printer_id: 'PILOT-PRINTER-01',
          status: 'completed',
          total_items: 2,
          completed_items: 2,
          items: [
            {
              item_id: 'item-demo-001',
              item_sequence: 1,
              template_version_id: 'label_roll_80x200',
              copies: 1,
              status: 'completed',
              material_desc: 'OPP TAPE TRANSPARENT',
            },
            {
              item_id: 'item-demo-002',
              item_sequence: 2,
              template_version_id: 'label_roll_80x200',
              copies: 1,
              status: 'completed',
              material_desc: 'OPP TAPE TRANSPARENT',
            },
          ],
          created_at: new Date().toISOString(),
        }),
      });
    });

    // 10. Mock PDF download
    await page.route('**/api/v1/simulation/batches/batch-sap-demo-001/pdf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-1.4 synthetic mock pdf evidence'),
      });
    });

    // Step A: Navigate to root (unauthenticated) -> lands on LoginPage
    await page.goto('/');

    const loginPage = page.getByTestId('login-page');
    await expect(loginPage).toBeVisible();

    const usernameInput = page.getByTestId('input-username');
    const passwordInput = page.getByTestId('input-password');
    const loginBtn = page.getByTestId('btn-login');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(loginBtn).toBeVisible();

    // Step B: Attempt login with invalid credentials -> shows error message
    await usernameInput.fill('ppic_operator');
    await passwordInput.fill('WrongPassword!');
    await loginBtn.click();

    const errorAlert = page.getByTestId('login-error-message');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('Nama pengguna atau kata sandi tidak valid');

    // Step C: Login with valid credentials -> transitions to AuthenticatedStudio
    await usernameInput.fill('ppic_operator');
    await passwordInput.fill('PpicPassword2026!');
    await loginBtn.click();

    // Verify studio is mounted
    await expect(page.getByTestId('container-top-menubar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('topbar-user-section')).toBeVisible();
    await expect(page.getByTestId('topbar-user-role-badge')).toContainText('PPIC');
    await expect(page.getByTestId('topbar-username')).toContainText('ppic_operator');
    await expect(page.getByTestId('btn-app-logout')).toBeVisible();

    // Safety Invariant: Ensure physical printing endpoints fail-closed with 404 in simulation-only mode
    const physicalPrintProbe = await page.request.post('/api/v1/print/batch', {
      data: { test: 'simulation-guard' },
      failOnStatusCode: false,
    });
    expect(physicalPrintProbe.status()).toBe(404);

    const sapPrintProbe = await page.request.post('/api/v1/sap/print', {
      data: { test: 'simulation-guard' },
      failOnStatusCode: false,
    });
    expect(sapPrintProbe.status()).toBe(404);

    // Step D: Open unified simulation modal
    const simBtn = page.getByTestId('btn-label-simulation');
    await expect(simBtn).toBeVisible();
    await simBtn.click();

    const modal = page.getByTestId('sap-shadow-simulation-modal');
    await expect(modal).toBeVisible();

    // Verify safety warning is displayed (fail-closed, zero physical print)
    await expect(modal).toContainText('Batas Keamanan Fail-Closed');
    await expect(modal).toContainText('SIMULASI — BUKAN UNTUK CETAK FISIK');

    // Verify active unified operator badge in modal header
    const operatorBadge = page.getByTestId('badge-operator-active');
    await expect(operatorBadge).toBeVisible();
    await expect(operatorBadge).toContainText('[PPIC] ppic_operator');

    // Verify old pilot login form is NOT in DOM
    await expect(page.getByTestId('input-pilot-password')).not.toBeVisible();
    await expect(page.getByTestId('btn-pilot-login')).not.toBeVisible();

    // Step E: Verify batch list is displayed
    const table = page.getByTestId('table-simulation-batches');
    await expect(table).toBeVisible();
    await expect(modal).toContainText('REQ-DEMO-2026');
    await expect(modal).toContainText('2/2');

    // Verify PDF evidence button is present
    const pdfBtn = page.getByTestId('btn-view-pdf');
    await expect(pdfBtn).toBeVisible();

    // Step F: Toggle item sequence detail sub-panel
    const toggleItemsBtn = page.getByTestId('btn-toggle-items-batch-sap-demo-001');
    await expect(toggleItemsBtn).toBeVisible();
    await toggleItemsBtn.click();

    const detailPanel = page.getByTestId('panel-batch-items-detail');
    await expect(detailPanel).toBeVisible();
    await expect(page.getByTestId('table-batch-items')).toBeVisible();

    // Verify item sequence ordering: #1 and #2
    const rowItem1 = page.getByTestId('row-item-1');
    await expect(rowItem1).toBeVisible();
    await expect(rowItem1).toContainText('#1');

    const rowItem2 = page.getByTestId('row-item-2');
    await expect(rowItem2).toBeVisible();
    await expect(rowItem2).toContainText('#2');

    // Close detail panel
    await toggleItemsBtn.click();
    await expect(page.getByTestId('table-batch-items')).not.toBeVisible();

    // Close simulation modal
    await page.getByTestId('btn-close-sap-simulation').click();
    await expect(modal).not.toBeVisible();

    // Step G: Perform global app logout
    const logoutBtn = page.getByTestId('btn-app-logout');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Verify user is redirected back to login page
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('container-top-menubar')).not.toBeVisible();
  });

  test('Operator PPIC mengimpor berkas JSON SAP lokal raw v2 dengan CSRF, melihat konfirmasi keamanan, mengunggah berkas, dan memeriksa batch hasil impor', async ({ page }) => {
    let isAuthenticated = true;
    let batchesList = [];

    // 1. Mock status API
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

    // 2. Mock auth probe
    await page.route('**/api/v1/auth/me', async (route) => {
      if (isAuthenticated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            user: {
              id: 'usr-ppic-001',
              username: 'ppic_operator',
              role: 'PPIC',
              is_active: true,
              created_at: new Date().toISOString(),
            },
            csrf_token: 'csrf-app-mock-token-ppic',
            expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Sesi aplikasi belum terotentikasi.' }),
        });
      }
    });

    // 3. Mock auth CSRF probe
    await page.route('**/api/v1/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrf_token: 'csrf-app-mock-token-ppic' }),
      });
    });

    // 4. Mock simulation session probe
    await page.route('**/api/v1/simulation/operator/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pilot_operator_enabled: true,
          authenticated: isAuthenticated,
          csrf_token: isAuthenticated ? 'csrf-app-mock-token-ppic' : '',
          role: 'PPIC',
          username: 'ppic_operator',
        }),
      });
    });

    // 5. Mock templates
    await page.route('**/api/v1/templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // 6. Mock batches list
    await page.route('**/api/v1/simulation/operator/batches', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(batchesList),
      });
    });

    // 7. Mock import-json endpoint with CSRF verification
    let importCalled = false;
    await page.route('**/api/v1/simulation/operator/import-json', async (route) => {
      importCalled = true;
      const headers = route.request().headers();
      expect(headers['x-csrf-token']).toBe('csrf-app-mock-token-ppic');

      const newBatch = {
        batch_id: 'batch-imported-999',
        request_id: 'REQ-LOCAL-IMPORT-001',
        label_code: 'N001',
        profile_version: 'v1.0-dev',
        status: 'completed',
        total_items: 2,
        completed_items: 2,
        simulation_tolerant: true,
        warning_count: 1,
        warnings: [{
          item_sequence: 2,
          field: 'type_film',
          reason: 'missing',
          message: "Informasi 'type_film' tidak ditemukan pada item 2; label menampilkan --.",
        }],
        created_at: new Date().toISOString(),
        has_pdf: true,
      };
      batchesList = [newBatch];

      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify(newBatch),
      });
    });

    // 8. Mock batch detail
    await page.route('**/api/v1/simulation/operator/batches/batch-imported-999', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          batch_id: 'batch-imported-999',
          producer_namespace: 'SAP_DEV',
          request_id: 'REQ-LOCAL-IMPORT-001',
          printer_id: 'PILOT-PRINTER-01',
          status: 'completed',
          total_items: 2,
          completed_items: 2,
          simulation_tolerant: true,
          warning_count: 1,
          warnings: [{
            item_sequence: 2,
            field: 'type_film',
            reason: 'missing',
            message: "Informasi 'type_film' tidak ditemukan pada item 2; label menampilkan --.",
          }],
          items: [
            {
              item_id: 'item-imp-001',
              item_sequence: 1,
              template_version_id: 'label_roll_80x200',
              copies: 1,
              status: 'completed',
            },
            {
              item_id: 'item-imp-002',
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

    // Navigate to studio (pre-authenticated)
    await page.goto('/');
    await expect(page.getByTestId('container-top-menubar')).toBeVisible({ timeout: 15000 });

    // Open simulation modal
    await page.getByTestId('btn-label-simulation').click();
    const modal = page.getByTestId('sap-shadow-simulation-modal');
    await expect(modal).toBeVisible();

    // Verify empty state is initially shown
    await expect(page.getByTestId('empty-simulation-batches')).toBeVisible();

    // Open import JSON panel
    const openImportBtn = page.getByTestId('btn-open-import-json');
    await expect(openImportBtn).toBeVisible();
    await openImportBtn.click();

    // Verify import panel and privacy warning
    const importPanel = page.getByTestId('panel-import-json');
    await expect(importPanel).toBeVisible();
    await expect(importPanel).toContainText('Pemberitahuan Keamanan & Privasi');
    await expect(importPanel).toContainText('ZMMR_LABEL_JSON');

    // Create synthetic JSON buffer and set file input
    const syntheticJson = JSON.stringify({
      contract_schema_version: '2.0-raw',
      producer_namespace: 'SAP_DEV',
      request_id: 'REQ-LOCAL-IMPORT-001',
      items: [],
    });

    const fileInput = page.getByTestId('input-import-json-file');
    await fileInput.setInputFiles({
      name: 'export_sap_dev.json',
      mimeType: 'application/json',
      buffer: Buffer.from(syntheticJson),
    });

    // Verify file name appears
    await expect(importPanel).toContainText('export_sap_dev.json');

    // Submit import
    const submitBtn = page.getByTestId('btn-submit-import-json');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify import API was invoked with CSRF header
    expect(importCalled).toBe(true);

    // Verify success alert appeared
    await expect(page.getByTestId('alert-import-json-success')).toContainText('1 peringatan');
    await expect(page.getByTestId('alert-import-json-warnings')).toContainText('Item 2: type_film');

    // Verify batch now appears in the table
    const table = page.getByTestId('table-simulation-batches');
    await expect(table).toBeVisible();
    await expect(table).toContainText('REQ-LOCAL-IMPORT-001');
    await expect(table).toContainText('2/2');

    // Verify item sequence detail is visible or can be opened
    const toggleItemsBtn = page.getByTestId('btn-toggle-items-batch-imported-999');
    await expect(toggleItemsBtn).toBeVisible();
    await toggleItemsBtn.click();
    await expect(page.getByTestId('batch-detail-warnings')).toContainText('Item 2: type_film');
  });
});
