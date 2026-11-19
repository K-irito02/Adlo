import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildNoticeOutput,
  normalizeNpmLicense,
  normalizeRepositoryUrl,
  parseCargoLock,
  parseLicenseExpression,
  parsePnpmLock,
  readCargoManifestFields,
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
      normalized: "MIT/Apache-2.0",
    });
    assert.deepEqual(parseLicenseExpression("MIT OR Apache-2.0 OR LGPL-2.1-or-later"), {
      ids: ["MIT", "Apache-2.0", "LGPL-2.1-or-later"],
      exceptions: [],
      normalized: "MIT OR Apache-2.0 OR LGPL-2.1-or-later",
    });
  });

  it("handles lowercase operators, parentheses and WITH exceptions", () => {
    assert.deepEqual(parseLicenseExpression("(MIT and ISC)"), {
      ids: ["MIT", "ISC"],
      exceptions: [],
      normalized: "(MIT and ISC)",
    });
    assert.deepEqual(
      parseLicenseExpression("Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT"),
      {
        ids: ["Apache-2.0", "MIT"],
        exceptions: ["LLVM-exception"],
        normalized: "Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT",
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
