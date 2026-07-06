import { describe, it, expect, beforeEach } from 'vitest';
import { commandRegistry } from './commandRegistry';
import type { CommandMeta } from './defaultCommands';

describe('commandRegistry', () => {
  beforeEach(() => {
    commandRegistry.reset();
  });

  it('initializes with default commands', () => {
    const all = commandRegistry.getAll();
    expect(all.length).toBeGreaterThan(0);
    expect(commandRegistry.getById('settings.open')).toBeDefined();
    expect(commandRegistry.getById('session.new')).toBeDefined();
    expect(commandRegistry.getById('workspace.new')).toBeDefined();
    expect(commandRegistry.getById('workspace.open')).toBeDefined();
  });

  it('getAll returns stable reference across calls (no infinite re-render)', () => {
    const a1 = commandRegistry.getAll();
    const a2 = commandRegistry.getAll();
    expect(a1).toBe(a2); // 同一引用，避免 useSyncExternalStore 无限重渲染
  });

  it('register adds new command and rebuilds cache', () => {
    const before = commandRegistry.getAll();
    const newCmd: CommandMeta = {
      id: 'test.cmd',
      titleKey: 'commandSettingsOpen',
      group: 'general',
    };
    commandRegistry.register([newCmd]);
    const after = commandRegistry.getAll();
    expect(after.length).toBe(before.length + 1);
    expect(commandRegistry.getById('test.cmd')).toBe(newCmd);
    expect(after).not.toBe(before); // register 后引用应改变
  });

  it('register overwrites existing command by id', () => {
    const overridden: CommandMeta = {
      id: 'settings.open',
      titleKey: 'commandSettingsOpen',
      group: 'general',
      defaultKeybind: 'mod+s',
    };
    commandRegistry.register([overridden]);
    expect(commandRegistry.getById('settings.open')?.defaultKeybind).toBe('mod+s');
  });

  it('supports subscribe and notifies on register', () => {
    let calledCount = 0;
    const unsub = commandRegistry.subscribe(() => {
      calledCount += 1;
    });
    commandRegistry.register([
      { id: 'test.sub', titleKey: 'commandSettingsOpen', group: 'general' },
    ]);
    expect(calledCount).toBeGreaterThan(0);
    unsub();
  });

  it('unsubscribe stops notifications', () => {
    let calledCount = 0;
    const unsub = commandRegistry.subscribe(() => {
      calledCount += 1;
    });
    unsub();
    commandRegistry.register([
      { id: 'test.unsub', titleKey: 'commandSettingsOpen', group: 'general' },
    ]);
    expect(calledCount).toBe(0);
  });

  it('reset restores default commands and clears custom registrations', () => {
    commandRegistry.register([
      { id: 'custom.cmd', titleKey: 'commandSettingsOpen', group: 'general' },
    ]);
    expect(commandRegistry.getById('custom.cmd')).toBeDefined();
    commandRegistry.reset();
    expect(commandRegistry.getById('custom.cmd')).toBeUndefined();
    expect(commandRegistry.getById('settings.open')).toBeDefined();
  });

  it('getById returns undefined for unknown id', () => {
    expect(commandRegistry.getById('does.not.exist')).toBeUndefined();
  });
});
