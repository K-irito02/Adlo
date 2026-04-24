import type { WorkspaceTreeNode } from "@ai-digital-life/kernel";

export type FileTreeVisualTone =
  | "default"
  | "typescript"
  | "javascript"
  | "node"
  | "python"
  | "java"
  | "go"
  | "rust"
  | "cfamily"
  | "csharp"
  | "php"
  | "ruby"
  | "swift"
  | "kotlin"
  | "shell"
  | "powershell"
  | "markup"
  | "stylesheet"
  | "json"
  | "yaml"
  | "config"
  | "markdown"
  | "doc"
  | "text"
  | "sheet"
  | "slide"
  | "pdf"
  | "image"
  | "vector"
  | "audio"
  | "video"
  | "font"
  | "archive"
  | "database";

export interface FileKey {
  name: string;
  lowerName: string;
  extension: string;
}

export interface FileTreeVisualSpec {
  kind: "badge";
  label: string;
  tone: FileTreeVisualTone;
}

function makeBadgeSpec(label: string, tone: FileTreeVisualTone): FileTreeVisualSpec {
  return {
    kind: "badge",
    label,
    tone
  };
}

const SPECIAL_FILE_RULES: Array<{
  test: (file: FileKey) => boolean;
  spec: FileTreeVisualSpec;
}> = [
  {
    test: ({ lowerName }) => lowerName === "package.json",
    spec: makeBadgeSpec("PKG", "node")
  },
  {
    test: ({ lowerName }) => lowerName === "dockerfile" || lowerName.startsWith("docker-compose."),
    spec: makeBadgeSpec("DKR", "config")
  },
  {
    test: ({ lowerName }) =>
      lowerName === "makefile" ||
      lowerName === "pnpm-workspace.yaml" ||
      lowerName === "turbo.json" ||
      lowerName === "cargo.toml" ||
      lowerName === "cargo.lock" ||
      lowerName === "composer.json" ||
      lowerName === "composer.lock" ||
      lowerName === "gemfile" ||
      lowerName === "gemfile.lock" ||
      lowerName === "podfile" ||
      lowerName === "podfile.lock" ||
      lowerName === "requirements.txt" ||
      lowerName === "pipfile" ||
      lowerName === "pipfile.lock" ||
      lowerName === "pyproject.toml" ||
      lowerName === "poetry.lock" ||
      lowerName === "go.mod" ||
      lowerName === "go.sum" ||
      lowerName === "package-lock.json" ||
      lowerName === "pnpm-lock.yaml" ||
      lowerName === "yarn.lock" ||
      lowerName === ".gitignore" ||
      lowerName === ".gitattributes" ||
      lowerName === ".gitmodules" ||
      lowerName.startsWith(".env") ||
      lowerName.startsWith(".eslintrc") ||
      lowerName.startsWith("eslint.") ||
      lowerName.startsWith("prettier.") ||
      lowerName.startsWith(".prettierrc") ||
      lowerName.startsWith("tsconfig") ||
      lowerName.startsWith("vite.config.") ||
      lowerName.startsWith("vitest.config.") ||
      lowerName.startsWith("jest.config.") ||
      lowerName.startsWith("rollup.config.") ||
      lowerName.startsWith("webpack.config."),
    spec: makeBadgeSpec("CFG", "config")
  },
  {
    test: ({ lowerName }) => lowerName === "readme" || lowerName.startsWith("readme."),
    spec: makeBadgeSpec("MD", "markdown")
  }
];

const EXTENSION_SPECS = new Map<string, FileTreeVisualSpec>([
  ["ts", makeBadgeSpec("TS", "typescript")],
  ["tsx", makeBadgeSpec("TS", "typescript")],
  ["js", makeBadgeSpec("JS", "javascript")],
  ["jsx", makeBadgeSpec("JS", "javascript")],
  ["mjs", makeBadgeSpec("JS", "javascript")],
  ["cjs", makeBadgeSpec("JS", "javascript")],
  ["mts", makeBadgeSpec("TS", "typescript")],
  ["cts", makeBadgeSpec("TS", "typescript")],
  ["py", makeBadgeSpec("PY", "python")],
  ["ipynb", makeBadgeSpec("NB", "python")],
  ["java", makeBadgeSpec("JV", "java")],
  ["go", makeBadgeSpec("GO", "go")],
  ["rs", makeBadgeSpec("RS", "rust")],
  ["c", makeBadgeSpec("C", "cfamily")],
  ["cc", makeBadgeSpec("C++", "cfamily")],
  ["cpp", makeBadgeSpec("C++", "cfamily")],
  ["h", makeBadgeSpec("H", "cfamily")],
  ["hpp", makeBadgeSpec("H++", "cfamily")],
  ["cs", makeBadgeSpec("C#", "csharp")],
  ["php", makeBadgeSpec("PHP", "php")],
  ["rb", makeBadgeSpec("RB", "ruby")],
  ["swift", makeBadgeSpec("SW", "swift")],
  ["kt", makeBadgeSpec("KT", "kotlin")],
  ["kts", makeBadgeSpec("KT", "kotlin")],
  ["sh", makeBadgeSpec("SH", "shell")],
  ["bash", makeBadgeSpec("SH", "shell")],
  ["zsh", makeBadgeSpec("SH", "shell")],
  ["fish", makeBadgeSpec("SH", "shell")],
  ["ps1", makeBadgeSpec("PS", "powershell")],
  ["psm1", makeBadgeSpec("PS", "powershell")],
  ["psd1", makeBadgeSpec("PS", "powershell")],
  ["bat", makeBadgeSpec("BAT", "powershell")],
  ["cmd", makeBadgeSpec("CMD", "powershell")],
  ["html", makeBadgeSpec("HTML", "markup")],
  ["htm", makeBadgeSpec("HTM", "markup")],
  ["xml", makeBadgeSpec("XML", "markup")],
  ["vue", makeBadgeSpec("VUE", "markup")],
  ["svelte", makeBadgeSpec("SVE", "markup")],
  ["css", makeBadgeSpec("CSS", "stylesheet")],
  ["scss", makeBadgeSpec("SCSS", "stylesheet")],
  ["sass", makeBadgeSpec("SASS", "stylesheet")],
  ["less", makeBadgeSpec("LESS", "stylesheet")],
  ["styl", makeBadgeSpec("STYL", "stylesheet")],
  ["json", makeBadgeSpec("JSON", "json")],
  ["jsonc", makeBadgeSpec("JSON", "json")],
  ["yaml", makeBadgeSpec("YML", "yaml")],
  ["yml", makeBadgeSpec("YML", "yaml")],
  ["toml", makeBadgeSpec("TOML", "config")],
  ["ini", makeBadgeSpec("INI", "config")],
  ["conf", makeBadgeSpec("CONF", "config")],
  ["lock", makeBadgeSpec("LOCK", "config")],
  ["md", makeBadgeSpec("MD", "markdown")],
  ["mdx", makeBadgeSpec("MDX", "markdown")],
  ["txt", makeBadgeSpec("TXT", "text")],
  ["log", makeBadgeSpec("LOG", "text")],
  ["rtf", makeBadgeSpec("RTF", "doc")],
  ["doc", makeBadgeSpec("DOC", "doc")],
  ["docx", makeBadgeSpec("DOC", "doc")],
  ["odt", makeBadgeSpec("ODT", "doc")],
  ["csv", makeBadgeSpec("CSV", "sheet")],
  ["xls", makeBadgeSpec("XLS", "sheet")],
  ["xlsx", makeBadgeSpec("XLS", "sheet")],
  ["ods", makeBadgeSpec("ODS", "sheet")],
  ["ppt", makeBadgeSpec("PPT", "slide")],
  ["pptx", makeBadgeSpec("PPT", "slide")],
  ["odp", makeBadgeSpec("ODP", "slide")],
  ["pdf", makeBadgeSpec("PDF", "pdf")],
  ["png", makeBadgeSpec("IMG", "image")],
  ["jpg", makeBadgeSpec("IMG", "image")],
  ["jpeg", makeBadgeSpec("IMG", "image")],
  ["gif", makeBadgeSpec("GIF", "image")],
  ["webp", makeBadgeSpec("WEBP", "image")],
  ["bmp", makeBadgeSpec("BMP", "image")],
  ["ico", makeBadgeSpec("ICO", "image")],
  ["svg", makeBadgeSpec("SVG", "vector")],
  ["ai", makeBadgeSpec("AI", "vector")],
  ["eps", makeBadgeSpec("EPS", "vector")],
  ["mp3", makeBadgeSpec("AUD", "audio")],
  ["wav", makeBadgeSpec("AUD", "audio")],
  ["flac", makeBadgeSpec("AUD", "audio")],
  ["ogg", makeBadgeSpec("AUD", "audio")],
  ["m4a", makeBadgeSpec("AUD", "audio")],
  ["mp4", makeBadgeSpec("VID", "video")],
  ["mov", makeBadgeSpec("VID", "video")],
  ["webm", makeBadgeSpec("VID", "video")],
  ["mkv", makeBadgeSpec("VID", "video")],
  ["avi", makeBadgeSpec("VID", "video")],
  ["woff", makeBadgeSpec("FNT", "font")],
  ["woff2", makeBadgeSpec("FNT", "font")],
  ["ttf", makeBadgeSpec("FNT", "font")],
  ["otf", makeBadgeSpec("FNT", "font")],
  ["zip", makeBadgeSpec("ZIP", "archive")],
  ["rar", makeBadgeSpec("RAR", "archive")],
  ["7z", makeBadgeSpec("7Z", "archive")],
  ["tar", makeBadgeSpec("TAR", "archive")],
  ["gz", makeBadgeSpec("GZ", "archive")],
  ["tgz", makeBadgeSpec("TGZ", "archive")],
  ["bz2", makeBadgeSpec("BZ2", "archive")],
  ["xz", makeBadgeSpec("XZ", "archive")],
  ["sql", makeBadgeSpec("SQL", "database")],
  ["sqlite", makeBadgeSpec("DB", "database")],
  ["db", makeBadgeSpec("DB", "database")],
  ["sqlite3", makeBadgeSpec("DB", "database")]
]);

function getDefaultLabel(extension: string): string {
  if (!extension) {
    return "FILE";
  }
  const normalized = extension.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return normalized.slice(0, 4) || "FILE";
}

export function getFileKey(name: string, path: string): FileKey {
  const pathSegments = path.split(/[\\/]/);
  const fallbackName = pathSegments[pathSegments.length - 1] ?? name;
  const resolvedName = name || fallbackName;
  const lowerName = resolvedName.toLowerCase();
  const extensionIndex = lowerName.lastIndexOf(".");
  const extension = extensionIndex > 0 ? lowerName.slice(extensionIndex + 1) : "";
  return {
    name: resolvedName,
    lowerName,
    extension
  };
}

export function getFileCategory(file: FileKey): FileTreeVisualTone {
  const specialRule = SPECIAL_FILE_RULES.find((rule) => rule.test(file));
  if (specialRule) {
    return specialRule.spec.tone;
  }
  return EXTENSION_SPECS.get(file.extension)?.tone ?? "default";
}

export function getFileTreeVisualSpec(node: Pick<WorkspaceTreeNode, "name" | "path" | "kind">): FileTreeVisualSpec {
  const file = getFileKey(node.name, node.path);
  const specialRule = SPECIAL_FILE_RULES.find((rule) => rule.test(file));
  if (specialRule) {
    return specialRule.spec;
  }
  return EXTENSION_SPECS.get(file.extension) ?? makeBadgeSpec(getDefaultLabel(file.extension), "default");
}
