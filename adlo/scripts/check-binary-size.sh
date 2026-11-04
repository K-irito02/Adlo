#!/usr/bin/env bash
set -euo pipefail

echo "=== Binary Size Analysis ==="

if ! command -v cargo-bloat &> /dev/null; then
    echo "Installing cargo-bloat..."
    cargo install cargo-bloat
fi

cd "$(dirname "$0")/../"

echo ""
echo "--- Top 20 crates by size ---"
cargo bloat --release --crates 2>/dev/null | head -20 || echo "(run 'cargo build --release' first)"

echo ""
echo "--- Release binary size ---"
ls -lh target/release/adlo.exe 2>/dev/null || ls -lh target/release/adlo 2>/dev/null || echo "Binary not found. Run 'cargo build --release' first."

echo ""
echo "--- Workspace dependency count ---"
cargo metadata --format-version=1 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"packages\"])} packages')" 2>/dev/null || echo "(requires python3)"
