/**
 * 生成预览面夹具（极小 docx / pdf + 带 frontmatter 的 md）。
 *
 * 为什么不用真实文档：仓库不提交用户文档，预览验证需要稳定、可重复、体积小的样本。
 * 这里用 Node 直接写 stored（无压缩）ZIP 与手写 PDF，不引入第三方依赖。
 *
 * 用法：pnpm --dir adlo run fixtures:preview
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../frontend/src/test-fixtures/preview");

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------- 最小 OOXML docx（stored ZIP） ----------
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.data, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, eocd]);
}

function buildDocx() {
  const paragraphs = Array.from(
    { length: 12 },
    (_, index) =>
      `<w:p><w:r><w:t>Preview fixture paragraph ${index + 1}. Scroll to verify the persistent scrollbar.</w:t></w:r></w:p>`,
  ).join("");

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;

  return buildZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: relationships },
    { name: "word/document.xml", data: document },
  ]);
}

// ---------- 最小多页 PDF ----------
function buildPdf() {
  const pageCount = 2;
  const objects = [];
  // 1 Catalog, 2 Pages, then per page: Page + Contents, last: Font
  const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);

  for (let index = 0; index < pageCount; index += 1) {
    const contentObject = 4 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pageCount * 2} 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    const stream = `BT /F1 24 Tf 72 760 Td (Preview fixture - page ${index + 1} of ${pageCount}) Tj ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
  }

  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  let position = chunks[0].length;

  objects.forEach((body, index) => {
    offsets[index + 1] = position;
    const chunk = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    chunks.push(chunk);
    position += chunk.length;
  });

  const xrefStart = position;
  const xrefLines = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
    "",
  ];
  chunks.push(Buffer.from(xrefLines.join("\n"), "latin1"));
  return Buffer.concat(chunks);
}

// ---------- frontmatter 示例 ----------
const frontmatter = `---
name: preview-fixture
description: 预览面夹具：验证属性表的通用键值渲染与列表 chip。
tags: [preview, fixture, markdown]
globs:
  - "**/*.ts"
  - "**/*.tsx"
allowed-tools: Read, Edit
alwaysApply: true
version: 1.0.0
---

# 预览夹具

用于人工/自动化验证 Markdown 预览的属性表、列表 chip、长值换行与检索跳转行号。
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "frontmatter.md"), frontmatter, "utf8");
writeFileSync(path.join(outDir, "sample.docx"), buildDocx());
writeFileSync(path.join(outDir, "sample.pdf"), buildPdf());
console.log(`Preview fixtures written to ${outDir}`);
