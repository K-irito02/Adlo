import { isDownloadUrl } from '@utils/downloadUrl';
import { useAppStore } from '@stores/slicedStore';
import { isLocalViewableFileUrl } from './localFileInput';

export interface WebViewCreationDecision {
  /** 本会话新建（非重启水合）的标签；消费后标记即清除。 */
  isFresh: boolean;
  /** 重启恢复的下载型标签不创建 WebView（避免无意义加载）。 */
  suppressDownload: boolean;
}

/**
 * 消费 fresh 标记并判定是否应跳过 WebView 创建。
 *
 * - 本会话新建的标签（fresh）必须创建 WebView，下载型标签才会触发 DownloadStarting；
 * - 重启水合的空池下载标签跳过创建，等用户主动操作；
 * - 非下载 URL 正常创建。
 *
 * 抽成独立函数是为了让「fresh 消费 + 下载抑制」这条消费链路可被单测覆盖。
 */
export function consumeFreshAndDecideWebViewCreation(
  tabId: string,
  url: string,
): WebViewCreationDecision {
  const isFresh = useAppStore.getState().browserConsumeTabFresh(tabId);
  return {
    isFresh,
    suppressDownload: !isFresh && isDownloadUrl(url) && !isLocalViewableFileUrl(url),
  };
}
