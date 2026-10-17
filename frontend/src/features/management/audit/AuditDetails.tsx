import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';

export function AuditDetails({ management }: { management: ManagementController }) {
  const t = useTranslation(); const { editor } = management;
  if (!editor || editor.kind !== 'audit') return null;
  return <><p>{editor.value.note}</p><div className="management-fields"><section><h3>{t('Before')}</h3><pre>{JSON.stringify(editor.value.before, null, 2)}</pre></section><section><h3>{t('After')}</h3><pre>{JSON.stringify(editor.value.after, null, 2)}</pre></section></div></>;
}
