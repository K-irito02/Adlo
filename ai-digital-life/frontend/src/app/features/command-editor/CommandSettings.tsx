import { useState } from 'react';
import { useTCopy } from '../../i18n/useTCopy';
import type { CommandConfig } from '@shared/ipc';
import { CommandList } from './CommandList';
import { CommandEditor } from './CommandEditor';

export function CommandSettings() {
  const { t } = useTCopy();
  const [editing, setEditing] = useState<CommandConfig | undefined>(undefined);
  const [showEditor, setShowEditor] = useState(false);

  const handleEdit = (cmd: CommandConfig) => {
    setEditing(cmd);
    setShowEditor(true);
  };

  const handleClose = () => {
    setShowEditor(false);
    setEditing(undefined);
  };

  return (
    <div className="adl-settings-section">
      <div className="adl-settings-section__header">
        <h3>{t.commandsEditorTitle}</h3>
        <button
          type="button"
          className="adl-btn adl-btn--sm adl-btn--primary"
          onClick={() => setShowEditor(true)}
        >
          {t.commandsEditorAdd}
        </button>
      </div>
      <CommandList onEdit={handleEdit} />
      {showEditor && <CommandEditor onClose={handleClose} editing={editing} />}
    </div>
  );
}
