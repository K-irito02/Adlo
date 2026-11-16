/**
 * PROTOTYPE ONLY — 拖拽反馈样式原型入口。
 *
 * 通过 /prototype/browser-dnd-feedback.html 直接打开；不进入 production 构建。
 */
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.css';
import './feedback/feedback.css';
import { FeedbackPrototype } from './feedback/FeedbackPrototype';

const container = document.getElementById('prototype-root');
if (!container) {
  throw new Error('Prototype root not found.');
}

createRoot(container).render(<FeedbackPrototype />);
