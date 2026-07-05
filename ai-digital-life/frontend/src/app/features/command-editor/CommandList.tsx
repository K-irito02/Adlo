import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { CommandConfig } from '@shared/ipc';

interface CommandListProps {
  onEdit: (cmd: CommandConfig) => void;
}

export function CommandList({ onEdit }: CommandListProps) {
  const { t } = useTCopy();
  const customCommands = useAppStore((s) => s.customCommands);
  const deleteCustomCommand = useAppStore((s) => s.deleteCustomCommand);

  if (customCommands.length === 0) {
    return <p className="adl-empty-state">{t.commandsEditorEmpty}</p>;
  }

  return (
    <ul className="adl-command-list">
      {customCommands.map((cmd) => (
        <li key={cmd.name} className="adl-command-list__item">
          <div className="adl-command-list__info">
            <strong>/{cmd.name}</strong>
            <span>{cmd.description}</span>
          </div>
          <div className="adl-command-list__actions">
            <button className="adl-btn adl-btn--sm" onClick={() => onEdit(cmd)}>
              {t.commandsEditorEdit}
            </button>
            <button
              className="adl-btn adl-btn--sm adl-btn--danger"
              onClick={() => deleteCustomCommand('', cmd.name)}
            >
              {t.commandsEditorDelete}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
