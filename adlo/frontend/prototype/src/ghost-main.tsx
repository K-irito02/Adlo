/**
 * PROTOTYPE ONLY — 抬起副本（drag ghost）样式原型入口。
 *
 * 通过 /prototype/browser-dnd-ghost.html 直接打开；不进入 production 构建。
 */
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.css';
import './feedback/feedback.css';
import './ghost/ghost.css';
import { GhostPrototype } from './ghost/GhostPrototype';

const container = document.getElementById('prototype-root');
if (!container) {
  throw new Error('Prototype root not found.');
}

createRoot(container).render(<GhostPrototype />);
