// Tab-wide uncertainty survives account changes; it is cleared only after success
// or the operator's explicit device check. Never store label data or credentials.
const KEY = 'thermal-label-studio:studio-print-pending';
const storage = () => globalThis.window?.sessionStorage ?? globalThis.sessionStorage;
export function studioPrintLocked(): boolean {
  try { return !!storage().getItem(KEY); } catch { return true; }
}
export function lockStudioPrint(): void { storage().setItem(KEY, 'pending'); }
export function clearStudioPrint(): void { storage().removeItem(KEY); }
