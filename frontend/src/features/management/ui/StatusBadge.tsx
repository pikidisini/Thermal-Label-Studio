import { Badge } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
export function StatusBadge({ value }: { value: string }) {
  const t = useTranslation();
  return <Badge tone={value === 'Approved' || value === 'Enabled' ? 'success' : value === 'Pending review' ? 'warning' : 'neutral'}>{t(value)}</Badge>;
}
