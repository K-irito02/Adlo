export interface EngineReswitchGuardInput {
  /** 当前宿主正在展示的标签 id（中心用中心活动标签，面板用全局面板活动标签）。 */
  activeHostTabId: string | undefined;
  /** 发起引擎切换的目标标签。 */
  sourceTabId: string;
  /** 目标标签在预检落定时的当前 URL。 */
  currentTabUrl: string | undefined;
  /** 点击引擎时的起始 URL。 */
  startUrl: string;
}

/**
 * 异步嵌入预检落定后是否应用引擎切换结果。
 *
 * 只有「目标标签仍是当前宿主展示的标签」且「期间没有发生同标签新导航」时才应用，
 * 避免旧预检结果覆盖用户之后的切标签/导航。
 */
export function shouldApplyEngineReswitch(input: EngineReswitchGuardInput): boolean {
  return input.activeHostTabId === input.sourceTabId && input.currentTabUrl === input.startUrl;
}
