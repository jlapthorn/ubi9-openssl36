#!/bin/bash
set -euo pipefail

UUID="netbird@jlapthor"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "Disabling NetBird GNOME extension..."
gnome-extensions disable "${UUID}" 2>/dev/null || true

echo "Removing ${EXT_DIR}..."
rm -rf "${EXT_DIR}"

echo "Done. Log out and back in to fully unload the extension."
