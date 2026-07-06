import { useTCopy } from '../../i18n/useTCopy';
import { formatKeybind } from '../../../shared/keybinds';

interface KeybindControlProps {
  keybind: string | undefined;
  isRecording: boolean;
  onClick: () => void;
}

export function KeybindControl({ keybind, isRecording, onClick }: KeybindControlProps) {
  const { t } = useTCopy();

  const display = isRecording
    ? t.settingsShortcutsPressKeys
    : keybind && keybind !== 'none'
      ? formatKeybind(keybind)
      : t.settingsShortcutsUnassigned;

  return (
    <button
      type="button"
      className={`adl-settings-keybind${isRecording ? ' is-recording' : ''}`}
      onClick={onClick}
      aria-label={display}
    >
      {display}
    </button>
  );
}
