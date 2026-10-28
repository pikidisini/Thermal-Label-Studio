import { Badge } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
export function StatusBadge({ value }: Readonly<{ value: string }>) {
  const t = useTranslation();
  let tone: 'success' | 'warning' | 'neutral' = 'neutral';
  if (value === 'Pending review') tone = 'warning';
  if (value === 'Approved' || value === 'Enabled') tone = 'success';
  return <Badge tone={tone}>{t(value)}</Badge>;
}
