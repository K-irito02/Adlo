import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 读取提交的生成物（属性行是单行 JSON），供「提交数据」级断言使用。 */
function readGeneratedNotices() {
  const file = join(
    HERE,
    "..",
    "frontend",
    "src",
    "app",
    "features",
    "about",
    "thirdPartyNotices.generated.ts",
  );
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((text) => text.startsWith("export const THIRD_PARTY_NOTICES_DATA"));
  assert.ok(line, "generated notices declaration not found");
  return JSON.parse(line.slice(line.indexOf("= ") + 2).replace(/;\s*$/, ""));
}

it("keeps generated notices out of repo-root Prettier", () => {
  // lint-staged runs Prettier from the repo root; the frontend-local ignore
  // file does not apply there. Reformatting the generated declaration breaks
  // the single-line JSON contract above.
  const ignore = readFileSync(join(HERE, "..", "..", ".prettierignore"), "utf8");
  assert.match(ignore, /^adlo\/frontend\/src\/app\/features\/about\/\*\.generated\.ts$/m);
});

import {
  buildNoticeOutput,
  coversLicenseText,
  isSameLicenseBody,
  mergeLicenseCorpus,
  normalizedLicenseBody,
  normalizeNpmLicense,
  normalizeRepositoryUrl,
  parseCargoLock,
  parseLicenseExpression,
  parsePnpmLock,
  partialNpmFailure,
  readCargoManifestFields,
  refusePartialMetadata,
  shouldWriteNpmCache,
  stripLeadingCopyright,
} from "./third-party-notices-lib.mjs";

describe("parseCargoLock", () => {
  it("keeps external packages and drops workspace crates without a source", () => {
    const lock = `
version = 4

[[package]]
name = "adlo"
version = "0.1.0"
dependencies = ["serde"]

[[package]]
name = "serde"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "abc"
`;
    assert.deepEqual(parseCargoLock(lock), [
      {
        name: "serde",
        version: "1.0.0",
        source: "registry+https://github.com/rust-lang/crates.io-index",
      },
    ]);
  });
});

describe("parsePnpmLock", () => {
  it("reads scoped names, prereleases and peer suffixes from snapshots", () => {
    const lock = `lockfileVersion: '9.0'

snapshots:

  '@scope/pkg@1.2.3':
    resolution: {integrity: sha512-x}

  'alpha@2.0.0-beta.1(react@19.0.0)':
    resolution: {integrity: sha512-y}

  beta@3.0.0:
    resolution: {integrity: sha512-z}

packages:

  ignored@1.0.0:
    resolution: {integrity: sha512-q}
`;
    assert.deepEqual(parsePnpmLock(lock), [
      { name: "@scope/pkg", version: "1.2.3" },
      { name: "alpha", version: "2.0.0-beta.1" },
      { name: "beta", version: "3.0.0" },
    ]);
  });
});

describe("parseLicenseExpression", () => {
  it("treats a slash as OR and keeps hyphenated SPDX ids intact", () => {
    assert.deepEqual(parseLicenseExpression("MIT/Apache-2.0"), {
      ids: ["MIT", "Apache-2.0"],
      exceptions: [],
    });
    assert.deepEqual(parseLicenseExpression("MIT OR Apache-2.0 OR LGPL-2.1-or-later"), {
      ids: ["MIT", "Apache-2.0", "LGPL-2.1-or-later"],
      exceptions: [],
    });
  });

  it("handles lowercase operators, parentheses and WITH exceptions", () => {
    assert.deepEqual(parseLicenseExpression("(MIT and ISC)"), {
      ids: ["MIT", "ISC"],
      exceptions: [],
    });
    assert.deepEqual(
      parseLicenseExpression("Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT"),
      {
        ids: ["Apache-2.0", "MIT"],
        exceptions: ["LLVM-exception"],
      },
    );
  });

  it("does not invent ids for non-SPDX npm conventions", () => {
    assert.deepEqual(parseLicenseExpression("SEE LICENSE IN LICENSE.txt").ids, []);
    assert.deepEqual(parseLicenseExpression("UNLICENSED").ids, []);
    assert.deepEqual(parseLicenseExpression("").ids, []);
  });

  it("normalizes the legacy plus suffix to -or-later", () => {
    assert.deepEqual(parseLicenseExpression("GPL-2.0+").ids, ["GPL-2.0-or-later"]);
  });
});

describe("stripLeadingCopyright", () => {
  it("separates the MIT copyright line from the standard body", () => {
    const result = stripLeadingCopyright(
      "MIT License\n\nCopyright (c) 2024 Example\n\nPermission is hereby granted, free of charge…",
    );
    assert.equal(result.copyright, "Copyright (c) 2024 Example");
    assert.ok(result.body.startsWith("MIT License"));
    assert.ok(!result.body.includes("Copyright (c) 2024 Example"));
  });

  it("leaves the Apache appendix copyright example untouched", () => {
    const result = stripLeadingCopyright(
      "Apache License\n\nVersion 2.0, January 2004\n\nCopyright [yyyy] [name of copyright owner]",
    );
    assert.equal(result.copyright, "");
    assert.ok(result.body.includes("Copyright [yyyy] [name of copyright owner]"));
  });

  it("keeps the original when the file is only a copyright line", () => {
    const text = "Copyright (c) 2024 Example";
    assert.deepEqual(stripLeadingCopyright(text), { body: text, copyright: "" });
  });
});

describe("normalizeRepositoryUrl", () => {
  it("normalizes git/ssh shorthand to https roots", () => {
    assert.equal(
      normalizeRepositoryUrl("git+https://github.com/a/b.git"),
      "https://github.com/a/b",
    );
    assert.equal(normalizeRepositoryUrl("git@github.com:a/b.git"), "https://github.com/a/b");
    assert.equal(normalizeRepositoryUrl("github:a/b"), "https://github.com/a/b");
    assert.equal(
      normalizeRepositoryUrl({ url: "ssh://git@github.com/a/b" }),
      "https://github.com/a/b",
    );
  });

  it("drops values that cannot become an https link", () => {
    assert.equal(normalizeRepositoryUrl("not a url"), undefined);
    assert.equal(normalizeRepositoryUrl(""), undefined);
    assert.equal(normalizeRepositoryUrl(null), undefined);
  });
});

describe("normalizeNpmLicense", () => {
  it("accepts string, object and array forms", () => {
    assert.equal(normalizeNpmLicense({ license: "MIT" }), "MIT");
    assert.equal(normalizeNpmLicense({ license: { type: "Apache-2.0" } }), "Apache-2.0");
    assert.equal(normalizeNpmLicense({ licenses: ["MIT", { type: "ISC" }] }), "MIT OR ISC");
    assert.equal(normalizeNpmLicense({}), undefined);
  });
});

describe("readCargoManifestFields", () => {
  it("reads only the [package] section", () => {
    const manifest = `[package]
name = "demo"
license = "MIT OR Apache-2.0"
repository = "https://github.com/a/b"

[dependencies]
license = "ignored"
`;
    assert.deepEqual(readCargoManifestFields(manifest), {
      license: "MIT OR Apache-2.0",
      licenseFile: undefined,
      repository: "https://github.com/a/b",
      homepage: undefined,
    });
  });
});

describe("buildNoticeOutput", () => {
  it("dedupes, sorts, prunes unreferenced texts and counts degradation", () => {
    const pkg = (overrides) => ({
      name: "alpha",
      version: "1.0.0",
      ecosystem: "npm",
      license: "MIT",
      licenseIds: ["MIT"],
      texts: [{ label: "LICENSE", key: "spdx:MIT" }],
      textSource: "package",
      ...overrides,
    });
    const output = buildNoticeOutput({
      packages: [
        pkg({ name: "zeta" }),
        pkg({ name: "alpha", license: "", texts: [], textSource: "none" }),
        pkg({ name: "alpha", ecosystem: "cargo" }),
      ],
      licenseTexts: { "spdx:MIT": "MIT text", "spdx:unused": "unused" },
      sources: { cargoLock: "c1", pnpmLock: "p1" },
    });
    assert.deepEqual(
      output.packages.map((item) => `${item.ecosystem}:${item.name}`),
      ["cargo:alpha", "npm:alpha", "npm:zeta"],
    );
    assert.deepEqual(output.totals, {
      total: 3,
      npm: 2,
      cargo: 1,
      unknownLicense: 1,
      missingText: 1,
    });
    assert.deepEqual(Object.keys(output.licenseTexts), ["spdx:MIT"]);
  });
});

describe("partialNpmFailure", () => {
  it("passes when nothing is missing", () => {
    assert.equal(partialNpmFailure({ offline: false, missingCount: 0, fetchedCount: 0 }), null);
  });

  it("rejects offline or partially resolved metadata", () => {
    assert.match(
      partialNpmFailure({ offline: true, missingCount: 2, fetchedCount: 0 }),
      /offline: 2 npm packages/,
    );
    assert.match(
      partialNpmFailure({ offline: false, missingCount: 2, fetchedCount: 1 }),
      /registry: 1 of 2 npm packages/,
    );
    assert.equal(partialNpmFailure({ offline: false, missingCount: 2, fetchedCount: 2 }), null);
  });
});

describe("mergeLicenseCorpus", () => {
  it("keeps old texts and lets newly fetched entries win", () => {
    assert.deepEqual(
      mergeLicenseCorpus(
        { MIT: { name: "MIT", text: "old" }, ISC: { name: "ISC", text: "keep" } },
        { MIT: { name: "MIT", text: "new" } },
      ),
      {
        MIT: { name: "MIT", text: "new" },
        ISC: { name: "ISC", text: "keep" },
      },
    );
  });
});

describe("coversLicenseText", () => {
  const body = `Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.`;

  it("matches across missing titles, copyright lines and re-wrapping", () => {
    assert.equal(coversLicenseText(`MIT License\n\n${body}`, body), true);
    assert.equal(
      coversLicenseText(`Copyright (c) 2024 Someone\n\n${body.replace(/\n/g, "\n   ")}`, body),
      true,
    );
  });

  it("accepts a bundled file that contains the full text plus a note", () => {
    assert.equal(
      coversLicenseText(
        `${body}\n\nSPDX-License-Identifier: MIT — portions of this file come from elsewhere.`,
        body,
      ),
      true,
    );
    assert.equal(coversLicenseText(`Preamble line.\n\n${body}`, body), true);
  });

  it("does not accept a bare title or short pointer as the full text", () => {
    const canonical = `MIT License\n\n${body}`;
    assert.equal(coversLicenseText("MIT License", canonical), false);
    assert.equal(coversLicenseText("Licensed under MIT. See LICENSE for details.", body), false);
    assert.equal(coversLicenseText("", body), false);
  });

  it("accepts a collection file that embeds the standard text among others", () => {
    const otherLicense = `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
redistributions of source code must retain the above copyright notice and this
list of conditions; redistributions in binary form must reproduce the above
copyright notice in the documentation and/or other materials provided with the
distribution; neither the name of the copyright holder nor the names of its
contributors may be used to endorse or promote products derived from this
software without specific prior written permission.`;
    const collection = `${body}\n\n${otherLicense}`;
    // 标准正文远短于合集文件（<85%），只能由显式包含判定接住。
    assert.equal(
      normalizedLicenseBody(body).length < normalizedLicenseBody(collection).length * 0.85,
      true,
    );
    assert.equal(coversLicenseText(collection, body), true);
    assert.equal(isSameLicenseBody(collection, body), false);
  });

  it("keeps a different license apart", () => {
    const isc = `ISC License

Copyright (c) 2024 Someone

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`;
    assert.equal(coversLicenseText(isc, body), false);
  });
});

describe("refusePartialMetadata", () => {
  it("throws unless partial output is explicitly allowed", () => {
    assert.throws(() => refusePartialMetadata("offline: 2 missing", false), /--allow-partial/);
    assert.equal(refusePartialMetadata("offline: 2 missing", true), true);
    assert.equal(refusePartialMetadata(null, false), false);
  });
});

describe("shouldWriteNpmCache", () => {
  it("never writes during --check and never writes an empty fill", () => {
    assert.equal(shouldWriteNpmCache({ check: true, fetchedCount: 5 }), false);
    assert.equal(shouldWriteNpmCache({ check: false, fetchedCount: 0 }), false);
    assert.equal(shouldWriteNpmCache({ check: false, fetchedCount: 5 }), true);
  });
});

describe("generated notices data", () => {
  it("never lists a body already covered by an earlier text of the same package", () => {
    const data = readGeneratedNotices();
    const offenders = [];
    for (const pkg of data.packages) {
      for (let i = 0; i < pkg.texts.length; i += 1) {
        for (let j = i + 1; j < pkg.texts.length; j += 1) {
          const earlier = data.licenseTexts[pkg.texts[i].key] ?? "";
          const later = data.licenseTexts[pkg.texts[j].key] ?? "";
          if (coversLicenseText(earlier, later)) {
            offenders.push(
              `${pkg.ecosystem}:${pkg.name}@${pkg.version} ${pkg.texts[i].label} covers ${pkg.texts[j].label}`,
            );
          }
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
