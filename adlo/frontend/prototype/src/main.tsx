/**
 * PROTOTYPE ONLY — 原型入口。
 *
 * 通过 /prototype/browser-dnd.html 直接打开；不进入 production 的 index.html 构建。
 */
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.css';
import { DndPrototype } from './DndPrototype';

const container = document.getElementById('prototype-root');
if (!container) {
  throw new Error('Prototype root not found.');
}

createRoot(container).render(<DndPrototype />);
