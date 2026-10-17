import { cloneElement, useId, type ReactElement } from 'react';
import { Field } from '../../../shared/ui';

/** Keep help outside the label, while exposing it as the control description. */
export function SapField({ label, help, children }: { label: string; help: string; children: ReactElement<{ 'aria-describedby'?: string; 'aria-label'?: string }> }) {
  const id = useId();
  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ');
  return <div className="management-sap-field"><Field label={label}>{cloneElement(children, { 'aria-describedby': describedBy, 'aria-label': children.props['aria-label'] ?? label })}</Field><p id={id} className="management-sap-help">{help}</p></div>;
}
