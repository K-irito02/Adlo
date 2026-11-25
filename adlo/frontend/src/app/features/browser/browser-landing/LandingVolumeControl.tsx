import { IconVolume2, IconVolumeX } from '@icons';
import { VolumePercent } from './VolumePercent';
import { VerticalVolumeSlider } from './VerticalVolumeSlider';
import './LandingVolumeControl.css';

interface LandingVolumeControlProps {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  label: string;
  /** 百分比悬停提示（原生 title）。 */
  editHint: string;
}

/**
 * 新建标签页右下角的视频音量控件（胶囊包裹图标）：
 * - 常态是一枚圆形玻璃底（胶囊收拢到 32×32），只有音量图标；
 * - 悬停/聚焦后胶囊**向上生长**，把图标包在底部；上方出现百分比与竖向滑杆；
 * - 百分比悬停有背景反馈，双击可输入；全链路无边框线。
 */
export function LandingVolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  label,
  editHint,
}: LandingVolumeControlProps) {
  const mutedNow = muted || volume <= 0;
  return (
    <div className="adl-landing-volume">
      <div className="adl-landing-volume__capsule">
        <div className="adl-landing-volume__top">
          <VolumePercent
            volume={volume}
            label={label}
            editHint={editHint}
            onVolumeChange={onVolumeChange}
            className="adl-landing-volume__percent"
          />
        </div>
        <VerticalVolumeSlider
          value={volume}
          onVolumeChange={onVolumeChange}
          label={label}
          className="adl-landing-volume__slider"
        />
        <button
          type="button"
          className="adl-landing-volume__trigger"
          onClick={onToggleMute}
          aria-label={label}
          aria-pressed={!mutedNow}
          title={label}
        >
          {mutedNow ? <IconVolumeX size={16} decorative /> : <IconVolume2 size={16} decorative />}
        </button>
      </div>
    </div>
  );
}
