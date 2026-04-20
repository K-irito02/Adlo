import React, { useCallback, useRef, useState } from "react";
import { renderIcon, type IconName } from "../../design-system/icons";

interface WelcomeStateProps {
  variant: "no-workspace" | "no-session";
  recentWorkspaces?: Array<{ path: string; name: string }>;
  onOpenWorkspace: () => void;
  onSelectRecentWorkspace: (path: string) => void;
  onSuggestion?: (text: string) => void;
}

const SUGGESTIONS = [
  "帮我理解这个项目的架构",
  "修复登录页面的 bug",
  "为这个模块添加单元测试",
  "优化数据库查询性能",
  "解释这段代码的作用"
];

const TIPS = [
  { icon: "folder-open" as IconName, text: "将文件夹拖入窗口即可打开" },
  { icon: "keyboard" as IconName, text: "按 Ctrl+O 快速打开工作空间" },
  { icon: "globe" as IconName, text: "支持从 GitHub 克隆远程仓库" }
];

function Icon({ name, size = "md" }: { name: IconName; size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" }) {
  return (
    <span dangerouslySetInnerHTML={{ __html: renderIcon(name, { size, decorative: true }).value }} />
  );
}

export function WelcomeState({
  variant,
  recentWorkspaces = [],
  onOpenWorkspace,
  onSelectRecentWorkspace,
  onSuggestion
}: WelcomeStateProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredWorkspaces = searchQuery.trim()
    ? recentWorkspaces.filter(
        (ws) =>
          ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ws.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recentWorkspaces;

  const handleSuggestionClick = useCallback(
    (text: string) => {
      onSuggestion?.(text);
    },
    [onSuggestion]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, path: string) => {
      if (e.key === "Enter") {
        onSelectRecentWorkspace(path);
      }
    },
    [onSelectRecentWorkspace]
  );

  if (variant === "no-session") {
    return (
      <div className="welcome-state">
        <div className="welcome-state__icon welcome-state__icon--session">
          <Icon name="message-square" size="2xl" />
        </div>
        <h2 className="welcome-state__title">开始新对话</h2>
        <p className="welcome-state__description">向 AI 助手提问或下达任务</p>
        <div className="welcome-state__suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="welcome-state__chip"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-state">
      <div className="welcome-state__icon">
        <Icon name="folder-open" size="2xl" />
      </div>
      <h2 className="welcome-state__title">打开工作空间</h2>
      <p className="welcome-state__description">选择一个项目目录开始</p>

      <button
        type="button"
        className="welcome-state__primary-btn"
        onClick={onOpenWorkspace}
      >
        <Icon name="folder-open" size="sm" />
        打开工作空间
      </button>

      {recentWorkspaces.length > 0 && (
        <>
          <p className="welcome-state__recent-label">最近打开的工作空间</p>
          <div className="welcome-state__search" role="search">
            <Icon name="search" size="sm" />
            <input
              ref={searchInputRef}
              type="text"
              className="welcome-state__search-input"
              placeholder="搜索工作空间..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="搜索最近工作空间"
            />
          </div>
          <ul className="welcome-state__list" role="listbox" aria-label="最近工作空间">
            {filteredWorkspaces.slice(0, 5).map((workspace) => (
              <li key={workspace.path}>
                <button
                  type="button"
                  className="welcome-state__item"
                  onClick={() => onSelectRecentWorkspace(workspace.path)}
                  onKeyDown={(e) => handleKeyDown(e, workspace.path)}
                  role="option"
                  aria-selected={false}
                >
                  <Icon name="folder-open" size="sm" />
                  <span className="welcome-state__item-name">{workspace.name}</span>
                  <span className="welcome-state__item-path">{workspace.path}</span>
                </button>
              </li>
            ))}
            {filteredWorkspaces.length === 0 && searchQuery.trim() && (
              <li className="welcome-state__empty">未找到匹配的工作空间</li>
            )}
          </ul>
        </>
      )}

      <div className="welcome-state__divider">
        <span>—— 或 ——</span>
      </div>

      <div className="welcome-state__tips">
        <div className="welcome-state__tips-header">
          <Icon name="lightbulb" size="sm" />
          <span>快速提示</span>
        </div>
        <ul className="welcome-state__tips-list">
          {TIPS.map((tip) => (
            <li key={tip.text} className="welcome-state__tip">
              <Icon name={tip.icon} size="xs" />
              <span>{tip.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default WelcomeState;
export type { WelcomeStateProps };
