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

export function getLanguageExtension(languageId: string): Extension[] {
  switch (languageId) {
    case "typescript":
      return [javascript({ typescript: true, jsx: true })];
    case "javascript":
      return [javascript({ jsx: true })];
    case "json":
      return [json()];
    case "yaml":
      return [yaml()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "markdown":
      return [markdown()];
    case "sql":
      return [sql()];
    case "python":
      return [python()];
    case "rust":
      return [rust()];
    case "xml":
      return [xml()];
    default:
      return [];
  }
}
