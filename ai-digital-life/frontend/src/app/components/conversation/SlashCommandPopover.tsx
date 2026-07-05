import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CopyDict } from '../../i18n';
import type { CommandConfig } from '@shared/ipc';

export interface MergedCommand {
  id: string;
  label: string;
  description: string;
  isCustom: boolean;
  config?: CommandConfig;
}

interface SlashCommandPopoverProps {
  t: CopyDict;
  open: boolean;
  onSelect: (command: MergedCommand) => void;
  onClose: () => void;
  customCommands?: CommandConfig[];
}

function buildBuiltinCommands(t: CopyDict): MergedCommand[] {
  return [
    { id: 'plan', label: '/plan', description: t.slashPlan as string, isCustom: false },
    { id: 'edit', label: '/edit', description: t.slashEdit as string, isCustom: false },
    { id: 'fix', label: '/fix', description: t.slashFix as string, isCustom: false },
    { id: 'explain', label: '/explain', description: t.slashExplain as string, isCustom: false },
    { id: 'test', label: '/test', description: t.slashTest as string, isCustom: false },
    { id: 'review', label: '/review', description: t.slashReview as string, isCustom: false },
  ];
}

function buildCustomCommands(commands: CommandConfig[]): MergedCommand[] {
  return commands.map((c) => ({
    id: c.name,
    label: `/${c.name}`,
    description: c.description || 'Custom command',
    isCustom: true,
    config: c,
  }));
}

export function SlashCommandPopover({ t, open, onSelect, onClose, customCommands = [] }: SlashCommandPopoverProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => {
    const builtin = buildBuiltinCommands(t);
    const custom = buildCustomCommands(customCommands);
    // show built-in first, then custom (separated by divider in UI)
    return [...builtin, ...custom];
  }, [t, customCommands]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setActiveIndex(0));
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, commands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && commands[activeIndex]) {
        e.preventDefault();
        onSelect(commands[activeIndex]);
        onClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, commands, onClose, onSelect]
  );

  if (!open) {
    return null;
  }

  const builtinCount = 6; // number of built-in commands
  return (
    <div
      ref={ref}
      className="adl-slash-menu"
      role="listbox"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <ul className="adl-slash-menu__list">
        {commands.map((cmd, idx) => (
          <li
            key={cmd.id}
            role="option"
            aria-selected={idx === activeIndex}
            className={`adl-slash-menu__item${idx === activeIndex ? ' is-active' : ''}${cmd.isCustom ? ' is-custom' : ''}`}
            onClick={() => {
              onSelect(cmd);
              onClose();
            }}
            onMouseEnter={() => setActiveIndex(idx)}
          >
            <strong className="adl-slash-menu__label">{cmd.label}</strong>
            <span className="adl-slash-menu__desc">{cmd.description}</span>
            {idx === builtinCount && customCommands.length > 0 && (
              <span className="adl-slash-menu__divider" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
