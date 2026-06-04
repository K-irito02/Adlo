import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SlashCommand, SlashCommandId } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';

interface SlashCommandPopoverProps {
  t: CopyDict;
  open: boolean;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

function buildCommands(t: CopyDict): SlashCommand[] {
  return [
    { id: 'plan', label: '/plan', description: t.slashPlan as string },
    { id: 'edit', label: '/edit', description: t.slashEdit as string },
    { id: 'fix', label: '/fix', description: t.slashFix as string },
    { id: 'explain', label: '/explain', description: t.slashExplain as string },
    { id: 'test', label: '/test', description: t.slashTest as string },
    { id: 'review', label: '/review', description: t.slashReview as string },
  ];
}

export function SlashCommandPopover({ t, open, onSelect, onClose }: SlashCommandPopoverProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const commands = useMemo(() => buildCommands(t), [t]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => setActiveIndex(0));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
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

  if (!open) return null;

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
            className={`adl-slash-menu__item${idx === activeIndex ? ' is-active' : ''}`}
            onClick={() => {
              onSelect(cmd);
              onClose();
            }}
            onMouseEnter={() => setActiveIndex(idx)}
          >
            <strong className="adl-slash-menu__label">{cmd.label}</strong>
            <span className="adl-slash-menu__desc">{cmd.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
