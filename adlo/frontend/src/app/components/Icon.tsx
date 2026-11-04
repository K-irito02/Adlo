import { renderIcon, type IconName, type IconSize } from '../../design-system/icons';

interface IconProps {
  name: IconName;
  size?: IconSize;
  className?: string;
}

export function Icon({ name, size = 'md', className }: IconProps) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderIcon(name, { size, decorative: true }).value }}
    />
  );
}
