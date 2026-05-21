/**
 * useStreamingText - 高性能流式文本 Hook
 * 使用 requestAnimationFrame 批量合并高频 delta 事件，
 * 避免每次 delta 都触发 Zustand Store 更新和组件重渲染。
 */
import { useRef, useState, useEffect, useCallback } from "react";

export function useStreamingText(runId?: string) {
  const [text, setText] = useState("");
  const bufferRef = useRef("");
  const rafRef = useRef<number>(0);

  const flush = useCallback(() => {
    if (bufferRef.current) {
      setText(bufferRef.current);
    }
    rafRef.current = 0;
  }, []);

  useEffect(() => {
    if (!runId) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setText("");
      bufferRef.current = "";
      return;
    }

    bufferRef.current = "";
    setText("");

    const unsubscribe = window.digitalLife.subscribeModelStream((event) => {
      if (event.v !== 1) return;
      if (event.type === "delta") {
        if (event.runId !== runId) return;
        bufferRef.current += event.text;

        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flush);
        }
      }
      if (event.type === "done") {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        if (bufferRef.current) {
          setText(bufferRef.current);
        }
        bufferRef.current = "";
      }
    });

    return () => {
      unsubscribe();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [runId, flush]);

  return text;
}