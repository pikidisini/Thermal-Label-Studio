import React from 'react';
import { useTranslation } from '../i18n';

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');
export type ControlTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
export type ControlVariant = 'default' | 'toolbar' | 'icon' | 'menu' | 'toggle' | 'tab' | 'dock' | 'compact' | 'stepper';
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ControlTone;
  variant?: ControlVariant;
  selected?: boolean;
  /** Planned actions stay native-disabled; hover only explains availability. */
  disabledTreatment?: 'muted' | 'subtle' | 'planned';
};
export function Button({ tone = 'neutral', variant = 'default', selected = false, disabledTreatment = 'muted', className, type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} data-ui-control="button" data-variant={variant} data-tone={tone} data-selected={selected} data-disabled-treatment={disabledTreatment} className={cx('ui-control', className)} />;
}
export type IconButtonProps = ButtonProps & { label: string };
export function IconButton({ label, children, className, variant = 'icon', ...props }: IconButtonProps) {
  const t = useTranslation();
  return <Button {...props} variant={variant} data-ui-icon="true" aria-label={t(label)} title={props.title ?? t(label)} className={cx('inline-flex items-center justify-center', className)}>{children}</Button>;
}
export function Toggle({ selected = false, ...props }: ButtonProps) {
  return <Button {...props} variant="toggle" selected={selected} aria-pressed={selected} />;
}
export function Tab({ selected = false, ...props }: ButtonProps) {
  return <Button {...props} variant="tab" selected={selected} aria-pressed={selected} />;
}
export const Dialog = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Dialog({ children, className, ...props }, ref) {
  return <div {...props} ref={ref} role="dialog" aria-modal="true" data-ui-surface="dialog" className={className}>{children}</div>;
});
export function DialogHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div {...props} data-ui-section="dialog-header" className={className}>{children}</div>; }
export function DialogBody({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div {...props} data-ui-section="dialog-body" className={className}>{children}</div>; }
export function DialogFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div {...props} data-ui-section="dialog-footer" className={className}>{children}</div>; }
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <label data-ui-field="true" className={cx('grid', className)}><span>{label}</span>{children}</label>; }
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) { return <input {...props} ref={ref} data-ui-control="input" className={cx('ui-control', className)} />; });
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) { return <select {...props} ref={ref} data-ui-control="select" className={cx('ui-control', className)} />; });
export function Badge({ tone = 'neutral', className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: ControlTone }) { return <span {...props} data-ui-badge={tone} className={cx('inline-flex', className)}>{children}</span>; }
export function Status({ tone = 'neutral', children }: { tone?: ControlTone; children: React.ReactNode }) { return <Badge tone={tone}>{children}</Badge>; }
export function EmptyState({ title, detail }: { title: string; detail?: string }) { const t = useTranslation(); return <div data-ui-empty="true" className="p-4 text-center"><p>{t(title)}</p>{detail ? <p className="mt-1">{t(detail)}</p> : null}</div>; }
export function ErrorState({ title = 'Unable to load content', detail }: { title?: string; detail?: string }) { const t = useTranslation(); return <div role="alert" data-ui-error="true"><p>{t(title)}</p>{detail ? <p className="mt-1">{t(detail)}</p> : null}</div>; }
