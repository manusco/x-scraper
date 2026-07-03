#!/usr/bin/env bash
# Resonance entrypoint (vendored, do not edit by hand). Dispatches to the engine.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
engine="$here/.agents/.runtime/resonance_sync.py"
py="$(command -v python3 || command -v python || command -v py || true)"
if [ -z "$py" ]; then echo "resonance: python not found" >&2; exit 0; fi
cmd="${1:-check}"; shift || true
exec "$py" "$engine" "$cmd" --repo "$here" "$@"
