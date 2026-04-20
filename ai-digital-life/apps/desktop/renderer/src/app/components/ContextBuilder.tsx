import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderIcon, type IconName } from "../../design-system/icons";

interface ContextBuilderProps {
  onAddContext: (type: string, value?: string) => void;
  activeContexts?: Array<{ type: string; label: string; removable: boolean }>;
}

interface ContextItem {
  type: string;
  label: string;
  icon: IconName;
  section: "mode" | "model" | "reference";
}

const CONTEXT_ITEMS: ContextItem[] = [
  { type: "plan", label: "规划模式", icon: "clipboard-list", section: "mode" },
  { type: "debug", label: "调试模式", icon: "bug", section: "mode" },
  { type: "ask", label: "问答模式", icon: "message-circle-question", section: "mode" },
  { type: "model", label: "模型选择", icon: "cpu", section: "model" },
  { type: "skills", label: "技能库", icon: "sparkles", section: "model" },
  { type: "mcp", label: "MCP 服务", icon: "plug", section: "model" },
  { type: "@file", label: "引用文件", icon: "file-text", section: "reference" },
  { type: "@doc", label: "引用文档", icon: "book-open", section: "reference" },
  { type: "@url", label: "引用链接", icon: "link", section: "reference" },
  { type: "@codebase", label: "代码库上下文", icon: "database", section: "reference" }
];

function Icon({ name, size = "md" }: { name: IconName; size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" }) {
  return (
    <span dangerouslySetInnerHTML={{ __html: renderIcon(name, { size, decorative: true }).value }} />
  );
}

export function ContextBuilder({ onAddContext, activeContexts = [] }: ContextBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
        setFocusedIndex(-1);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearchQuery("");
        setFocusedIndex(-1);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return CONTEXT_ITEMS;
    const q = searchQuery.toLowerCase();
    return CONTEXT_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, ContextItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    }
    return groups;
  }, [filteredItems]);

  const SECTION_LABELS: Record<string, string> = {
    mode: "模式",
    model: "模型与技能",
    reference: "上下文引用"
  };

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setSearchQuery("");
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  const handleSelectItem = useCallback(
    (item: ContextItem) => {
      onAddContext(item.type);
      setIsOpen(false);
      setSearchQuery("");
      setFocusedIndex(-1);
      buttonRef.current?.focus();
    },
    [onAddContext]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const flatItems = filteredItems;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < flatItems.length) {
            handleSelectItem(flatItems[focusedIndex]);
          }
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(flatItems.length - 1);
          break;
      }
    },
    [filteredItems, focusedIndex, handleSelectItem]
  );

  useEffect(() => {
    if (focusedIndex >= 0) {
      itemRefs.current.get(focusedIndex)?.focus();
    }
  }, [focusedIndex]);

  return (
    <div className="context-builder">
      <button
        ref={buttonRef}
        type="button"
        className={`context-builder__trigger${isOpen ? " context-builder__trigger--open" : ""}`}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title="添加上下文"
      >
        <Icon name="plus" size="sm" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="context-builder__popover"
          role="listbox"
          aria-label="添加上下文选项"
          onKeyDown={handleKeyDown}
        >
          <div className="context-builder__search">
            <Icon name="search" size="xs" />
            <input
              ref={searchInputRef}
              type="text"
              className="context-builder__search-input"
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setFocusedIndex(0);
              }}
              aria-label="搜索上下文选项"
            />
          </div>

          <div className="context-builder__items">
            {Object.entries(groupedItems).map(([section, items]) => (
              <div key={section} className="context-builder__group">
                <span className="context-builder__group-label">{SECTION_LABELS[section]}</span>
                {items.map((item, idx) => (
                  <button
                    key={item.type}
                    ref={(el) => {
                      if (el) {
                        const globalIdx = filteredItems.indexOf(item);
                        itemRefs.current.set(globalIdx, el);
                      }
                    }}
                    type="button"
                    className="context-builder__item"
                    onClick={() => handleSelectItem(item)}
                    role="option"
                    tabIndex={-1}
                    data-context-type={item.type}
                  >
                    <span className="context-builder__item-icon">
                      <Icon name={item.icon} size="sm" />
                    </span>
                    <span className="context-builder__item-label">{item.label}</span>
                    <span className="context-builder__item-type">{item.type}</span>
                  </button>
                ))}
              </div>
            ))}

            {filteredItems.length === 0 && (
              <p className="context-builder__empty">未找到匹配的选项</p>
            )}
          </div>
        </div>
      )}

      {activeContexts.length > 0 && !isOpen && (
        <div className="context-builder__active-list">
          {activeContexts.map((ctx) => (
            <span key={ctx.type} className="context-builder__chip">
              {ctx.label}
              {ctx.removable && (
                <button
                  type="button"
                  className="context-builder__chip-remove"
                  onClick={() => onAddContext(ctx.type)}
                  aria-label={`移除 ${ctx.label}`}
                >
                  <Icon name="close" size="xs" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ContextBuilder;
export type { ContextBuilderProps };
