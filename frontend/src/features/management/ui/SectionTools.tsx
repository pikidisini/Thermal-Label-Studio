import React from 'react';
import { Input } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';

export function SectionTools({ management, children }: Readonly<{ management: ManagementController; children?: React.ReactNode }>) {
  const t = useTranslation(); const { search, setSearch } = management;
  return <div className="management-tools"><Input aria-label={t('Search')} placeholder={t('Search')} value={search} onChange={e => setSearch(e.target.value)} />{children}</div>;
}
