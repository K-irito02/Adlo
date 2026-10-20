import { useAppStore } from '@stores/slicedStore';
import { routeLocalUrl } from '@features/browser/browser-landing/localAuthPorts';

export interface DshAuthUrl {
  url: string;
  freedPort: boolean;
}

/** 调试埋点（事项 5）：用户实测后凭此前缀在 `debug-logs*.txt` 过滤分流链路，移除义务见进度文件。 */
function debugAuth(message: string, detail?: Record<string, unknown>) {
  console.debug('[ADL-DSH-VER]', message, detail ?? {});
}

/**
 * 需认证本地端口取真实入口（事项 2 通用分流源）。
 *
 * dsh 0.2.x 起裸 `http://127.0.0.1:3080/` 必 401，必须用进程 stdout 打印的
 * 真实入口 URL（含 `?token=`，首次访问种 cookie）。命中分发表（`routeLocalUrl`）
 * 的 URL 经后端 `/dsh/open` 取真实地址（已运行复用、不重 spawn；残留占用则
 * 释放并重拉）；未命中或失败返回 null，调用方按原逻辑裸开（用户仍可看到
 * 服务本身或 dsh 的 401 指引页）。
 */
export async function resolveDshAuthUrl(inputUrl: string): Promise<DshAuthUrl | null> {
  const routed = routeLocalUrl(inputUrl);
  if (routed?.opener !== 'dsh') {
    return null;
  }
  debugAuth('authUrl: routed to dsh, resolving via backend', { inputUrl });
  try {
    const res = await window.digitalLife.dsh.open();
    if (!res.ok) {
      debugAuth('authUrl: backend open failed', {});
      return null;
    }
    const url = res.data?.url?.trim() ?? '';
    if (!url) {
      debugAuth('authUrl: backend returned empty url', {});
      return null;
    }
    const freedPort = res.data?.freedPort ?? false;
    debugAuth('authUrl: resolved', { freedPort });
    return { url, freedPort };
  } catch (e) {
    debugAuth('authUrl: threw', { error: String(e) });
    return null;
  }
}

/**
 * 残留端口释放告知（与入口页 `DSH_FREED_PORT` 卡片同义的 toast 轻量版）。
 * `t` 由各调用点传入（均为全量 copy，`dshPortFreed` 必存在；禁止硬编码文案）。
 */
export function notifyDshFreedPort(t: Record<string, string>) {
  useAppStore.getState().showToast(t.dshPortFreed, 'warning');
}
