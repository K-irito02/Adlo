import type { CopyDict } from '@i18n/types';
import { formatT } from '@i18n/formatT';
import type { DshTestResult } from '../../../shared/ipc/dsh';

/**
 * 下载源探测失败的可读原因（本地化）。
 *
 * 后端只回传分类（`error_kind`）、脱敏后的代理端点与 HTTP 状态码；原始错误串
 * （如 reqwest 的 `error sending request for url (...)`）只进日志，绝不直接
 * 展示给用户——用户实测 2026-10-30：界面上只看到英文内部错误，无法判断
 * 是代理软件关了还是下载源挂了。
 */

/** 单次探测失败的原因（测试连接按钮 / 自动检测共用）。 */
export function describeProbeFailure(t: CopyDict, result: DshTestResult): string {
  if (result.error_kind === 'proxy_unreachable') {
    return formatT(t, 'dshSettingsTestErrorProxyUnreachable', {
      proxy: result.proxy ?? t.dshSettingsTestErrorUnknown,
    });
  }
  if (result.error_kind === 'http') {
    return formatT(t, 'dshSettingsTestErrorHttp', {
      status: String(result.http_status ?? '-'),
    });
  }
  // 代理可用但请求仍失败：说明是「经代理连不上源」，与纯直连网络错误区分。
  if (result.proxy) {
    return formatT(t, 'dshSettingsTestErrorViaProxy', { proxy: result.proxy });
  }
  return t.dshSettingsTestErrorNetwork;
}

/**
 * 自动检测双源全败时的提示：能归因代理就点名代理端点，否则给通用失败文案。
 * （自动模式下代理不可达已静默回退直连，这里只会出现在手动代理/网络故障时。）
 */
export function describeDetectFailure(
  t: CopyDict,
  results: readonly (DshTestResult | null | undefined)[],
): string {
  const proxy = results.find((result) => result?.error_kind === 'proxy_unreachable')?.proxy ?? null;
  if (proxy) {
    return formatT(t, 'dshSettingsAutoDetectFailedProxy', { proxy });
  }
  return t.dshSettingsAutoDetectFailed;
}
