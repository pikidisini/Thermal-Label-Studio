/**
 * Thermal Label Studio - Simulation Capability Evaluator (Fase 3.1)
 *
 * Mengatur visibilitas tombol "Simulasi Label" terpadu di TopBar.
 * Sesuai Acceptance Criteria Fase 3.1:
 * - Tombol "Simulasi Label" hanya tampil jika capability SAP shadow simulation aktif di backend.
 * - SAFE_DEMO_MODE saja TIDAK BOLEH menampilkan tombol operator.
 * - Menghasilkan paling banyak satu tombol simulasi di seluruh kombinasi.
 */

export interface SimulationCapabilities {
  isSapShadowSimulationEnabled?: boolean;
  isSafeDemoEnabled?: boolean;
}

/**
 * Menentukan apakah tombol entry Simulasi Label harus ditampilkan di TopBar.
 *
 * Aturan matriks kapabilitas:
 * 1. keduanya mati (false, false) -> false
 * 2. Safe Demo saja aktif (false, true) -> false
 * 3. SAP simulation saja aktif (true, false) -> true
 * 4. keduanya aktif (true, true) -> true (paling banyak satu tombol simulasi)
 */
export function shouldShowLabelSimulation(capabilities?: SimulationCapabilities | null): boolean {
  if (!capabilities) return false;
  return Boolean(capabilities.isSapShadowSimulationEnabled);
}
