import { Activity, Files, Images, History, LayoutDashboard, Plug, Printer as PrinterIcon } from 'lucide-react';
import type { PersistedLayoutSummary } from '../../templates';
import type { AuditEvent, Printer, Source } from '../api/managementApi';

export const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'templates', label: 'Templates', icon: Files },
  { id: 'graphics', label: 'Graphics / Images', icon: Images },
  { id: 'printers', label: 'Printers', icon: PrinterIcon },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'audit', label: 'Audit Log', icon: History },
  { id: 'activity', label: 'Activity Log', icon: Activity },
  { id: 'datasets', label: 'Test Data', icon: Files },
] as const;
export type Section = typeof sections[number]['id'];
export type Editor = { kind: 'printer'; value: Printer; existing: boolean } | { kind: 'source'; value: Source; existing: boolean } | { kind: 'template'; value: PersistedLayoutSummary } | { kind: 'audit'; value: AuditEvent };
