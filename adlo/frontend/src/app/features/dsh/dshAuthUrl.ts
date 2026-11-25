import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n';
import { routeLocalUrl } from '@features/browser/browser-landing/localAuthPorts';

export interface DshAuthUrl {
  url: string;
}

/**
 * 需认证本地端口取真实入口（事项 2 通用分流源）。
 *
 * dsh 0.2.x 起裸 `http://127.0.0.1:3080/` 必 401，必须用进程 stdout 打印的
 * 真实入口 URL（含 `?token=`，首次访问种 cookie）。命中分发表（`routeLocalUrl`）
 * 的 URL 交给 store 的统一解析器 `ensureDshUrl`：
 * - 端口空闲但进程已死 → 自动拉起（延迟 1.2s 给「正在恢复」toast）；
 * - 3080 被占用 → 弹确认框，用户确认后结束占用进程并重启项目内版本。
 *
 * 未命中分发表或用户取消/失败返回 null / `{canceled:true}`。
 *
 * @param t 恢复提示文案（缺省不提示）
 */
export type DshAuthResolution = DshAuthUrl | { canceled: true } | null;

export async function resolveDshAuthUrl(
  inputUrl: string,
  t?: Pick<CopyDict, 'dshRecovering' | 'dshStarting'>,
): Promise<DshAuthResolution> {
  const routed = routeLocalUrl(inputUrl);
  if (routed?.opener !== 'dsh') {
    return null;
  }
  try {
    const data = await useAppStore.getState().ensureDshUrl(t);
    if (data?.canceled) {
      return { canceled: true };
    }
    const url = data?.url?.trim() ?? '';
    if (!url) {
      return null;
    }
    return { url };
  } catch {
    return null;
  }
}
