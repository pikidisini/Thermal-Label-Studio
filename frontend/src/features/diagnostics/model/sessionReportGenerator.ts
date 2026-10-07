import { LogEntry, NetworkLogEntry, ActionEntry } from './sessionRecorder';

export function buildSessionReport(
  logs: LogEntry[],
  networkLogs: NetworkLogEntry[],
  actions: ActionEntry[],
  canvasInstance: any = null
): string {
  const errors = logs.filter((l) => l.level === 'ERROR');
  const failedRequests = networkLogs.filter(
    (n) => (typeof n.status === 'number' && n.status >= 400) || n.status === 'NETWORK_ERROR'
  );

  let canvasInfo = 'Canvas not connected';
  if (canvasInstance) {
    try {
      const objects = canvasInstance.getObjects ? canvasInstance.getObjects() : [];
      canvasInfo = `
- Dimensions: ${canvasInstance.width || 'N/A'}px x ${canvasInstance.height || 'N/A'}px
- Objects Count: ${objects.length}
- Object Types: ${objects.map((o: any) => o.type || 'unknown').join(', ') || 'None'}
- Active Object: ${canvasInstance.getActiveObject()?.type || 'None'}
`.trim();
    } catch (err: any) {
      canvasInfo = `Error inspecting canvas: ${err.message}`;
    }
  }

  return `# 🤖 AI Session Diagnostic Report
**Waktu Ekspor**: ${new Date().toLocaleString()}
**User Agent**: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
**Viewport**: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}

---

## 📌 Ringkasan Masalah
- **Total Error Console**: ${errors.length}
- **Total Network Request Gagal**: ${failedRequests.length}
- **Total Riwayat Aksi Pengguna**: ${actions.length}

---

## 🎨 Status Canvas
${canvasInfo}

---

## 🛑 Error Console Terbaru
${errors.length === 0 ? '_Tidak ada error console terdeteksi._' : errors.map((e) => `- \`[${e.timestamp}]\` **${e.level}**: ${e.message}`).join('\n')}

---

## 🌐 Permintaan Jaringan (API Network Requests)
${networkLogs.length === 0 ? '_Tidak ada request jaringan terekam._' : networkLogs.slice(-15).map((n) => `- \`[${n.timestamp}]\` \`${n.method} ${n.url}\` ➔ **Status ${n.status}** (${n.durationMs}ms)${n.error ? `\n  - Error: \`${n.error.slice(0, 200)}\`` : ''}`).join('\n')}

---

## 📋 Kronologi Interaksi Pengguna (15 Aksi Terakhir)
${actions.length === 0 ? '_Tidak ada aksi terekam._' : actions.slice(-15).map((a) => `- \`[${a.timestamp}]\` **${a.type}**: ${a.description}`).join('\n')}
`;
}
