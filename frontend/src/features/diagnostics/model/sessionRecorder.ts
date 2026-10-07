/**
 * AI Session Diagnostics & Telemetry Recorder
 * Captures user interactions, console errors, network requests, and Fabric canvas state
 * to generate a clean, copy-pasteable Markdown report for AI debugging.
 */

import { buildSessionReport } from './sessionReportGenerator';

export interface LogEntry {
  timestamp: string;
  level: 'ERROR' | 'WARN';
  message: string;
}

export interface NetworkLogEntry {
  timestamp: string;
  method: string;
  url: string;
  status: number | string | null;
  durationMs: number | null;
  error?: string | null;
}

export interface ActionEntry {
  timestamp: string;
  type: string;
  description: string;
  metadata?: any;
}

class SessionRecorder {
  public logs: LogEntry[];
  public networkLogs: NetworkLogEntry[];
  public actions: ActionEntry[];
  public isRecording: boolean;
  public maxItems: number;

  constructor() {
    this.logs = [];
    this.networkLogs = [];
    this.actions = [];
    this.isRecording = false;
    this.maxItems = 100;
  }

  start() {
    if (this.isRecording) return;
    this.isRecording = true;
    this._hookConsole();
    this._hookFetch();
    this._hookUserEvents();
    this.recordAction('SESSION_START', 'Diagnostic recording initialized');
  }

  recordAction(type: string, description: string, metadata: any = {}) {
    const entry: ActionEntry = {
      timestamp: new Date().toISOString().split('T')[1].replace('Z', ''),
      type,
      description,
      metadata,
    };
    this.actions.push(entry);
    if (this.actions.length > this.maxItems) this.actions.shift();
  }

  private _hookConsole() {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args: any[]) => {
      this.logs.push({
        timestamp: new Date().toISOString().split('T')[1].replace('Z', ''),
        level: 'ERROR',
        message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      });
      if (this.logs.length > this.maxItems) this.logs.shift();
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      this.logs.push({
        timestamp: new Date().toISOString().split('T')[1].replace('Z', ''),
        level: 'WARN',
        message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      });
      if (this.logs.length > this.maxItems) this.logs.shift();
      originalWarn.apply(console, args);
    };
  }

  private _hookFetch() {
    if (typeof window === 'undefined' || !window.fetch) return;
    const originalFetch = window.fetch;

    window.fetch = async (...args: any[]) => {
      const startTime = performance.now();
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || 'unknown';
      const method = (args[1] && args[1].method) || 'GET';

      const logEntry: NetworkLogEntry = {
        timestamp: new Date().toISOString().split('T')[1].replace('Z', ''),
        method,
        url,
        status: null,
        durationMs: null,
        error: null,
      };

      try {
        const response = await originalFetch.apply(window, args as any);
        logEntry.status = response.status;
        logEntry.durationMs = Math.round(performance.now() - startTime);

        if (!response.ok) {
          try {
            const clone = response.clone();
            logEntry.error = await clone.text();
          } catch (_) {
            logEntry.error = 'Failed to read error body';
          }
        }

        this.networkLogs.push(logEntry);
        if (this.networkLogs.length > this.maxItems) this.networkLogs.shift();
        return response;
      } catch (err: any) {
        logEntry.status = 'NETWORK_ERROR';
        logEntry.durationMs = Math.round(performance.now() - startTime);
        logEntry.error = err.message;
        this.networkLogs.push(logEntry);
        if (this.networkLogs.length > this.maxItems) this.networkLogs.shift();
        throw err;
      }
    };
  }

  private _hookUserEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        if (target.closest && target.closest('[data-ai-recorder]')) return;

        const tag = target.tagName ? target.tagName.toLowerCase() : 'element';
        const id = target.id ? `#${target.id}` : '';
        const text = (target.innerText || (target as HTMLInputElement).value || '').trim().slice(0, 30);
        const testId = target.getAttribute ? target.getAttribute('data-testid') : null;
        const label = testId ? `[data-testid="${testId}"]` : `${tag}${id}${text ? ` ("${text}")` : ''}`;

        this.recordAction('CLICK', `Clicked on ${label}`);
      },
      true
    );

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt') return;
        const combo = [];
        if (e.ctrlKey || e.metaKey) combo.push('Ctrl');
        if (e.altKey) combo.push('Alt');
        if (e.shiftKey) combo.push('Shift');
        combo.push(e.key);
        this.recordAction('KEYBOARD', `Shortcut / Key: ${combo.join('+')}`);
      },
      true
    );
  }

  generateReport(canvasInstance: any = null) {
    return buildSessionReport(this.logs, this.networkLogs, this.actions, canvasInstance);
  }

  downloadReport(canvasInstance: any = null) {
    const content = this.generateReport(canvasInstance);
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-diagnostic-session-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async copyReportToClipboard(canvasInstance: any = null) {
    const content = this.generateReport(canvasInstance);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(content);
      return true;
    }
    return false;
  }
}

export const sessionRecorder = new SessionRecorder();
