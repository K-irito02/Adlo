import React, { useState } from 'react';
import type { CommandOutputConversationBlock } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { IconChevronDown, IconChevronRight, IconTerminal } from '../../icons';

interface CommandOutputBlockProps {
  t: CopyDict;
  block: CommandOutputConversationBlock;
}

const MAX_COLLAPSED_LINES = 5;

function exitCodeClass(code: number | null): string {
  if (code === null) {
    return 'adl-chip--muted';
  }
  return code === 0 ? 'adl-chip--success' : 'adl-chip--danger';
}

export function CommandOutputBlock({ t, block }: CommandOutputBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const cmdLine = `${block.command} ${block.args.join(' ')}`.trim();
  const stdoutLines = block.stdout.split('\n');
  const stderrLines = block.stderr.split('\n').filter(Boolean);
  const needsTruncation = stdoutLines.length > MAX_COLLAPSED_LINES;
  const displayStdout = expanded
    ? block.stdout
    : stdoutLines.slice(0, MAX_COLLAPSED_LINES).join('\n');

  return (
    <div className="adl-command-block">
      <header className="adl-command-block__header">
        <IconTerminal size={14} decorative />
        <code className="adl-command-block__cmd">
          {t.commandBlockPrefix} {cmdLine}
        </code>
        <span className={`adl-chip adl-chip--xs ${exitCodeClass(block.exitCode)}`}>
          {t.terminalExitCode}: {block.exitCode ?? '—'}
        </span>
      </header>

      {displayStdout && <pre className="adl-command-block__stdout">{displayStdout}</pre>}

      {stderrLines.length > 0 && <pre className="adl-command-block__stderr">{block.stderr}</pre>}

      {(needsTruncation || block.truncated) && (
        <button
          type="button"
          className="adl-btn adl-btn--ghost adl-btn--xs adl-command-block__expand"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <IconChevronDown size={12} decorative />
          ) : (
            <IconChevronRight size={12} decorative />
          )}
          {expanded ? t.terminalCollapseOutput : t.terminalViewFullOutput}
        </button>
      )}
    </div>
  );
}
