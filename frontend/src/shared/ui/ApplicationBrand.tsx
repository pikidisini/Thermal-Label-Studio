import { useTranslation } from '../i18n';
import { Badge, Button } from './primitives';
import { Icon } from './Icon';
import { LabelStudioLogo } from './LabelStudioLogo';

export function ApplicationBrand({ home = false, disabled = false, testId, markTestId, compact = false }: { home?: boolean; disabled?: boolean; testId?: string; markTestId?: string; compact?: boolean }) {
  const t = useTranslation();
  const content = <><Badge tone="primary" className="w-6 h-6 items-center justify-center" data-testid={markTestId}><Icon component={LabelStudioLogo} /></Badge><span className={`font-mono font-bold text-xs tracking-tight${compact ? ' hidden sm:inline' : ''}`}>Thermal Label Studio</span></>;
  return home ? <Button variant="toolbar" aria-label={t('Main menu')} title={t('Main menu')} disabled={disabled} onClick={() => { window.location.href = '/'; }} data-testid={testId} className="flex items-center gap-2">{content}</Button> : <div className="flex items-center gap-2" data-testid={testId}>{content}</div>;
}
