import React, { useState } from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { motion } from 'motion/react';

interface BrowserNavModeSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  leftLabel: string;
  rightLabel: string;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

export function BrowserNavModeSwitch({
  checked,
  onCheckedChange,
  leftLabel,
  rightLabel,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onClick,
}: BrowserNavModeSwitchProps) {
  const [isTapped, setIsTapped] = useState(false);

  return (
    <SwitchPrimitives.Root checked={checked} onCheckedChange={onCheckedChange} asChild>
      <motion.button
        className="adl-browser-nav-mode-switch"
        style={{
          justifyContent: checked ? 'flex-end' : 'flex-start',
        }}
        whileTap="tap"
        initial={false}
        onTapStart={() => setIsTapped(true)}
        onTapCancel={() => setIsTapped(false)}
        onTap={() => setIsTapped(false)}
        aria-label={checked ? rightLabel : leftLabel}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
      >
        <SwitchPrimitives.Thumb asChild>
          <motion.div
            whileTap="tap"
            className="adl-browser-nav-mode-switch__thumb"
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            animate={
              isTapped
                ? { width: 16, transition: { duration: 0.1 } }
                : { width: 14, transition: { duration: 0.1 } }
            }
          />
        </SwitchPrimitives.Thumb>
      </motion.button>
    </SwitchPrimitives.Root>
  );
}
