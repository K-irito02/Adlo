import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  IconClose,
  IconEdit,
  IconEye,
  IconFileImage,
  IconSaveAsFile,
  IconWrap,
  IconWrapOff,
} from '@icons';
import { CopyButton } from '@components/CopyButton';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { TooltipSimple } from '@components/Tooltip';
import { HScrollbar } from '@components/HScrollbar';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { LazyMarkdownPreviewWrapper } from '@features/preview';
import { useRevealScrollbar } from '@hooks/useRevealScrollbar';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { clipboardTextStats } from './clipboardTextStats';
import { formatClipboardBytes } from './clipboardBytes';
import { getClipboardKindLabel } from './clipboardKind';
import { createUndoStack } from './clipboardUndoStack';
import { injectPreviewStyles, previewDocumentCss } from './previewDocument';
import { ZoomReadout } from './ZoomReadout';

interface ClipboardItemViewerProps {
  item: ClipboardItem;
  onClose: () => void;
}

/** 图片缩放比例范围与步长（与文本字号缩放同为 0.1 步长）。 */
const IMAGE_ZOOM_MIN = 0.25;
const IMAGE_ZOOM_MAX = 4;
/** 文本字号缩放范围与步长（与图片缩放同为 0.1 步长）。 */
const FONT_ZOOM_MIN = 0.5;
const FONT_ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;
/** 存储的图片原图恒为 PNG。 */
const IMAGE_FORMAT = 'PNG';
/** 各 kind 的导出扩展名：与 ad-server `GET /clipboard/export` 的文件名后缀一致，
 *  保证"另存为"对话框预填的文件名与服务端产出一致。类型锁死 kind 全集，
 *  拼写错误编译期即暴露；未知 kind 回退 'txt'（type 上不可达，防未来扩展）。 */
const EXPORT_EXTENSIONS: Record<ClipboardItem['kind'], string> = {
  text: 'txt',
  html: 'html',
  rtf: 'rtf',
  image: 'png',
};
/**
 * 单次保存任务内最多写入轮数（首轮 + 若干次补写）。封顶以防写入失败时死循环；
 * 若达到上限时草稿仍未落盘，保存任务会**保持编辑态**（不静默丢弃新输入），
 * 由后续 Ctrl+S / 关闭继续保存。
 */
const MAX_SAVE_ROUNDS = 8;

/** 二进制 → 标准 base64。分块 `String.fromCharCode` 避免大数组展开爆栈。 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** 取服务端导出字节：HTTP 错误状态（404/500）下 `arrayBuffer()` 照样 resolve，
 *  不校验就会把错误页存成文件，故此处抛错交由调用方 toast。 */
async function fetchExport(url: string): Promise<Response> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`clipboard export failed: HTTP ${resp.status}`);
  }
  return resp;
}

/** 读宿主主题变量（iframe 读不到父页面变量，宿主读到后以字符串注入）。
 * 回退值与 `themes.css` 两主题的 `--text-primary` / `--surface-editing` 同值，
 * token 改名/改值时这里同步跟进（否则静默过期）。 */
function readThemeVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** 读取宿主当前主题的前景色（供注入预览 iframe 的样式使用）。 */
function readPreviewTextColor(): string {
  return readThemeVar('--text-primary', '#222222');
}

/** 宿主是否为暗主题（与 readPreviewTextColor 同一判据）。 */
function isDarkPreviewTheme(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

/** 当前主题的编辑底色（iframe 同样读不到变量，以字符串注入）。 */
function readPreviewSurfaceColor(): string {
  return readThemeVar('--surface-editing', isDarkPreviewTheme() ? '#242427' : '#f0f0f1');
}

/**
 * 剪贴板条目放大查看覆盖层（createPortal + 遮罩 + 卡片）。
 * - 头部：标题靠左，**居中**按钮组（复制 / 换行 / 编辑 / 预览 / 保存为文件）；
 *   关闭**靠右**，编辑态时关闭左侧出现“保存更改 / 丢弃更改”文字按钮（大间距分区）。
 *   图标按钮 Tooltip 统一出现在按钮**下方**（底部工具行的 A-/A+ 仍用上方）
 * - 底部工具行：统计读数（靠左）+ 字号（文本）或缩放（图片）控件（靠右）
 * - 文本与富文本条目：编辑 = 纯文本（`content`，与普通文本无异，不碰 HTML 源码）；
 *   文本预览 = Markdown 渲染，富文本预览 = sidecar 沙箱 iframe（文本编辑不反映到预览）
 * - 编辑态与预览态的内容区共用编辑底色（`--surface-editing`），按钮常驻 `is-toggled` 灰底
 * - 编辑与预览**互斥单选**：编辑中点预览先自动保存再切换（失败留编辑态）；预览中点编辑直接切换
 * - 自动换行状态同时作用于源码视图、Markdown 预览与富文本预览（关闭时横向滚动查看）
 * - 编辑按钮为开关：再次点击即提交并退出编辑态（失败/空白留编辑态）
 * - 关闭自动换行时由项目自定义横向滚动条（HScrollbar）承载溢出内容（富文本走注入的内横滚）
 * - 图片条目：工具栏展示尺寸/格式/体积读数与 25%~400% 缩放（适应窗口复位到 100%）
 * - "保存为文件"走系统原生「另存为」对话框（预填 `clipboard-<id>.<ext>`，可改名改位置）
 * - 遮罩点击 / Escape / 关闭按钮均可关闭；关闭即保存（含卸载时的未落盘改动）
 */
export function ClipboardItemViewer({ item, onClose }: ClipboardItemViewerProps) {
  const { t, formatT } = useTCopy();
  const updateClipboardItem = useAppStore((s) => s.updateClipboardItem);
  const writeClipboardItem = useAppStore((s) => s.writeClipboardItem);
  const reportError = useAppStore((s) => s.reportError);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isImage = item.kind === 'image';
  const isHtml = item.kind === 'html';
  // 可预览：文本走 Markdown 预览；富文本走 HTML 预览。图片与 RTF 无可渲染文档。
  const canPreview = !isImage && item.kind !== 'rtf';
  const imageUrl = isImage ? window.digitalLife.clipboard.getImageUrl(item.imagePath ?? '') : '';
  const thumbUrl = isImage ? window.digitalLife.clipboard.getThumbUrl(item.thumbPath ?? '') : '';
  // 「保存为文件」的载荷来源：mock / 离线回退模式下 `exportUrl` 返回空串，
  // 此时无载荷可存，按钮给出错误提示而不是静默无反应。
  const exportUrl = window.digitalLife.clipboard.exportUrl(item.id);
  // 原图 → 缩略图 → 图标占位，逐级回退（原图 URL 缺失时直接从缩略图起步）
  const [imageStage, setImageStage] = useState<'original' | 'thumb' | 'none'>(() =>
    imageUrl ? 'original' : 'thumb',
  );
  const [fontScale, setFontScale] = useState(1);
  const [imageScale, setImageScale] = useState(1);
  const [wrap, setWrap] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [htmlText, setHtmlText] = useState('');
  const [editing, setEditing] = useState(false);
  // `editing` 的 render 期镜像（effects 读取用，见条目变化 effect 注释）。
  const editingRef = useRef(false);
  editingRef.current = editing;
  const [savingToFile, setSavingToFile] = useState(false);
  // 存文件单飞的同步互斥（见 handleSaveToFile；state 只做渲染）。
  const savingToFileRef = useRef(false);
  // 条目的纯文本内容（`content`）：非编辑态的纯文本视图与统计读数都基于它。
  const [draft, setDraft] = useState(item.content ?? '');
  const draftRef = useRef(item.content ?? '');
  /** 编辑中的文本：恒为纯文本（`content`），文本与富文本条目无异。 */
  const [editText, setEditText] = useState('');
  // 始终持有最新编辑草稿（状态更新是异步的），供保存流程在 await 之后判断是否需要补写。
  const editTextRef = useRef('');
  const baselineRef = useRef('');
  const stackRef = useRef(createUndoStack(''));
  // 单飞：同一时刻至多一个保存任务在途（任务内部逐轮串行写入），避免并发/重复写入。
  const savingRef = useRef<Promise<boolean> | null>(null);
  // 保存代际：Esc / 丢弃 / 重进编辑时 +1，在途任务醒来发现代际已变即放弃推进
  // （已发出的写入无法撤回，但至少不推进基线、不覆盖浏览视图，保证状态不分叉）。
  const saveGenRef = useRef(0);
  // 「放弃更改并关闭」已确认：卸载时的兜底保存必须跳过（否则确认框形同虚设）。
  const discardRef = useRef(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  // 统计读数跟随眼前内容：编辑期是编辑缓冲（实时），非编辑期是已落盘内容。
  const stats = useMemo(
    () => clipboardTextStats(editing ? editText : draft),
    [draft, editText, editing],
  );

  /** 预览 iframe 的 srcDoc：注入主题底色 + 项目同款滚动条后的完整文档。
   *  `wrap` 关闭时追加不折行覆盖（原生 HTML 渲染即换行，不注入）；换行态不注入，
   *  保持源文档原生排版。字号缩放（`fontScale`）经 `html{zoom}` 跟随，
   *  因文档内字号多为 px 定死，`body{font-size}` 够不着。
   *  `--text-base` 取 16：与全局 token 同值（`markdown-preview.css` 的 15px 只是
   *  token 缺席时的 fallback，应用内恒解析为 16）。主题切换不触发重算，
   *  iframe 会滞留旧底色/前景直到下次缩放/换行，有意为之（监听主题成本高于收益）。 */
  const previewSrcDoc = useMemo(() => {
    if (!isHtml || !htmlText) {
      return '';
    }
    const dark = isDarkPreviewTheme();
    return injectPreviewStyles(
      htmlText,
      previewDocumentCss(readPreviewTextColor(), {
        dark,
        surface: readPreviewSurfaceColor(),
        nowrap: !wrap,
        zoom: fontScale,
      }),
    );
  }, [htmlText, isHtml, wrap, fontScale]);

  const updateEditText = useCallback((next: string) => {
    editTextRef.current = next;
    setEditText(next);
  }, []);
  const updateDraft = useCallback((next: string) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  // 横向滚动条（关闭自动换行时承载溢出内容）。deps 覆盖一切会改变内容宽度的状态，
  //  `useRevealScrollbar` 每次 deps 变化都重测几何（其 ResizeObserver 只观察容器自身，
  //  观察不到内容宽度变化）。`previewSrcDoc` 是 htmlText/wrap/fontScale 的 memo 结果，
  //  不必重复列入（列入只会让大字符串重算多触发一次重测）。
  const hScrollbar = useRevealScrollbar(
    [item.id, isImage, draft, editText, htmlText, fontScale, imageScale, wrap, editing, previewing],
    'horizontal',
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // 条目变化时重置草稿/撤销栈并退出编辑，保证 Esc 撤回到该条目的最新文本，且不会复用编辑态。
  // 编辑态中一律跳过（无论脏否）：外界重取（10s 轮询 / 推送）不得覆盖用户正在键入的内容，
  // 也不得把人踢出编辑器；保存成功后基线已推进，退出编辑后 effect 重跑即刷新为最新。
  // 注意：此处不依赖 `editing`（进入编辑本身不改变 item，不会误触发本 effect）。
  // 已知取舍：编辑期外部更新在保存时被覆盖（last-writer-wins），无合并提示，有意为之。
  useEffect(() => {
    // `editing` 的 render 期镜像：effect 不能直接依赖它，否则进入编辑的当次渲染
    // 就会误触发重置把自己踢出编辑态；读镜像则只在 item 变化时判定。
    if (editingRef.current) {
      return;
    }
    const initial = item.content ?? '';
    updateDraft(initial);
    setEditing(false);
    setPreviewing(false);
    baselineRef.current = initial;
    stackRef.current = createUndoStack(initial);
    // 图片 fallback 档位同步重置：上一条目失败到 thumb/none 后切条目，不沿用旧档位。
    setImageStage(
      window.digitalLife.clipboard.getImageUrl(item.imagePath ?? '') ? 'original' : 'thumb',
    );
  }, [item.id, item.content, item.imagePath, updateDraft]);

  useEffect(() => {
    if (!isHtml || !item.htmlPath) {
      return;
    }
    // 切条目先清空旧文档：fetch 回来前预览面空白而非串台旧内容。
    setHtmlText('');
    // 空 URL 不可 fetch：`fetch('')` 会相对当前文档解析，抓取 SPA 自身的 HTML 作为 srcDoc。
    const url = window.digitalLife.clipboard.getHtmlUrl(item.htmlPath);
    if (!url) {
      return;
    }
    let cancelled = false;
    // 与导出路径复用同一 ok 校验：错误页不得成为 srcDoc（catch 已存在，失败即空白面）。
    void fetchExport(url)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setHtmlText(text);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.id, item.kind, item.htmlPath, isHtml]);

  /**
   * 「保存为文件」：取回条目字节 → 交系统原生「另存为」对话框落盘。
   *
   * 文本条目的字节**取自眼前内容**（编辑态取未落盘的编辑缓冲，非编辑态取已落盘内容）：
   * 若落盘旧内容会与所见不符。
   * html / rtf / image 的字节走 `/clipboard/export` 服务端快照：html 的纯文本编辑
   * 不反映到文件（sidecar 只由捕获写入），导出恒为原文富载荷，有意为之。
   *
   * 用户取消对话框不算错误（`path` 为空即静默返回）；取载荷 / 落盘失败走错误 toast。
   */
  const handleSaveToFile = useCallback(async () => {
    // ref 做同步互斥（state 更新异步，同 tick 双击会双双穿透各弹一次对话框），
    // state 只负责按钮 disabled 渲染。
    if (savingToFileRef.current) {
      return;
    }
    savingToFileRef.current = true;
    setSavingToFile(true);
    try {
      const suggestedName = `clipboard-${item.id}.${EXPORT_EXTENSIONS[item.kind] ?? 'txt'}`;
      if (item.kind !== 'text' && !exportUrl) {
        reportError('CLIPBOARD_EXPORT_UNAVAILABLE', t.clipboardExportFailed, 'clipboard');
        return;
      }
      const bytes =
        item.kind === 'text'
          ? new TextEncoder().encode(editing ? editTextRef.current : draftRef.current)
          : new Uint8Array(await (await fetchExport(exportUrl)).arrayBuffer());
      const result = await window.digitalLife.clipboard.saveToFile({
        suggestedName,
        dataBase64: bytesToBase64(bytes),
      });
      if (!result.ok) {
        // 面向用户的文案走 i18n（错误码进 toast 条目供排查，不直接展示后端原文）。
        reportError(result.error.code, t.clipboardSaveAsFileFailed, 'clipboard');
      }
    } catch {
      reportError('CLIPBOARD_EXPORT_FAILED', t.clipboardExportFailed, 'clipboard');
    } finally {
      savingToFileRef.current = false;
      setSavingToFile(false);
    }
  }, [editing, exportUrl, item.id, item.kind, reportError, t]);

  /**
   * 若正在编辑且有改动则落盘，然后退出编辑模式；空白内容不可保存。
   * 文本与富文本条目都写纯文本侧 `content`（走文本通道）。
   * 返回值：`undefined` = 无需保存（未编辑 / 无改动 / 空白草稿）；`true` = 已完全落盘；
   * `false` = 保存失败或仍有未落盘改动 —— 关闭路径据此**保持弹窗打开**并弹出
   * 「放弃更改 / 继续编辑」确认框，绝不静默丢稿。
   */
  const commitIfEditing = useCallback(async (): Promise<boolean | undefined> => {
    if (!editing) {
      return;
    }
    if (savingRef.current) {
      return savingRef.current;
    }
    // 无改动 / 空白草稿：无需保存，直接返回（空白保持编辑态供用户修正）。
    // 这两条前置判定**不可**下移进下面的保存任务体（也不可与任务体内的同名判定合并）：
    // 若任务体不经过任何 `await` 就同步跑完，其 `finally` 会先于 `savingRef.current = saving`
    // 执行，于是 `savingRef` 会被一个已 resolve 的 promise 永久占住，之后所有保存/关闭都会
    // 直接复用它而被静默跳过（数据丢失）。任务体内的判定只用于第 2 轮起的再校验。
    if (!editTextRef.current.trim()) {
      return;
    }
    if (editTextRef.current === baselineRef.current) {
      setEditing(false);
      return;
    }
    const saving = (async (): Promise<boolean> => {
      const gen = saveGenRef.current;
      try {
        for (let round = 0; round < MAX_SAVE_ROUNDS; round += 1) {
          const target = editTextRef.current;
          if (!target.trim() || target === baselineRef.current) {
            break;
          }
          const ok = await updateClipboardItem(item.id, target);
          // 代际已变（中途 Esc / 丢弃 / 重进编辑）：放弃本轮，不推进基线、不退出编辑。
          if (saveGenRef.current !== gen) {
            return false;
          }
          if (!ok) {
            // 保存失败：不推进基线、保持编辑态，让用户可重试（关闭时会再次尝试落盘）。
            return false;
          }
          // 更新基线：既让下一轮判断"是否还有新改动"，也让随后的 Esc 撤回到已保存内容。
          baselineRef.current = target;
        }
        // 仅当草稿已完全落盘（保存期间无新输入）时才退出编辑；否则保持编辑态，
        // 让后续 Ctrl+S / 关闭继续保存 —— 避免达到轮数上限时静默丢弃最后的新输入。
        if (saveGenRef.current === gen && editTextRef.current === baselineRef.current) {
          // 落盘成功即同步浏览视图：弹窗 prop 是 store 实时条目，但直接挂载用例与
          // 父级快照下仍需本地同步，否则默认浏览态显示旧内容，直到重开。
          updateDraft(baselineRef.current);
          setEditing(false);
          return true;
        }
        return false;
      } finally {
        savingRef.current = null;
      }
    })();
    savingRef.current = saving;
    return saving;
  }, [editing, item.id, updateClipboardItem, updateDraft]);

  const commitIfEditingRef = useRef(commitIfEditing);
  useEffect(() => {
    commitIfEditingRef.current = commitIfEditing;
  }, [commitIfEditing]);

  // 关闭即保存：所有关闭路径先落盘再关闭；落盘失败则保持打开并弹出确认框（绝不静默丢稿）。
  // 重入守卫：关闭按钮双击 / 确认框交互期间再点关闭，不得重复触发保存或 onClose。
  const closingRef = useRef(false);
  const closeAndMaybeSave = async () => {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    try {
      if (editing) {
        // commit 按契约永不 reject，catch 只防未来 bridge 实现抛错（无 unhandledrejection）。
        const result = await commitIfEditing().catch(() => false);
        // 等待在途保存期间用户可能已按 Esc 撤回更改（草稿回到基线）——
        // 此时已无未保存改动，即使保存任务以失败收尾也不得再弹确认框。
        if (result === false && editTextRef.current !== baselineRef.current) {
          setDiscardConfirmOpen(true);
          return;
        }
      }
      onClose();
    } finally {
      closingRef.current = false;
    }
  };

  // 「放弃更改」：跳过卸载兜底保存后关闭。
  const discardAndClose = () => {
    discardRef.current = true;
    setDiscardConfirmOpen(false);
    onClose();
  };

  // 「继续编辑」：留在编辑态（草稿原样保留，可 Ctrl+S 重试），焦点交还编辑器。
  const keepEditing = () => {
    setDiscardConfirmOpen(false);
    editorRef.current?.focus();
  };

  // 卸载时仍在编辑则把未落盘的改动保存下来（用户已确认放弃更改时跳过）。
  // 卸载后任务的成功/失败分支不再 setState（无主更新）也不 toast（无处可显），
  // 静默是兜底的有意代价；有 UI 时的失败走确认框路径。
  // commit 按契约永不 reject，catch 只防未来 bridge 实现抛错（无 unhandledrejection）。
  useEffect(
    () => () => {
      if (!discardRef.current) void commitIfEditingRef.current().catch(() => undefined);
    },
    [],
  );

  /** 进入编辑态：恒以纯文本侧为基线（文本与富文本条目无异，不碰 HTML 源码）。 */
  const startEditing = () => {
    const initial = draftRef.current;
    saveGenRef.current += 1;
    baselineRef.current = initial;
    stackRef.current = createUndoStack(initial);
    updateEditText(initial);
    setPreviewing(false);
    setEditing(true);
  };

  /** 再次点击编辑按钮 = 提交并退出（先尝试落盘；失败/空白时留编辑态）。
   *  撤销请用 Esc 或"丢弃更改"。进入编辑恒先退出预览，保证两者互斥。 */
  const toggleEditing = () => {
    if (!editing) {
      startEditing();
      return;
    }
    // commit 按契约永不 reject（各 bridge 内 catch），catch 只是防未来实现抛错的硬化。
    void commitIfEditing().catch(() => false);
  };

  /**
   * 丢弃本次编辑的全部改动，恢复为进入编辑态之前的内容，但**不退出**编辑态。
   * 与 Esc 的区别仅在于去留：Esc = 恢复 + 退出，此处 = 恢复 + 留在编辑器（焦点归还）。
   * 在途保存不受影响（拦不住已发出的写入），但代际+1 会让它放弃推进基线。
   */
  const discardEdits = () => {
    saveGenRef.current += 1;
    updateEditText(baselineRef.current);
    stackRef.current = createUndoStack(baselineRef.current);
    editorRef.current?.focus();
  };

  /**
   * 进入/退出预览（与编辑互斥的单选语义）。
   * - 未编辑时：裸切换预览。
   * - 编辑中点击预览：先自动保存（`commitIfEditing`），落盘成功（或无改动）才退出编辑
   *   进入预览；保存失败或空白草稿（不可保存）时留在编辑态，绝不静默丢稿。
   */
  const enterPreview = () => {
    if (!editing) {
      setPreviewing((v) => !v);
      return;
    }
    // 编辑态恒有 previewing === false（startEditing 内置），无需再判。
    // 空白草稿不可保存：留在编辑态供用户修正，不切换。
    if (!editTextRef.current.trim()) {
      return;
    }
    void (async () => {
      const result = await commitIfEditing().catch(() => false);
      if (result === false) {
        return;
      }
      // commit 成功路径已 setEditing(false)，此处只开预览（重复设值无害但无意义）。
      setPreviewing(true);
    })();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 确认框打开期间由 ConfirmDialog 接管键盘（其 Esc 在 window 捕获段拦截并停止传播）。
      if (discardConfirmOpen) {
        return;
      }
      if (editing) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
          event.preventDefault();
          updateEditText(stackRef.current.undo());
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
          event.preventDefault();
          updateEditText(stackRef.current.redo());
          return;
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          (event.key === 'Z' || event.key === 'z') &&
          event.shiftKey
        ) {
          // macOS 习惯的 Shift+Ctrl+Z 重做（与 Ctrl+Y 并存）。
          event.preventDefault();
          updateEditText(stackRef.current.redo());
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          void commitIfEditingRef.current();
          return;
        }
        if (event.key === 'Escape') {
          // 编辑中 Esc = 取消更改：撤回到本次编辑开始前的文本，弹窗保持打开。
          // 在途保存拦不住（已发出的写入无法撤回），但代际+1 让它放弃推进基线。
          event.preventDefault();
          saveGenRef.current += 1;
          updateEditText(baselineRef.current);
          stackRef.current = createUndoStack(baselineRef.current);
          setEditing(false);
          return;
        }
      } else if (event.key === 'Escape') {
        onClose();
        return;
      }
      // 焦点循环：Tab / Shift+Tab 在面板内的可聚焦控件间环绕（兑现 aria-modal 契约）。
      // 此前一律聚焦关闭按钮，会让复制/导出/缩放/编辑/预览/iframe 等控件键盘不可达。
      if (event.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) {
          return;
        }
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href]:not([hidden]), button:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])',
          ),
          // 自身无 hidden 但祖先隐藏（如隐藏 Markdown 面里的链接）同样不可达，一并排除。
        ).filter((el) => el.closest('[hidden]') === null);
        if (focusables.length === 0) {
          return;
        }
        event.preventDefault();
        const current = document.activeElement as HTMLElement | null;
        const idx = current ? focusables.indexOf(current) : -1;
        const step = event.shiftKey ? -1 : 1;
        const next =
          idx === -1
            ? event.shiftKey
              ? focusables.length - 1
              : 0
            : (idx + step + focusables.length) % focusables.length;
        focusables[next].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing, discardConfirmOpen, onClose, updateEditText]);
  const displayUrl = imageStage === 'original' ? imageUrl : imageStage === 'thumb' ? thumbUrl : '';
  // 图片读数：尺寸 / 格式 / 体积，未知项整体省略（不打印占位符）。
  const imageMetaParts: string[] = [];
  if (item.imageWidth != null && item.imageHeight != null) {
    imageMetaParts.push(
      formatT(t, 'clipboardImageDimensions', {
        width: String(item.imageWidth),
        height: String(item.imageHeight),
      }),
    );
  }
  imageMetaParts.push(formatT(t, 'clipboardImageFormat', { format: IMAGE_FORMAT }));
  const imageBytes = item.imageBytes != null ? formatClipboardBytes(item.imageBytes) : '';
  if (imageBytes) {
    imageMetaParts.push(formatT(t, 'clipboardImageByteSize', { size: imageBytes }));
  }
  const imageMeta = imageMetaParts.join(t.clipboardImageMetaSeparator);
  // 显示宽度 = 原始宽度 × 比例，放大时放开 max-width 让滚动容器可横向滚动；100% 时回到 max-width:100% 自适应。
  const imageStyle =
    item.imageWidth != null
      ? {
          width: Math.round(item.imageWidth * imageScale),
          maxWidth: imageScale > 1 ? 'none' : '100%',
        }
      : undefined;
  // 排版（仅纯文本视图 / 编辑器用；预览面各自有渲染器）：
  // 关闭自动换行时必须同时解除 CSS 的 `word-break: break-word` —— 它是
  // `overflow-wrap: anywhere` 的废弃别名，会为避免溢出而在词内折行；留着它，
  // 超长无空格串就不会横向溢出，横向滚动条也就永远不会出现（"不换行"名不副实）。
  const textTypography = {
    fontSize: `calc(var(--text-sm) * ${fontScale})`,
    whiteSpace: wrap ? ('pre-wrap' as const) : ('pre' as const),
    // `word-break: break-word` 虽是废弃别名，但此处是"关闭换行"根因修复的现行载体
    // （CSS 层已无 word-break，全靠本内联切回 normal），保留并由测试锁定，不做规范性清理。
    wordBreak: wrap ? ('break-word' as const) : ('normal' as const),
    overflowWrap: wrap ? ('anywhere' as const) : ('normal' as const),
  };
  // 预览与编辑共用同一底色 class（用户要求两者视觉一致）。
  const contentSurfaceActive = editing || previewing;
  const previewLabel = isHtml ? t.clipboardPreviewRich : t.clipboardPreviewMarkdown;

  return createPortal(
    <div
      className="adl-clipboard-viewer"
      onClick={(event) => {
        // 仅遮罩自身被点击时关闭：文本中拖选后松手到卡片外不应关闭（与清空确认框一致）。
        if (event.target === event.currentTarget) {
          void closeAndMaybeSave();
        }
      }}
    >
      <div
        ref={panelRef}
        className="adl-clipboard-viewer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.clipboardZoomView}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adl-clipboard-viewer__header">
          <span className="adl-clipboard-viewer__title">{getClipboardKindLabel(item.kind, t)}</span>
          {/* 居中按钮组：三列 grid 的中间列（1fr auto 1fr），标题长短不影响其居中。 */}
          <div className="adl-clipboard-viewer__header-actions">
            <CopyButton
              onCopy={() => writeClipboardItem(item.id)}
              size={12}
              className="adl-clipboard-viewer__copy"
              tooltip={t.clipboardCopy}
              tooltipPlacement="bottom"
            />
            {!isImage && (
              <TooltipSimple
                content={wrap ? t.clipboardWrapOn : t.clipboardWrapOff}
                placement="bottom"
              >
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs"
                  aria-pressed={wrap ? 'true' : 'false'}
                  onClick={() => setWrap((w) => !w)}
                  // 标签描述**当前状态**（与 aria-pressed 配对），不是"点击会发生什么"：
                  // 图标本身已是 ON/OFF 两态，标签再反过来会与图标互相矛盾。
                  aria-label={wrap ? t.clipboardWrapOn : t.clipboardWrapOff}
                >
                  {wrap ? <IconWrap size={14} decorative /> : <IconWrapOff size={14} decorative />}
                </button>
              </TooltipSimple>
            )}
            {!isImage && item.kind !== 'rtf' && (
              <TooltipSimple content={t.clipboardEdit} placement="bottom">
                <button
                  type="button"
                  // is-toggled = 悬停同款灰底（--bg-hover）：编辑态常驻，离开编辑态即消失。
                  className={`adl-icon-btn adl-icon-btn--xs${editing ? ' is-toggled' : ''}`}
                  aria-pressed={editing ? 'true' : 'false'}
                  onClick={toggleEditing}
                  aria-label={t.clipboardEdit}
                >
                  <IconEdit size={12} decorative />
                </button>
              </TooltipSimple>
            )}
            {canPreview && (
              <TooltipSimple content={previewLabel} placement="bottom">
                <button
                  type="button"
                  className={`adl-icon-btn adl-icon-btn--xs${previewing ? ' is-toggled' : ''}`}
                  aria-pressed={previewing ? 'true' : 'false'}
                  onClick={enterPreview}
                  // 空白编辑态禁用：空白不可保存，点预览只会静默无反应，禁用比静默诚实。
                  disabled={editing && !editText.trim()}
                  aria-label={previewLabel}
                >
                  <IconEye size={12} decorative />
                </button>
              </TooltipSimple>
            )}
            <TooltipSimple content={t.clipboardExport} placement="bottom">
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() => void handleSaveToFile()}
                disabled={savingToFile}
                aria-label={t.clipboardExport}
              >
                {/* 填充图标（换行 / 保存）比同尺寸的描边图标视觉更重，
                    统一用 14px 与 12px 描边图标配平，避免软盘内窗在 12px 下糊成一团。 */}
                <IconSaveAsFile size={14} decorative />
              </button>
            </TooltipSimple>
          </div>
          {/* TooltipSimple 会多包一层 .tooltip-trigger —— **它**才是 grid 子项，
              故靠右对齐必须落在这层包裹上（写在 button 上对 grid 无效）。
              编辑态时关闭左侧出现文字按钮组（保存 / 放弃本次编辑），与关闭保持
              区域型大间距；文字自解释，不再挂 title。 */}
          <div className="adl-clipboard-viewer__close-cell">
            {editing && (
              <div className="adl-clipboard-viewer__edit-text-actions">
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--sm adl-clipboard-viewer__edit-text-btn"
                  onClick={() => void commitIfEditing()}
                  aria-label={t.clipboardSave}
                >
                  {t.clipboardSave}
                </button>
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--sm adl-clipboard-viewer__edit-text-btn"
                  onClick={discardEdits}
                  aria-label={t.clipboardDiscardEdits}
                >
                  {t.clipboardDiscardEdits}
                </button>
              </div>
            )}
            <TooltipSimple content={t.close} placement="bottom">
              <button
                ref={closeRef}
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() => void closeAndMaybeSave()}
                aria-label={t.close}
              >
                <IconClose size={14} decorative />
              </button>
            </TooltipSimple>
          </div>
        </div>

        <div className="adl-clipboard-viewer__body">
          <CustomScrollArea
            shellClassName={`adl-clipboard-viewer__scroll-shell${
              contentSurfaceActive ? ' adl-clipboard-viewer__scroll-shell--active' : ''
            }`}
            scrollClassName="adl-clipboard-viewer__scroll"
            scrollbarClassName="adl-clipboard-viewer__scrollbar"
            thumbClassName="adl-clipboard-viewer__scrollbar-thumb"
            scrollRef={hScrollbar.scrollRef}
          >
            {isImage ? (
              <div className="adl-clipboard-viewer__image-wrap">
                {displayUrl ? (
                  <img
                    className="adl-clipboard-viewer__image"
                    src={displayUrl}
                    alt={t.clipboardImage}
                    style={imageStyle}
                    onError={() =>
                      setImageStage((prev) => (prev === 'original' ? 'thumb' : 'none'))
                    }
                  />
                ) : (
                  <IconFileImage size={48} decorative />
                )}
              </div>
            ) : (
              // 浏览与预览面常驻挂载、只翻 `hidden`：条件卸载会在每次切换时重建子树——
              // 文本首切 `React.lazy` 分包未到即空白一帧，富文本每次重挂 iframe 即重载
              // 文档，叠加底色瞬切就是"闪跳晃"。常驻后懒加载与文档加载在弹窗打开时
              // 即完成（隐藏面不可见），切换只剩属性翻转。`display:block` 类会覆盖
              // UA 的 `[hidden]` 样式，显隐由 `__scroll > [hidden]` 规则兜底。
              // 编辑器仍条件挂载（轻量，重建可接受）；编辑态下浏览/预览面保持挂载
              // （隐藏），故编辑→预览同样无重建。
              <>
                <pre
                  className="adl-clipboard-viewer__text"
                  style={textTypography}
                  hidden={editing || previewing}
                >
                  {draft}
                </pre>
                {isHtml ? (
                  <iframe
                    className="adl-clipboard-viewer__rich"
                    sandbox=""
                    srcDoc={previewSrcDoc}
                    title={t.clipboardHtml}
                    hidden={editing || !previewing}
                  />
                ) : (
                  // 纯文本按 Markdown 渲染：复用右侧面板同一渲染器（DOMPurify +
                  // markdown-it html:false），顺带让本分支也走外层自绘滚动条。
                  // 关闭自动换行时继承 `white-space: pre`（段落不再折行），溢出由外层
                  // 自绘滚动条 + 横向点态条承载；换行态保持原生渲染，不注入。
                  // 字号缩放经 `--text-base` 变量跟随：`.adl-markdown-preview` 自设
                  // `font-size: var(--text-base, 15px)`，包层写 `font-size` 会被该声明
                  // 覆盖而无效；改变量则容器与 em 子级整体等比缩放。
                  <div
                    className="adl-clipboard-viewer__markdown"
                    hidden={editing || !previewing}
                    style={
                      {
                        '--text-base': `${(16 * Math.round(fontScale * 100)) / 100}px`,
                        ...(wrap
                          ? {}
                          : {
                              whiteSpace: 'pre' as const,
                              wordBreak: 'normal' as const,
                              overflowWrap: 'normal' as const,
                            }),
                      } as CSSProperties
                    }
                  >
                    <LazyMarkdownPreviewWrapper content={draft} />
                  </div>
                )}
              </>
            )}
            {editing && (
              <textarea
                ref={editorRef}
                className="adl-clipboard-viewer__editor"
                aria-label={t.clipboardEdit}
                value={editText}
                onChange={(event) => {
                  const next = event.target.value;
                  stackRef.current.push(next);
                  updateEditText(next);
                }}
                style={textTypography}
              />
            )}
          </CustomScrollArea>
          {/* 横向点态常驻条（文件/变更面板同款）：关闭自动换行时承载溢出内容的横向滚动。 */}
          <HScrollbar controller={hScrollbar} />
        </div>

        <div className="adl-clipboard-viewer__tools">
          {isImage ? (
            <>
              <span className="adl-clipboard-viewer__stats">{imageMeta}</span>
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() =>
                  setImageScale((s) => Math.max(IMAGE_ZOOM_MIN, +(s - ZOOM_STEP).toFixed(2)))
                }
                aria-label={t.clipboardImageZoomOut}
              >
                −
              </button>
              <ZoomReadout
                className="adl-icon-btn adl-icon-btn--xs adl-clipboard-viewer__zoom"
                value={imageScale}
                min={IMAGE_ZOOM_MIN}
                max={IMAGE_ZOOM_MAX}
                onReset={() => setImageScale(1)}
                onCommit={setImageScale}
                resetLabel={t.clipboardImageZoomReset}
                inputLabel={t.clipboardZoomInput}
                rangeHint={formatT(t, 'clipboardZoomRange', {
                  min: String(Math.round(IMAGE_ZOOM_MIN * 100)),
                  max: String(Math.round(IMAGE_ZOOM_MAX * 100)),
                })}
              />
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs"
                onClick={() =>
                  setImageScale((s) => Math.min(IMAGE_ZOOM_MAX, +(s + ZOOM_STEP).toFixed(2)))
                }
                aria-label={t.clipboardImageZoomIn}
              >
                +
              </button>
              <button
                type="button"
                className="adl-icon-btn adl-icon-btn--xs adl-clipboard-viewer__fit"
                onClick={() => setImageScale(1)}
                aria-label={t.clipboardImageFitWindow}
              >
                {t.clipboardImageFitWindow}
              </button>
            </>
          ) : (
            <>
              <span className="adl-clipboard-viewer__stats">
                {formatT(t, 'clipboardStatsSummary', {
                  chars: String(stats.chars),
                  noSpace: String(stats.charsNoSpace),
                  lines: String(stats.lines),
                })}
              </span>
              <TooltipSimple content={t.clipboardZoomOut} placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs adl-clipboard-viewer__zoom-step"
                  onClick={() =>
                    setFontScale((s) => Math.max(FONT_ZOOM_MIN, +(s - ZOOM_STEP).toFixed(2)))
                  }
                  aria-label={t.clipboardZoomOut}
                >
                  A-
                </button>
              </TooltipSimple>
              <ZoomReadout
                className="adl-icon-btn adl-icon-btn--xs adl-clipboard-viewer__zoom"
                value={fontScale}
                min={FONT_ZOOM_MIN}
                max={FONT_ZOOM_MAX}
                onReset={() => setFontScale(1)}
                onCommit={setFontScale}
                resetLabel={t.clipboardZoomReset}
                inputLabel={t.clipboardZoomInput}
                rangeHint={formatT(t, 'clipboardZoomRange', {
                  min: String(Math.round(FONT_ZOOM_MIN * 100)),
                  max: String(Math.round(FONT_ZOOM_MAX * 100)),
                })}
              />
              <TooltipSimple content={t.clipboardZoomIn} placement="top">
                <button
                  type="button"
                  className="adl-icon-btn adl-icon-btn--xs adl-clipboard-viewer__zoom-step"
                  onClick={() =>
                    setFontScale((s) => Math.min(FONT_ZOOM_MAX, +(s + ZOOM_STEP).toFixed(2)))
                  }
                  aria-label={t.clipboardZoomIn}
                >
                  A+
                </button>
              </TooltipSimple>
            </>
          )}
        </div>
      </div>
      {/* 保存失败时的关闭确认：弹窗保持打开，由用户决定放弃更改或继续编辑（可重试）。 */}
      <ConfirmDialog
        open={discardConfirmOpen}
        title={t.clipboardSaveFailedTitle}
        message={t.clipboardSaveFailedMessage}
        confirmLabel={t.clipboardDiscardChanges}
        cancelLabel={t.clipboardKeepEditing}
        onConfirm={discardAndClose}
        onCancel={keepEditing}
      />
    </div>,
    document.body,
  );
}
