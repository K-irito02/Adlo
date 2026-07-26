import React from 'react';
import { cn } from '@/lib/utils';
import { useTCopy } from '@i18n/useTCopy';
import '@/styles/components/module-breadcrumb.css';

interface ModuleBreadcrumbProps {
  pathSegments: string[];
  onNavigate: (level: number) => void;
}

export const ModuleBreadcrumb = React.memo(function ModuleBreadcrumb({
  pathSegments,
  onNavigate,
}: ModuleBreadcrumbProps) {
  const { t } = useTCopy();

  return (
    <nav className="adl-module-breadcrumb" aria-label={t.gitVisBreadcrumbNav}>
      <button
        className={cn(
          'adl-module-breadcrumb__item',
          pathSegments.length === 0 && 'adl-module-breadcrumb__item--active',
        )}
        onClick={() => onNavigate(-1)}
        disabled={pathSegments.length === 0}
      >
        {t.gitVisModuleRoot}
      </button>
      {pathSegments.map((seg, i) => (
        <React.Fragment key={i}>
          <span className="adl-module-breadcrumb__sep" aria-hidden="true">
            &gt;
          </span>
          <button
            className={cn(
              'adl-module-breadcrumb__item',
              i === pathSegments.length - 1 && 'adl-module-breadcrumb__item--active',
            )}
            onClick={() => onNavigate(i)}
            disabled={i === pathSegments.length - 1}
          >
            {seg}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
});
