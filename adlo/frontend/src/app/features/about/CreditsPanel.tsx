import { useId, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { IconChevronDown, IconChevronUp, IconList } from '../../icons';
import { THIRD_PARTY_NAMES } from './creditsNames';

/**
 * 「致谢」弹窗正文：一封克制、简短的感谢信 + 折叠的第三方名称索引。
 *
 * 感谢信是 A 布局的最终内容（A2 · 克制）：居中、衬线称呼、两段短正文与落款；
 * 逐项许可与版本仍在「第三方声明」，这里不重复。名称索引按名称去重、排序，
 * 展开后以 `·` 分隔流式换行。
 */
export function CreditsPanel() {
  const { t } = useTCopy();
  const [open, setOpen] = useState(false);
  const namesId = useId();

  return (
    <div className="adl-about-credits adl-about-credits--letter">
      <div className="adl-about-credits__letter">
        <p className="adl-about-credits__eyebrow">{t.aboutCreditsEyebrow}</p>
        <h3 className="adl-about-credits__salutation">{t.aboutCreditsSalutation}</h3>
        <p className="adl-about-credits__body">{t.aboutCreditsLetterBody}</p>
        <p className="adl-about-credits__body">{t.aboutCreditsLetterThanks}</p>
        <p className="adl-about-credits__signature">{t.aboutCreditsSignature}</p>
      </div>

      <p className="adl-about-credits__trademark">{t.aboutCreditsTrademarkNote}</p>

      <section className="adl-about-credits__names" aria-label={t.aboutCreditsThirdPartyNames}>
        <button
          type="button"
          className="adl-about-credits__names-toggle"
          aria-expanded={open}
          aria-controls={namesId}
          onClick={() => setOpen((value) => !value)}
        >
          <IconList size={14} decorative />
          <span>{t.aboutCreditsThirdPartyNames}</span>
          <span className="adl-about-credits__names-count">{THIRD_PARTY_NAMES.length}</span>
          {open ? <IconChevronUp size={14} decorative /> : <IconChevronDown size={14} decorative />}
        </button>
        <p id={namesId} className="adl-about-credits__names-list" hidden={!open}>
          {THIRD_PARTY_NAMES.join(' · ')}
        </p>
      </section>
    </div>
  );
}
