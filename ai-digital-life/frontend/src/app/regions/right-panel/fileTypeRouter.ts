export type FileCategory =
  | "code"
  | "markdown"
  | "text"
  | "docx"
  | "pdf"
  | "binary";

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs",
  "json", "yaml", "yml",
  "html", "htm", "css", "scss", "less",
  "sql", "py", "rs", "xml", "svg",
  "sh", "bash", "zsh", "fish",
  "toml", "ini", "cfg", "conf",
  "gitignore", "env", "dockerfile",
  "c", "cpp", "h", "hpp",
  "go", "java", "kt", "swift",
  "rb", "php", "lua", "vim",
]);

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
  "mp3", "mp4", "wav", "avi", "mov", "mkv", "webm",
  "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
  "exe", "dll", "so", "dylib",
  "woff", "woff2", "ttf", "eot", "otf",
]);

export function categorizeFile(filePath: string | undefined): FileCategory {
  if (!filePath) return "text";
  const segments = filePath.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) {
    const lowerName = fileName.toLowerCase();
    if (lowerName === "dockerfile" || lowerName === "makefile" || lowerName === "license") return "code";
    return "text";
  }
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "pdf") return "pdf";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  return "text";
}
