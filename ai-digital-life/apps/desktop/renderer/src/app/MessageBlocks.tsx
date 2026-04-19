import React from "react";
import type { ConversationMessageRecord } from "@ai-digital-life/kernel";

export function MessageBlocks({ message }: { message: ConversationMessageRecord }) {
  return (
    <div className="adl-message-blocks">
      {message.blocks.map((block) => {
        if (block.type === "plan") {
          return (
            <section key={block.id} className="adl-block adl-block--plan">
              <h4>{block.title}</h4>
              <ul>
                {block.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        }

        if (block.type === "patch-summary") {
          return (
            <section key={block.id} className="adl-block adl-block--patch">
              <h4>Patch</h4>
              <p>{block.summary}</p>
              <p>
                {block.fileCount} files / {block.hunkCount} hunks
              </p>
            </section>
          );
        }

        if (block.type === "tool-call") {
          return (
            <section key={block.id} className="adl-block adl-block--tool">
              <h4>Tool</h4>
              <p>{block.toolName}</p>
              <p>{block.summary}</p>
              <span className="adl-pill adl-pill--muted">{block.status}</span>
            </section>
          );
        }

        if (block.type === "validation-result") {
          return (
            <section key={block.id} className="adl-block adl-block--validation">
              <h4>Validation</h4>
              <p>{block.summary}</p>
              <span className="adl-pill adl-pill--muted">{block.status}</span>
              {block.diagnostics.length ? (
                <ul>
                  {block.diagnostics.map((diagnostic) => (
                    <li key={diagnostic.id}>
                      <strong>{diagnostic.source}</strong>
                      <span>{diagnostic.path ? ` ${diagnostic.path}` : ""}</span>
                      <span>{diagnostic.line ? `:${diagnostic.line}` : ""}</span>
                      <span> {diagnostic.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        }

        if (block.type === "final-summary") {
          return (
            <section key={block.id} className="adl-block adl-block--summary">
              <p>{block.summary}</p>
            </section>
          );
        }

        if (block.type === "markdown") {
          return (
            <section key={block.id} className="adl-block adl-block--markdown">
              <p>{block.text}</p>
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}
