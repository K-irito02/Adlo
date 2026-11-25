import { IconVolume2, IconVolumeX } from '@icons';
import { HorizontalVolumeSlider } from './HorizontalVolumeSlider';
import { VolumePercent } from './VolumePercent';
import './BackgroundVolumeControl.css';

interface BackgroundVolumeControlProps {
  /** 0–1，持久化的音量值。 */
  volume: number;
  /** 是否静音（自动播放必须静音起步，交互后解除）。 */
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  label: string;
  /** 百分比悬停提示（原生 title）。 */
  editHint: string;
  className?: string;
}

/**
 * 视频背景的音量控件：图标按钮切换静音，滑杆调整音量，百分比双击可输入。
 *
 * 拖动滑杆本身就是用户手势——调用方应同时解除静音，否则"调了音量却听不到"。
 */
export function BackgroundVolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  label,
  editHint,
  className,
}: BackgroundVolumeControlProps) {
  const mutedNow = muted || volume <= 0;
  return (
    <div className={`adl-bg-volume${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="adl-bg-volume__toggle"
        onClick={onToggleMute}
        aria-label={label}
        aria-pressed={!mutedNow}
        title={label}
      >
        {mutedNow ? <IconVolumeX size={14} decorative /> : <IconVolume2 size={14} decorative />}
      </button>
      <HorizontalVolumeSlider value={volume} onVolumeChange={onVolumeChange} label={label} />
      <VolumePercent
        volume={volume}
        label={label}
        editHint={editHint}
        onVolumeChange={onVolumeChange}
      />
    </div>
  );
}
