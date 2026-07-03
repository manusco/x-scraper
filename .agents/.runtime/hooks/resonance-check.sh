#!/usr/bin/env bash
# Resonance advisory check (vendored). Never blocks; always exits 0.
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
engine="$root/.agents/.runtime/resonance_sync.py"
py="$(command -v python3 || command -v python || command -v py || true)"
[ -z "$py" ] && exit 0
[ -f "$engine" ] || exit 0
"$py" "$engine" check --repo "$root" 2>/dev/null || true
exit 0
