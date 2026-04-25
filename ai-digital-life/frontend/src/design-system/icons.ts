/**
 * SVG icon registry.
 *
 * Rules (mirrors design-system/icons spec):
 *   - SVG only, never emoji.
 *   - All icons share viewBox 0 0 24 24 and use `currentColor`.
 *   - Stroke width 2, line caps round.
 *   - Each icon is a small string the renderer can interpolate via `raw()`.
 *
 * Add new icons by extending the `ICON_PATHS` table. Tree-shake friendly:
 * unused icons remain string literals on the registry, but the
 * `renderIcon()` helper only emits the requested one.
 */

import { raw, type RawHtml } from "./html";

export type IconName =
  | "home"
  | "folder"
  | "search"
  | "tasks"
  | "logs"
  | "settings"
  | "bell"
  | "info"
  | "check"
  | "close"
  | "alert-triangle"
  | "alert-octagon"
  | "shield"
  | "refresh"
  | "play"
  | "pause"
  | "git-branch"
  | "moon"
  | "sun"
  | "monitor"
  | "palette"
  | "keyboard"
  | "external-link"
  | "chevron-right"
  | "chevron-down"
  | "chevron-left"
  | "chevron-up"
  | "minus"
  | "square"
  | "x-circle"
  | "check-circle"
  | "plus"
  | "folder-plus"
  | "file-text"
  | "file-plus"
  | "folder-open"
  | "copy"
  | "download"
  | "upload"
  | "archive"
  | "trash-2"
  | "pencil"
  | "send"
  | "arrow-up"
  | "arrow-right"
  | "sparkles"
  | "plug"
  | "server"
  | "globe"
  | "message-square"
  | "image-plus"
  | "cpu"
  | "clipboard-list"
  | "bug"
  | "circle-dot"
  | "book-open"
  | "link"
  | "database"
  | "brain"
  | "pen-tool"
  | "loader-2"
  | "zap"
  | "eye"
  | "terminal"
  | "git-fork"
  | "files"
  | "layout-grid"
  | "columns"
  | "panel-left"
  | "panel-left-close"
  | "panel-right"
  | "panel-right-close"
  | "more-vertical"
  | "more-horizontal"
  | "pin"
  | "pin-off"
  | "check-check"
  | "mail"
  | "hash"
  | "text-cursor-input"
  | "mic"
  | "mic-off"
  | "stop-circle"
  | "clock"
  | "coins"
  | "lightbulb"
  | "message-circle-question"
  | "history"
  | "command"
  | "log-out"
  | "scale-3d"
  | "move"
  | "maximize-2"
  | "minimize-2"
  | "rotate-ccw"
  | "code"
  | "diff"
  | "eye-off"
  | "bookmark"
  | "at-sign"
  | "quote";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const ICON_PATHS: Record<IconName, string> = {
  home: '<path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" />',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />',
  search: '<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />',
  tasks:
    '<path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="m4 6 1.5 1.5L8 5" /><path d="m4 12 1.5 1.5L8 11" /><path d="m4 18 1.5 1.5L8 17" />',
  logs:
    '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8" /><path d="M8 17h6" />',
  settings:
    '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />',
  info: '<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
  check: '<path d="m5 12 5 5L20 7" />',
  close: '<path d="M6 6 18 18" /><path d="M18 6 6 18" />',
  "alert-triangle":
    '<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" />',
  "alert-octagon":
    '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><path d="M12 8v4" /><path d="M12 16h.01" />',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />',
  play: '<polygon points="5 3 19 12 5 21 5 3" />',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />',
  "git-branch":
    '<line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />',
  sun:
    '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.93 19.07 1.41-1.41" /><path d="m17.66 6.34 1.41-1.41" />',
  monitor:
    '<rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" />',
  palette:
    '<circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2a10 10 0 0 0 0 20 4 4 0 0 0 4-4v-1.5a2.5 2.5 0 0 1 2.5-2.5H21a1 1 0 0 0 1-1A10 10 0 0 0 12 2Z" />',
  keyboard:
    '<rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01" /><path d="M10 10h.01" /><path d="M14 10h.01" /><path d="M18 10h.01" /><path d="M6 14h.01" /><path d="M18 14h.01" /><path d="M8 14h8" />',
  "external-link":
    '<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />',
  "chevron-right": '<path d="m9 18 6-6-6-6" />',
  "chevron-down": '<path d="m6 9 6 6 6-6" />',
  "chevron-left": '<path d="m15 18-6-6 6-6" />',
  "chevron-up": '<path d="m18 15-6-6 6-6" />',
  minus: '<path d="M5 12h14" />',
  square: '<rect x="3" y="3" width="18" height="18" rx="2" />',
  "x-circle": '<circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />',
  "check-circle": '<circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />',
  plus: '<path d="M5 12h14" /><path d="M12 5v14" />',
  "folder-plus":
    '<path d="M12 10v6" /><path d="M10 12h4" /><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />',
  "file-text":
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" />',
  "file-plus": '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><path d="M12 13v6" /><path d="M9 16h6" />',
  "folder-open": '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />',
  "trash-2": '<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />',
  send: '<path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />',
  "arrow-up": '<line x1="12" x2="12" y1="19" y2="5" /><polyline points="5 12 12 5 19 12" />',
  "arrow-right": '<line x1="5" x2="19" y1="12" y2="12" /><polyline points="12 5 19 12 12 19" />',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />',
  plug: '<path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8" /><path d="M18 2v2" /><path d="M6 2v2" />',
  server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />',
  globe: '<circle cx="12" cy="12" r="10" /><line x1="2" x2="22" y1="12" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />',
  "message-square": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />',
  "image-plus": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" x2="9.01" y1="1" y2="1" /><line x1="15" x2="15.01" y1="1" y2="1" /><line x1="9" x2="9.01" y1="23" y2="23" /><line x1="15" x2="15.01" y1="23" y2="23" /><line x1="20" x2="20" y1="9" y2="9.01" /><line x1="20" x2="20" y1="14" y2="14.01" /><line x1="4" x2="4.01" y1="9" y2="9.01" /><line x1="4" x2="4.01" y1="14" y2="14.01" />',
  "clipboard-list": '<rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />',
  bug: '<path d="m8 2 1.88 1.88" /><path d="M14.12 3.88 16 2" /><path d="M9 7.13A4 4 0 0 1 12 7a4 4 0 0 1 3 1.27" /><path d="M11 7H9a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" /><path d="M12 7V3" /><path d="M12 7H9" /><path d="M12 7h3" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" />',
  "circle-dot": '<circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />',
  "book-open": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />',
  brain: '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 2.5 2.5 0 0 1-1.15-4.72 2.5 2.5 0 0 1 1.91-4.36A2.5 2.5 0 0 1 9.5 2Z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 2.5 2.5 0 0 0 1.15-4.72 2.5 2.5 0 0 0-1.91-4.36A2.5 2.5 0 0 0 14.5 2Z" />',
  "pen-tool": '<path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-1.5" /><path d="m16 11-1.5-1.5" /><path d="m14 9-1.5-1.5" /><path d="m18 5-3 3" /><path d="M18 5h3v3" /><path d="M2 20l9-9" /><path d="m5 17 3-3" />',
  "loader-2": '<path d="M21 12a9 9 0 1 1-6.219-8.56" />',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />',
  terminal: '<polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />',
  "git-fork": '<line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /><line x1="18" x2="18" y1="9" y2="21" />',
  files:
    '<path d="M15.5 7.5 20 3" /><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M8 14a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-4" />',
  "layout-grid": '<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" x2="12" y1="3" y2="21" />',
  "panel-left": '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />',
  "panel-left-close": '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="m15 9-3 3 3 3" />',
  "panel-right": '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" />',
  "panel-right-close": '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /><path d="m9 9 3 3-3 3" />',
  "more-vertical": '<circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />',
  "more-horizontal": '<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />',
  pin: '<line x1="12" x2="12" y1="17" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />',
  "pin-off": '<line x1="12" x2="12" y1="17" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" /><line x1="2" x2="22" y1="2" y2="22" />',
  "check-check": '<path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" />',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />',
  hash: '<line x1="4" x2="20" y1="9" y2="9" /><line x1="4" x2="20" y1="15" y2="15" /><line x1="10" x2="8" y1="3" y2="21" /><line x1="16" x2="14" y1="3" y2="21" />',
  "text-cursor-input": '<path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /><path d="M21 6v-3" /><path d="M21 12v-3" /><path d="M21 18v-3" />',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />',
  "mic-off": '<line x1="2" x2="22" y1="2" y2="22" /><path d="M18.89 13.23A7.12 7.12 0 0 0 22 16V9" /><path d="M5.57 5.57A4.99 4.99 0 0 0 9 9v6a5 5 0 0 0 .56 2.29" /><path d="M2 13h2" /><path d="M2 17h2" /><path d="M2 9h2" /><path d="m2 2 20 20" />',
  "stop-circle": '<circle cx="12" cy="12" r="10" /><rect x="9" y="9" width="6" height="6" />',
  clock: '<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />',
  coins: '<circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="M16.71 13.88A6 6 0 0 1 13 16h-1v-4" /><path d="M20 12c0 1.66-1.34 3-3 3" />',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" />',
  "message-circle-question":
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><circle cx="12" cy="17" r="0.5" />',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />',
  command: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />',
  "scale-3d": '<path d="M5 19 3 5l9-3 9 3-2 14" /><path d="M5 19h14" /><path d="m3 5 9 3" /><path d="m21 5-9 3" /><circle cx="12" cy="10" r="2" />',
  move: '<polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" x2="22" y1="12" y2="12" /><line x1="12" x2="12" y1="2" y2="22" />',
  "maximize-2": "<path d='M8 3H5a2 2 0 0 0-2 2v3' /><path d='M21 8V5a2 2 0 0 0-2-2h-3' /><path d='M3 16v3a2 2 0 0 0 2 2h3' /><path d='M16 21h3a2 2 0 0 0 2-2v-3' />",
  "minimize-2": '<path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="M14 10h6v6" /><path d="M10 14H4v6" />',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />',
  code: '<polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />',
  diff: '<path d="M12 3v18" /><path d="M18.5 8 22 12l-3.5 4" /><path d="M5.5 8 2 12l3.5 4" />',
  "eye-off": '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 0" /><path d="M10.733 18.924a10.744 10.744 0 0 0 11.205 0" /><path d="M2.268 14.33A10.744 10.744 0 0 1 2 12c0-2.006.525-3.89 1.447-5.528" /><path d="M21.553 6.472A10.744 10.744 0 0 1 22 12c0 2.006-.525 3.89-1.447 5.528" /><path d="M9 9v.01" /><path d="M15 15v.01" /><path d="M9 15v.01" /><path d="M15 9v.01" />',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />',
  "at-sign": '<circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />',
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />'
};

export interface RenderIconOptions {
  size?: IconSize;
  className?: string;
  title?: string;
  decorative?: boolean;
}

const SIZE_CLASS: Record<IconSize, string> = {
  xs: "icon--xs",
  sm: "icon--sm",
  md: "icon--md",
  lg: "icon--lg",
  xl: "icon--xl",
  "2xl": "icon--2xl"
};

export function renderIcon(name: IconName, options: RenderIconOptions = {}): RawHtml {
  const { size = "md", className, title, decorative = false } = options;
  const path = ICON_PATHS[name];

  if (!path) {
    return raw("");
  }

  const a11yAttrs = decorative
    ? 'aria-hidden="true" focusable="false"'
    : title
      ? `role="img" aria-label="${title.replace(/"/g, "&quot;")}"`
      : 'aria-hidden="true" focusable="false"';

  const cssClasses = ["icon", SIZE_CLASS[size], className].filter(Boolean).join(" ");

  return raw(
    `<svg class="${cssClasses}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11yAttrs}>${path}</svg>`
  );
}

export function listIcons(): IconName[] {
  return Object.keys(ICON_PATHS) as IconName[];
}
