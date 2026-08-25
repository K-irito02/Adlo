import { BrowserPerformanceSettings } from './BrowserPerformanceSettings';
import { BrowserDownloadSettings } from './BrowserDownloadSettings';

export function BrowserSettings() {
  return (
    <>
      <BrowserPerformanceSettings />
      <BrowserDownloadSettings />
    </>
  );
}
