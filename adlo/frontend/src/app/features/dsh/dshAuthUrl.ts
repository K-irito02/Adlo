import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n';
import { routeLocalUrl } from '@features/browser/browser-landing/localAuthPorts';

export interface DshAuthUrl {
  url: string;
  freedPort: boolean;
}

/**
 * 需认证本地端口取真实入口（事项 2 通用分流源）。
 *
 * dsh 0.2.x 起裸 `http://127.0.0.1:3080/` 必 401，必须用进程 stdout 打印的
 * 真实入口 URL（含 `?token=`，首次访问种 cookie）。命中分发表（`routeLocalUrl`）
 * 的 URL 经后端 `/dsh/open` 取真实地址：已托管实例直接复用；外部实例无 token 时
 * 后端会**尝试重启一次**以捕获认证入口。失败时回落原始 URL：外部实例仍在时由
 * dsh 展示 401 指引，已被重启流程终止时由浏览器显示连接错误。
 * 未命中或失败返回 null，调用方按原逻辑裸开。
 */
export async function resolveDshAuthUrl(inputUrl: string): Promise<DshAuthUrl | null> {
  const routed = routeLocalUrl(inputUrl);
  if (routed?.opener !== 'dsh') {
    return null;
  }
  try {
    const res = await window.digitalLife.dsh.open();
    if (!res.ok) {
      return null;
    }
    const url = res.data?.url?.trim() ?? '';
    if (!url) {
      return null;
    }
    const freedPort = res.data?.freedPort ?? false;
    return { url, freedPort };
  } catch {
    return null;
  }
}

/**
 * 残留端口释放告知（与入口页 `DSH_FREED_PORT` 卡片同义的 toast 轻量版）。
 * 类型收紧为所需单 key（R1-LOW）：调用方传全量 copy 即满足，缺 key 时直接
 * 跳过，避免 `undefined` 进 toast；禁止硬编码文案。
 */
export function notifyDshFreedPort(t: Pick<CopyDict, 'dshPortFreed'>) {
  if (!t.dshPortFreed) {
    return;
  }
  useAppStore.getState().showToast(t.dshPortFreed, 'warning');
}
