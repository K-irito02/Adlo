/**
 * 原生文件拖放的优先级路由。
 *
 * 桌面端外部文件由 Rust 侧接收（Windows 为自有 OLE `IDropTarget`，其它平台由
 * `RunEvent::WindowEvent::DragDrop` 桥接），统一经 `adl:file-drop` 事件广播；
 * 覆盖层（如自定义背景弹窗）在打开期注册处理器、关闭即注销，由它决定是否消费，
 * 未消费才回落到「把文件当工作区打开」。弹窗内部另有 `browser_take_pending_drop`
 * 轮询兜底，工作区打开路径只走事件通道。
 */
export interface NativeFileDrop {
  paths: string[];
}

type NativeFileDropHandler = (drop: NativeFileDrop) => boolean;

const handlers: NativeFileDropHandler[] = [];

export function registerNativeFileDropHandler(handler: NativeFileDropHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  };
}

/** 从数组末尾向前匹配：后注册的处理器先得到机会（覆盖层在打开时注册）。 */
export function routeNativeFileDrop(drop: NativeFileDrop): boolean {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (handlers[index](drop)) {
      return true;
    }
  }
  return false;
}

/**
 * 桌面落点的统一去向：覆盖层消费则停止；否则取第一条路径打开工作区。
 * 单独抽出便于用单测锁住「覆盖层优先、不得再开工作区」的接线。
 */
export function forwardNativeFileDrop(
  drop: NativeFileDrop,
  openWorkspace: (path: string) => void,
): void {
  if (routeNativeFileDrop(drop)) {
    return;
  }
  const first = drop.paths[0];
  if (first) {
    openWorkspace(first);
  }
}

/** 测试专用：清空注册表，避免用例间相互污染。 */
export function resetNativeFileDropHandlersForTest(): void {
  handlers.length = 0;
}
