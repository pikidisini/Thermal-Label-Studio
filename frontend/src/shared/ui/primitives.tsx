import React from 'react';

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
const toneClass: Record<Tone, string> = {
  neutral: 'border-outline-variant text-on-surface-variant',
  primary: 'border-primary-container bg-primary-container text-on-primary-container',
  success: 'border-tertiary-container text-tertiary',
  warning: 'border-secondary-container text-secondary',
  danger: 'border-studio-rose text-studio-rose',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone };
export function Button({ tone = 'neutral', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cx('border px-3 py-1 text-label-md focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50', toneClass[tone], className)} {...props} />;
}

export type IconButtonProps = ButtonProps & { label: string };
export function IconButton({ label, children, className, ...props }: IconButtonProps) {
  return <Button aria-label={label} title={label} className={cx('inline-flex h-7 w-7 items-center justify-center p-0', className)} {...props}>{children}</Button>;
}

export const Dialog = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Dialog({ children, className, ...props }, ref) {
  return <div ref={ref} role="dialog" aria-modal="true" className={cx('border border-outline-variant bg-surface-container text-on-surface shadow-2xl', className)} {...props}>{children}</div>;
});
export function DialogHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cx('border-b border-outline-variant px-4 py-3', className)} {...props}>{children}</div>; }
export function DialogBody({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cx('px-4 py-3', className)} {...props}>{children}</div>; }
export function DialogFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cx('border-t border-outline-variant px-4 py-3', className)} {...props}>{children}</div>; }

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) { return <label className={cx('grid gap-1 text-label-sm text-on-surface-variant', className)}><span>{label}</span>{children}</label>; }
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) { return <input ref={ref} className={cx('border border-outline-variant bg-surface-container-low px-2 py-1 text-label-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary', className)} {...props} />; });
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) { return <select ref={ref} className={cx('border border-outline-variant bg-surface-container-low px-2 py-1 text-label-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary', className)} {...props} />; });
export function Badge({ tone = 'neutral', className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) { return <span className={cx('inline-flex border px-1.5 py-0.5 text-label-sm', toneClass[tone], className)} {...props}>{children}</span>; }
export function Status({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) { return <Badge tone={tone}>{children}</Badge>; }
export function EmptyState({ title, detail }: { title: string; detail?: string }) { return <div className="p-4 text-center text-on-surface-variant"><p className="text-label-md">{title}</p>{detail ? <p className="mt-1 text-label-sm">{detail}</p> : null}</div>; }
export function ErrorState({ title = 'Unable to load content', detail }: { title?: string; detail?: string }) { return <div role="alert" className="border border-studio-rose p-3 text-studio-rose"><p className="text-label-md">{title}</p>{detail ? <p className="mt-1 text-label-sm">{detail}</p> : null}</div>; }
