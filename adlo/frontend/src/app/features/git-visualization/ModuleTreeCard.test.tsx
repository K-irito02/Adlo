import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModuleTreeCard } from './ModuleTreeCard';
import { REVEAL_SCROLLBAR_SELECTOR } from '../../components/RevealScrollbar';
import type { ModuleTreeNode } from './moduleTreeUtils';

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('.adl-module-tree-card').forEach((el) => el.remove());
  delete (window as unknown as Record<string, unknown>).innerWidth;
  delete (window as unknown as Record<string, unknown>).innerHeight;
  vi.clearAllMocks();
});

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisModuleCancel: 'Cancel',
      gitVisModuleConfirm: 'Confirm',
      gitVisModuleExpandAll: 'Expand All',
      gitVisModuleCollapseAll: 'Collapse All',
      gitVisModuleClose: 'Close',
    },
    locale: 'en',
  }),
}));

const mockSubtree: ModuleTreeNode[] = [
  {
    name: 'src',
    path: 'src',
    isDir: true,
    children: [
      {
        name: 'components',
        path: 'src/components',
        isDir: true,
        children: [{ name: 'bar.tsx', path: 'src/components/bar.tsx', isDir: false, children: [] }],
      },
      { name: 'utils', path: 'src/utils', isDir: true, children: [] },
    ],
  },
  {
    name: 'docs',
    path: 'docs',
    isDir: true,
    children: [{ name: 'readme.md', path: 'docs/readme.md', isDir: false, children: [] }],
  },
];

describe('ModuleTreeCard', () => {
  let hasCapture = false;
  const releaseSpy = vi.fn();

  beforeAll(() => {
    class MockPointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    Object.defineProperty(window, 'PointerEvent', {
      value: MockPointerEvent,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(Element.prototype, 'hasPointerCapture', {
      value: vi.fn(() => hasCapture),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      value: releaseSpy,
      writable: true,
      configurable: true,
    });
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
    globalThis.cancelAnimationFrame = () => {};
  });

  afterEach(() => {
    hasCapture = false;
  });

  afterAll(() => {
    delete (Element.prototype as unknown as Record<string, unknown>).setPointerCapture;
    delete (Element.prototype as unknown as Record<string, unknown>).hasPointerCapture;
    delete (Element.prototype as unknown as Record<string, unknown>).releasePointerCapture;
    delete (window as unknown as Record<string, unknown>).PointerEvent;
  });

  it('should render tree nodes', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('docs')).toBeInTheDocument();
  });

  it('should expand directory on row label click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('utils')).toBeInTheDocument();
  });

  it('should select a row on click and deselect on second click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    const treeItem = screen.getByRole('treeitem', { name: /src/ });
    expect(treeItem.className).toContain('is-selected');

    fireEvent.click(screen.getByText('src'));
    expect(treeItem.className).not.toContain('is-selected');
  });

  it('should call onSelect with selected path on confirm', () => {
    const onSelect = vi.fn();
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSelect).toHaveBeenCalledWith('src');
  });

  it('should call onClose on Cancel', () => {
    const onClose = vi.fn();
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('should expand all directories on expand toggle click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const toggleBtns = screen.getAllByRole('button');
    const expandToggle = toggleBtns[0];
    fireEvent.click(expandToggle);
    expect(screen.getByText('bar.tsx')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument();
  });

  it('should collapse all on second expand toggle click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const toggleBtns = screen.getAllByRole('button');
    const expandToggle = toggleBtns[0];
    fireEvent.click(expandToggle);
    expect(screen.getByText('bar.tsx')).toBeInTheDocument();
    fireEvent.click(expandToggle);
    expect(screen.queryByText('components')).not.toBeInTheDocument();
  });

  it('should deselect when clicking outside tree area', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    const treeItem = screen.getByRole('treeitem', { name: /src/ });
    expect(treeItem.className).toContain('is-selected');

    const treeContainer = document.querySelector('.adl-module-tree-card__tree')!;
    fireEvent.click(treeContainer);
    expect(treeItem.className).not.toContain('is-selected');
  });

  it('should render the right-clicked directory name with full path tooltip', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        dir={{ name: 'components', path: 'src/components' }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dirLabel = screen.getByTitle('src/components');
    expect(dirLabel).toBeInTheDocument();
    expect(dirLabel.textContent).toContain('components');
  });

  it('should clamp the card into the viewport bounds with padding', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 900, y: 700 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    expect(card.style.left).toBe('432px');
    expect(card.style.top).toBe('192px');
  });

  it('should clamp the card away from negative off-screen positions', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: -50, y: -20 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    expect(card.style.left).toBe('8px');
    expect(card.style.top).toBe('8px');
  });

  it('should move the card when dragging the header', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    const header = card.querySelector('.adl-module-tree-card__header') as HTMLElement;
    fireEvent.pointerDown(header, { clientX: 50, clientY: 60, pointerId: 1, button: 0 });
    expect(header.className).toContain('is-dragging');
    fireEvent.pointerMove(header, { clientX: 120, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(header, { pointerId: 1 });

    expect(card.style.left).toBe('170px');
    expect(card.style.top).toBe('170px');
  });

  it('should not start dragging when pressing a header button', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    const expandBtn = card.querySelector('.adl-module-tree-card__icon-btn') as HTMLElement;
    fireEvent.pointerDown(expandBtn, { clientX: 50, clientY: 60, pointerId: 1, button: 0 });
    fireEvent.pointerMove(expandBtn, { clientX: 120, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(expandBtn, { pointerId: 1 });

    expect(card.style.left).toBe('100px');
    expect(card.style.top).toBe('100px');
  });

  it('should reset drag state when a pointer cancel interrupts the drag', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    const header = card.querySelector('.adl-module-tree-card__header') as HTMLElement;
    fireEvent.pointerDown(header, { clientX: 50, clientY: 60, pointerId: 1, button: 0 });
    expect(header.className).toContain('is-dragging');
    fireEvent.pointerCancel(header, { pointerId: 1 });
    expect(header.className).not.toContain('is-dragging');
    fireEvent.pointerMove(header, { clientX: 120, clientY: 130, pointerId: 1 });
    expect(card.style.left).toBe('100px');
    expect(card.style.top).toBe('100px');
  });

  it('should reset drag state when pointer capture is lost unexpectedly', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    const header = card.querySelector('.adl-module-tree-card__header') as HTMLElement;
    fireEvent.pointerDown(header, { clientX: 50, clientY: 60, pointerId: 1, button: 0 });
    expect(header.className).toContain('is-dragging');
    fireEvent.lostPointerCapture(header, { pointerId: 1 });
    expect(header.className).not.toContain('is-dragging');
    fireEvent.pointerMove(header, { clientX: 120, clientY: 130, pointerId: 1 });
    expect(card.style.left).toBe('100px');
    expect(card.style.top).toBe('100px');
  });

  it('should release pointer capture on pointer up when the header owns it', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    const header = card.querySelector('.adl-module-tree-card__header') as HTMLElement;
    fireEvent.pointerDown(header, { clientX: 50, clientY: 60, pointerId: 1, button: 0 });
    hasCapture = true;
    fireEvent.pointerUp(header, { pointerId: 1 });
    expect(releaseSpy).toHaveBeenCalledWith(1);
    expect(header.className).not.toContain('is-dragging');
  });

  it('should clamp the card to the viewport edge while dragging', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    const header = card.querySelector('.adl-module-tree-card__header') as HTMLElement;
    fireEvent.pointerDown(header, { clientX: 50, clientY: 60, pointerId: 1, button: 0 });
    fireEvent.pointerMove(header, { clientX: 2000, clientY: 2000, pointerId: 1 });
    fireEvent.pointerUp(header, { pointerId: 1 });

    expect(card.style.left).toBe('432px');
    expect(card.style.top).toBe('192px');
  });

  it('re-clamps to a new position prop when the card is opened elsewhere', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360,
      height: 400,
      left: 0,
      top: 0,
      right: 360,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const { rerender } = render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const card = document.querySelector('.adl-module-tree-card') as HTMLElement;
    expect(card.style.left).toBe('100px');

    // Right-click another directory while the card stays open: the parent
    // supplies a new position and the card must move to it (clamped).
    rerender(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 700, y: 500 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    rectSpy.mockRestore();

    expect(card.style.left).toBe('432px');
    expect(card.style.top).toBe('192px');
  });

  it('should render the overlay scrollbar structure (host > scroll container)', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const host = document.querySelector('.adl-module-tree-card__tree.adl-reveal-scrollbar-host');
    expect(host).not.toBeNull();
    expect(host!.querySelector('.adl-module-tree-card__scroll.adl-reveal-scroll')).not.toBeNull();
  });

  it('should keep selection when clicking the custom scrollbar thumb', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    const treeItem = screen.getByRole('treeitem', { name: /src/ });
    expect(treeItem.className).toContain('is-selected');

    // JSDOM has no layout: fake a scrollable container, then trigger
    // re-measure via scroll so the overlay thumb renders.
    const scroll = document.querySelector('.adl-module-tree-card__scroll') as HTMLElement;
    Object.defineProperty(scroll, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 100, configurable: true });
    fireEvent.scroll(scroll);

    const thumb = document.querySelector('.adl-reveal-scrollbar__thumb') as HTMLElement;
    expect(thumb).not.toBeNull();
    // Contract between RevealScrollbar and the click exemption: the thumb must
    // sit under an explicit data marker (decoupled from the CSS class name).
    expect(thumb.closest(REVEAL_SCROLLBAR_SELECTOR)).not.toBeNull();
    fireEvent.click(thumb);
    expect(treeItem.className).toContain('is-selected');

    // Negative control: the exemption is scoped, not blanket — clicking the
    // scroll background (non-row area) still clears the selection.
    fireEvent.click(scroll);
    expect(treeItem.className).not.toContain('is-selected');
  });
});
