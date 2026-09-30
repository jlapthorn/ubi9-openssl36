#!/bin/bash
set -euo pipefail

UUID="netbird@jlapthor"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v gnome-extensions &>/dev/null; then
    echo "Error: gnome-extensions not found. Is GNOME Shell installed?"
    exit 1
fi

if ! command -v netbird &>/dev/null; then
    echo "Error: netbird not found. Install NetBird first."
    exit 1
fi

echo "Installing NetBird GNOME extension to ${EXT_DIR}..."
mkdir -p "${EXT_DIR}"
cp "${SCRIPT_DIR}/extension.js" "${EXT_DIR}/"
cp "${SCRIPT_DIR}/metadata.json" "${EXT_DIR}/"
cp "${SCRIPT_DIR}/stylesheet.css" "${EXT_DIR}/"

echo "Enabling extension..."
if gnome-extensions enable "${UUID}" 2>/dev/null; then
    echo "Done! The NetBird tile should now appear in Quick Settings."
else
    echo "Extension installed but could not be enabled automatically."
    echo ""
    echo "On Wayland you need to log out and back in, then run:"
    echo "  gnome-extensions enable ${UUID}"
fi
