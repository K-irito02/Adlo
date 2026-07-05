import { useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { CommandConfig } from '@shared/ipc';

interface CommandEditorProps {
  onClose: () => void;
  editing?: CommandConfig;
}

export function CommandEditor({ onClose, editing }: CommandEditorProps) {
  const { t } = useTCopy();
  const addCustomCommand = useAppStore((s) => s.addCustomCommand);
  const updateCustomCommand = useAppStore((s) => s.updateCustomCommand);
  const customCommands = useAppStore((s) => s.customCommands);

  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [agent, setAgent] = useState(editing?.agent ?? 'build');
  const [model, setModel] = useState(editing?.model ?? '');
  const [template, setTemplate] = useState(editing?.template ?? '');
  const [subtask, setSubtask] = useState(editing?.subtask ?? false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t.commandsEditorNameRequired);
      return;
    }
    if (!template.trim()) {
      setError(t.commandsEditorTemplateRequired);
      return;
    }
    if (!editing && customCommands.some((c) => c.name === name)) {
      setError(t.commandsEditorNameExists);
      return;
    }

    const config: CommandConfig = {
      name: name.trim(),
      description,
      agent,
      model: model || null,
      template,
      subtask,
      hints: [],
    };

    if (editing) {
      await updateCustomCommand('', config.name, config);
    } else {
      await addCustomCommand('', config);
    }
    onClose();
  };

  return (
    <div className="adl-command-editor">
      <h3>{editing ? t.commandsEditorEdit : t.commandsEditorAdd}</h3>
      <div className="adl-form">
        <label>
          {t.commandsEditorName}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-command" />
        </label>
        <label>
          {t.commandsEditorDescription}
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          {t.commandsEditorAgent}
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="build">Build</option>
            <option value="plan">Plan</option>
          </select>
        </label>
        <label>
          {t.commandsEditorModel}
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="optional" />
        </label>
        <label>
          {t.commandsEditorTemplate}
          <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={4} />
        </label>
        <label className="adl-checkbox-label">
          <input type="checkbox" checked={subtask} onChange={(e) => setSubtask(e.target.checked)} />
          {t.commandsEditorSubtask}
        </label>
        <p className="adl-hint">{t.commandsEditorVariables}</p>
        {error && <p className="adl-error">{error}</p>}
        <div className="adl-form-actions">
          <button className="adl-btn adl-btn--primary" onClick={handleSave}>
            {t.commandsEditorSave}
          </button>
          <button className="adl-btn" onClick={onClose}>
            {t.commandsEditorCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
