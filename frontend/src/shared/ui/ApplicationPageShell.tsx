import type { ReactNode } from 'react';

/** Shared chrome only; page content and actions remain feature-owned. */
export function ApplicationPageShell({ children, className = '' }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div data-ui-root="true" className={`application-page ${className}`}>{children}</div>;
}
