import React from 'react';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../shared/i18n';
import { Badge, Icon } from '../../../shared/ui';

export function WorkspaceCard({ href, title, description, action, icon: Component, planned = false }: {
  href: string; title: string; description: string; action: string; icon: LucideIcon; planned?: boolean;
}) {
  const t = useTranslation();
  return <a className="home-card" href={href}>
    <span className="home-card-top"><span className="home-card-icon"><Icon component={Component} size="large" /></span>{planned && <Badge>{t('planned')}</Badge>}</span>
    <h2>{t(title)}</h2><p>{t(description)}</p>
    <span className="home-card-action">{t(action)}<Icon component={ArrowRight} /></span>
  </a>;
}
