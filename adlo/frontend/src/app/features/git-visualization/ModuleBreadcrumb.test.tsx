import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModuleBreadcrumb } from './ModuleBreadcrumb';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: { gitVisBreadcrumbNav: 'breadcrumb', gitVisModuleRoot: 'Root' },
    locale: 'en',
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModuleBreadcrumb', () => {
  it('should show Root at top level', () => {
    const onNav = vi.fn();
    render(<ModuleBreadcrumb pathSegments={[]} onNavigate={onNav} />);
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('should show path segments', () => {
    render(<ModuleBreadcrumb pathSegments={['src', 'components']} onNavigate={vi.fn()} />);
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('components')).toBeInTheDocument();
  });

  it('should call onNavigate with -1 for Root click', () => {
    const onNav = vi.fn();
    render(<ModuleBreadcrumb pathSegments={['src']} onNavigate={onNav} />);
    fireEvent.click(screen.getByText('Root'));
    expect(onNav).toHaveBeenCalledWith(-1);
  });

  it('should call onNavigate with index for segment click', () => {
    const onNav = vi.fn();
    render(<ModuleBreadcrumb pathSegments={['src', 'components']} onNavigate={onNav} />);
    fireEvent.click(screen.getByText('src'));
    expect(onNav).toHaveBeenCalledWith(0);
  });

  it('should disable the last segment', () => {
    render(<ModuleBreadcrumb pathSegments={['src']} onNavigate={vi.fn()} />);
    expect(screen.getByText('src')).toBeDisabled();
  });
});
