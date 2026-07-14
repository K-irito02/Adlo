import { useTCopy } from '@app/i18n/useTCopy';

export function WeChatPanel() {
  const { t } = useTCopy();
  return (
    <div className="adl-communicate__primary-scroll">
      <div className="adl-communicate__placeholder">
        <div className="adl-communicate__placeholder-icon">
          <svg viewBox="0 0 32 32" width="32" height="32" fill="currentColor" opacity="0.4">
            <path d="M0 13C0 6.96 4.48 2 10 2s10 4.96 10 11-4.48 11-10 11c-1.05 0-2.06-.17-3-.48C5.65 24.88 4.1 26 2 26c.14-.74.28-1.48.42-2.22.13-.74.26-1.48.35-2.22C1.12 19.52 0 16.48 0 13z" />
            <path d="M14.22 21.6c.78-.37 1.62-.84 2.34-1.44A7.5 7.5 0 0 0 20 11c0-.64-.07-1.24-.2-1.82C22.6 11.16 24 14.16 24 17c0 1.78-.8 3.38-2.08 4.5.08.56.18 1.12.3 1.66.14.54.26 1.06.36 1.6-1.54-.66-2.6-1.22-3.78-1.94-.66.22-1.38.34-2.12.34-.42 0-.84-.05-1.24-.14l-.22.38z" />
          </svg>
        </div>
        <h3 className="adl-communicate__placeholder-title">{t.communicateWeChatTitle}</h3>
        <p className="adl-communicate__placeholder-desc">{t.communicateWeChatDesc}</p>
      </div>
    </div>
  );
}
