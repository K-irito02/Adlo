import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { xml } from "@codemirror/lang-xml";

const languageExtensionMap: Record<string, () => Extension[]> = {
  typescript: () => [javascript({ typescript: true, jsx: true })],
  javascript: () => [javascript({ jsx: true })],
  json: () => [json()],
  yaml: () => [yaml()],
  config: () => [yaml()],
  html: () => [html()],
  vue: () => [html()],
  css: () => [css()],
  markdown: () => [markdown()],
  sql: () => [sql()],
  python: () => [python()],
  rust: () => [rust()],
  xml: () => [xml()],
};

export function getLanguageExtension(languageId: string): Extension[] {
  const factory = languageExtensionMap[languageId];
  return factory ? factory() : [];
}
