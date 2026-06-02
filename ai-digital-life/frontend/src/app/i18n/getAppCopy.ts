import type { AppInfo } from "@ai-digital-life/kernel";
import type { CopyDict, Locale } from "./types";
import { copy } from "./types";

export function getAppCopy(appInfo?: AppInfo): CopyDict {
  const locale: Locale = appInfo?.config.language === "en-US" ? "en-US" : "zh-CN";
  return copy[locale];
}
