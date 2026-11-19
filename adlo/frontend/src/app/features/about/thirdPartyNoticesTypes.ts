/**
 * 第三方声明生成数据的契约。
 *
 * 数据由 `adlo/scripts/generate-third-party-notices.mjs` 生成；
 * 这里的类型是手写真源，生成器只消费不修改。
 */

export type NoticeEcosystem = 'cargo' | 'npm';

/** 正文来源：随包文件 / 内嵌标准正文 / 两者都没有。 */
export type NoticeTextSource = 'package' | 'canonical' | 'none';

export interface ThirdPartyNoticeTextRef {
  /** 展示用标签：随包文件名，或 SPDX id。 */
  label: string;
  /** `licenseTexts` 的键（内容寻址，同文只存一份）。 */
  key: string;
}

export interface ThirdPartyNoticePackage {
  name: string;
  version: string;
  ecosystem: NoticeEcosystem;
  /** 上游许可证原文（SPDX 表达式或 `SEE LICENSE IN …`）；缺失为空串。 */
  license: string;
  /** 从表达式拆出的 SPDX id，用于过滤与标准正文回退。 */
  licenseIds: string[];
  /** 归一后的仓库/主页地址。 */
  url?: string;
  /** 随包许可文件开头剥出的版权行。 */
  copyright?: string;
  texts: ThirdPartyNoticeTextRef[];
  textSource: NoticeTextSource;
}

export interface ThirdPartyNoticeTotals {
  total: number;
  npm: number;
  cargo: number;
  unknownLicense: number;
  missingText: number;
}

export interface ThirdPartyNoticeData {
  schemaVersion: 1;
  sources: {
    cargoLock: string;
    pnpmLock: string;
  };
  totals: ThirdPartyNoticeTotals;
  licenseTexts: Record<string, string>;
  packages: ThirdPartyNoticePackage[];
}
