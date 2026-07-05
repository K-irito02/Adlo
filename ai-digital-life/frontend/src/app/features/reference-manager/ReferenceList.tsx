import { useEffect } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function ReferenceList() {
  const { t } = useTCopy();
  const references = useAppStore((s) => s.references);
  const removeReference = useAppStore((s) => s.removeReference);
  const fetchReferences = useAppStore((s) => s.fetchReferences);
  const appInfo = useAppStore((s) => s.appInfo);
  const dataDir = appInfo?.currentWorkspace?.rootPath ?? '';

  useEffect(() => {
    fetchReferences(dataDir);
  }, [dataDir, fetchReferences]);

  if (references.length === 0) {
    return <p className="adl-empty-state">{t.referenceManagerEmpty}</p>;
  }

  return (
    <ul className="adl-reference-list">
      {references.map((ref) => (
        <li key={ref.name} className="adl-reference-list__item">
          <div className="adl-reference-list__info">
            <span className="adl-reference-list__name">{ref.name}</span>
            <span className={`adl-badge adl-badge--${ref.source}`}>
              {ref.source === 'local' ? t.referenceManagerLocal : t.referenceManagerGit}
            </span>
            <code className="adl-reference-list__path">{ref.path}</code>
            {ref.branch && <span className="adl-tag">{ref.branch}</span>}
          </div>
          <button
            className="adl-btn adl-btn--sm adl-btn--danger"
            onClick={() => removeReference(dataDir, ref.name)}
          >
            {t.referenceManagerRemove}
          </button>
        </li>
      ))}
    </ul>
  );
}
