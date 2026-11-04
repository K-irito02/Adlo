import type { TerminalProfile } from '@stores/types';
import type { IconComponent } from '@icons';
import { IconProfilePowerShell, IconProfileBash, IconProfileCmd } from '@icons';

const profileIconMap: Record<TerminalProfile, IconComponent> = {
  powershell: IconProfilePowerShell,
  bash: IconProfileBash,
  cmd: IconProfileCmd,
};

interface TerminalProfileIconProps {
  profile: TerminalProfile;
  size?: 12 | 14 | 16 | 18 | 20 | 24;
  className?: string;
}

export function TerminalProfileIcon({ profile, size = 14, className }: TerminalProfileIconProps) {
  const Icon = profileIconMap[profile];
  return <Icon size={size} decorative className={className} />;
}
