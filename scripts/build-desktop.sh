#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== FOLIO Mapper Desktop Build ==="

# Step 1: Build web frontend
echo ""
echo "--- Step 1/4: Building web frontend ---"
cd "$ROOT_DIR"
pnpm build

# Step 2: Build Python backend with PyInstaller
echo ""
echo "--- Step 2/4: Building backend with PyInstaller ---"
cd "$ROOT_DIR/backend"
if [ ! -d ".venv" ]; then
    echo "ERROR: backend/.venv not found. Create it first."
    exit 1
fi
.venv/bin/pip install pyinstaller --quiet
.venv/bin/pyinstaller folio-mapper.spec --noconfirm --clean

# Step 3: Compile Electron TypeScript
echo ""
echo "--- Step 3/4: Compiling Electron app ---"
cd "$ROOT_DIR/apps/desktop"
npx tsc

# Step 4: Build Electron installer
echo ""
echo "--- Step 4/4: Building Electron installer ---"
npx electron-builder --win

echo ""
echo "=== Build complete! ==="
echo "Installer: apps/desktop/release/"
