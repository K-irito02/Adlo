import { makeFilledStroked } from './helper';

/**
 * 「增加终端」图标：256 viewBox 的方形加号（Phosphor 风格 outline）。
 * 用 `makeFilledStroked` 叠加同色描边，避免大 viewBox 线框路径在小尺寸下发虚。
 */
export const IconAddTerminal = makeFilledStroked(
  '0 0 256 256',
  4,
  <path d="M208,36H48A12,12,0,0,0,36,48V208a12,12,0,0,0,12,12H208a12,12,0,0,0,12-12V48A12,12,0,0,0,208,36Zm4,172a4,4,0,0,1-4,4H48a4,4,0,0,1-4-4V48a4,4,0,0,1,4-4H208a4,4,0,0,1,4,4Zm-40-80a4,4,0,0,1-4,4H132v36a4,4,0,0,1-8,0V132H88a4,4,0,0,1,0-8h36V88a4,4,0,0,1,8,0v36h36A4,4,0,0,1,172,128Z" />,
);
