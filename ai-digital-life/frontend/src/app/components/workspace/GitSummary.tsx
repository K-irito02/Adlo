import type { CopyDict } from '../../i18n';
import { IconGitBranch } from '../../icons';

interface GitSummaryProps {
  t: CopyDict;
  branch?: string;
  staged?: number;
  unstaged?: number;
  untracked?: number;
  conflicts?: number;
}

export function GitSummary({
  t,
  branch,
  staged = 0,
  unstaged = 0,
  untracked = 0,
  conflicts = 0,
}: GitSummaryProps) {
  const total = staged + unstaged + untracked + conflicts;

  return (
    <div className="adl-git-summary">
      <IconGitBranch size={12} decorative />
      <span className="adl-git-summary__branch">
        {t.gitSummaryBranch}: {branch ?? '—'}
      </span>
      <span className="adl-git-summary__sep" aria-hidden="true" />
      <span className="adl-git-summary__changes">
        {t.gitSummaryChanges}: {total}
      </span>
      {staged > 0 && <span className="adl-chip adl-chip--xs adl-chip--success">+{staged}</span>}
      {unstaged > 0 && <span className="adl-chip adl-chip--xs adl-chip--warning">~{unstaged}</span>}
      {untracked > 0 && <span className="adl-chip adl-chip--xs adl-chip--muted">?{untracked}</span>}
      {conflicts > 0 && (
        <span className="adl-chip adl-chip--xs adl-chip--danger">!{conflicts}</span>
      )}
    </div>
  );
}
