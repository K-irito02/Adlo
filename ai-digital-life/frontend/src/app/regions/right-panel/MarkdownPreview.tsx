import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type MarkdownPreviewProps = {
  content: string;
  theme?: "light" | "dark";
};

export function MarkdownPreview({ content, theme = "dark" }: MarkdownPreviewProps) {
  const plugins = useMemo(() => [remarkGfm], []);

  return (
    <div className={`adl-markdown-preview adl-markdown-preview--${theme}`}>
      <ReactMarkdown remarkPlugins={plugins}>{content}</ReactMarkdown>
    </div>
  );
}
