#!/usr/bin/env python3
"""
Resonance Sync — one-way updater for the Resonance skill stack.

Flow (always one direction):

    PUBLIC Resonance  +  PRIVATE pack   ->   this repo
    (github.com/manusco/resonance)          (.agents/skills, .claude/skills, AGENTS.md)

Nothing ever flows back up. The engine only reads the sources and writes the
framework payload into a target repo. It never touches .resonance/ memory
(soul, state, decisions, learnings), the app code, or .claude/settings.local.json.

Commands:
    sync    Refresh the framework payload in a repo and stamp the lock file.
    check   Advisory only: is a newer source available? Prints one line, exits 0.
    init    One-time setup in a repo: default config, git hooks, Claude hook, then sync.

Source resolution order (public, then private the same way with a different name):
    1. --public / --private argument
    2. env RESONANCE_PUBLIC_MIRROR / RESONANCE_PRIVATE_PACK
    3. ~/.resonance/machine.json  { "publicMirror": "...", "privatePack": "..." }
    4. sibling of the repo:  <repo>/../Resonance  and  <repo>/../resonance-private
    5. git clone/pull the configured remote into ~/.resonance/cache/<kind>

The private layer is optional. If includePrivate is true but no private source
resolves, sync warns and continues with the public layer only (never fails on it).

Pure standard library. Cross-platform (Windows / macOS / Linux).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ENGINE_ID = "resonance-sync/1.0"

# Files/dirs the engine owns in a target repo. Everything else is off limits.
LOCK_NAME = ".resonance-lock.json"
CONFIG_REL = ".resonance/sync.config.json"
RUNTIME_REL = ".agents/.runtime"

# tool key -> (public shim dir, repo target dir, private shim subdir under pack/shims)
TOOL_MAP = {
    "claude-code": (".claude/skills", ".claude/skills", "claude-code"),
    "cursor": (".cursor/skills", ".cursor/skills", "cursor"),
    "codex": (".codex/prompts", ".codex/prompts", "codex"),
    "opencode": (".opencode/command", ".opencode/command", "opencode"),
}

DEFAULT_CONFIG = {
    "tools": ["claude-code"],
    "includePrivate": True,
    "public": {"remote": "https://github.com/manusco/resonance.git", "ref": None},
    "private": {"remote": None, "ref": None},
}


# --------------------------------------------------------------------------- io

def log(msg: str = "") -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(f"resonance: {msg}", file=sys.stderr, flush=True)


def read_json(p: Path) -> dict | None:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json(p: Path, data: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def git(args: list[str], cwd: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=True
        )
        return out.stdout.strip()
    except Exception:
        return None


def head_sha(path: Path) -> str | None:
    return git(["rev-parse", "HEAD"], path)


def source_version(path: Path) -> str | None:
    v = path / "VERSION"
    if v.exists():
        return v.read_text(encoding="utf-8").strip()
    pkg = read_json(path / "package.json")
    if pkg and "version" in pkg:
        return pkg["version"]
    return None


# --------------------------------------------------------------------- fs utils

def _remove_dir(dst: Path) -> None:
    """Remove a directory, tolerating Windows file locks (unlink files first)."""
    if not dst.exists():
        return
    for f in sorted(dst.rglob("*"), reverse=True):
        try:
            f.unlink() if f.is_file() or f.is_symlink() else f.rmdir()
        except OSError:
            pass
    try:
        dst.rmdir()
    except OSError:
        pass


def replace_dir(src: Path, dst: Path) -> int:
    """Delete-then-copy: dst is fully replaced by src. Returns files copied.

    Clear existing files first (so skills renamed or removed upstream do not
    linger as ghosts the agent would still read), tolerating Windows file locks,
    then copy over with dirs_exist_ok so a directory that will not delete
    immediately on Windows does not abort the sync. Same pattern the Forge uses.
    """
    if dst.exists():
        for f in sorted(dst.rglob("*"), reverse=True):
            try:
                if f.is_file() or f.is_symlink():
                    f.unlink()
                elif f.is_dir():
                    f.rmdir()
            except OSError:
                pass
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst, dirs_exist_ok=True)
    return sum(1 for _ in dst.rglob("*") if _.is_file())


def overlay_dir(src: Path, dst: Path) -> int:
    """Copy src on top of dst without deleting dst first (for the private layer)."""
    if not src.exists():
        return 0
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst, dirs_exist_ok=True)
    return sum(1 for _ in src.rglob("*") if _.is_file())


def count_skills(skills_root: Path) -> int:
    return sum(1 for _ in skills_root.rglob("SKILL.md")) if skills_root.exists() else 0


def _migrate_old_layout(repo: Path) -> None:
    """Remove a pre-2.2 Resonance install under `.agent/` (singular), which the new
    `.agents/` + `.claude/skills` layout replaces. Careful by default: if anything
    under `.agent/` is uncommitted, leave it untouched and warn, so in-progress work
    is never destroyed. Only removes the Resonance-owned subdirs, not the whole dir."""
    old = repo / ".agent"
    if not (old / "skills").is_dir():
        return
    if git(["status", "--porcelain", "--", ".agent"], repo):
        warn("old .agent/ layout has uncommitted changes; leaving it. "
             "Commit or discard that work, then re-sync to migrate.")
        return
    shutil.rmtree(old, ignore_errors=True)
    if old.exists():
        _remove_dir(old)  # second pass for anything rmtree could not remove
    log("migrated: removed old .agent/ (singular) layout"
        + ("" if not old.exists() else " (some files locked; residue left)"))


# ----------------------------------------------------------------- source solve

def machine_config() -> dict:
    return read_json(Path.home() / ".resonance" / "machine.json") or {}


def resolve_source(kind: str, repo: Path, cfg: dict, override: str | None):
    """kind in {'public','private'}. Returns (path, ref, version) or None."""
    mc = machine_config()
    env_key = "RESONANCE_PUBLIC_MIRROR" if kind == "public" else "RESONANCE_PRIVATE_PACK"
    mc_key = "publicMirror" if kind == "public" else "privatePack"
    sibling = "Resonance" if kind == "public" else "resonance-private"

    candidates: list[Path] = []
    if override:
        candidates.append(Path(override))
    if os.environ.get(env_key):
        candidates.append(Path(os.environ[env_key]))
    if mc.get(mc_key):
        candidates.append(Path(mc[mc_key]))
    candidates.append(repo.parent / sibling)

    for c in candidates:
        try:
            if c and c.is_dir():
                c = c.resolve()
                return c, head_sha(c), source_version(c)
        except Exception:
            continue

    # last resort: clone/pull the configured remote into the cache
    remote = (cfg.get(kind) or {}).get("remote")
    if remote:
        cache = Path.home() / ".resonance" / "cache" / kind
        cache.parent.mkdir(parents=True, exist_ok=True)
        if (cache / ".git").exists():
            git(["fetch", "--depth", "1", "origin"], cache)
            git(["reset", "--hard", "origin/HEAD"], cache)
        else:
            _remove_dir(cache)
            if git(["clone", "--depth", "1", remote, str(cache)], cache.parent) is None:
                return None
        if (cache / ".git").exists():
            return cache, head_sha(cache), source_version(cache)
    return None


# --------------------------------------------------------------------- commands

def load_config(repo: Path) -> dict:
    cfg = read_json(repo / CONFIG_REL)
    if not cfg:
        return json.loads(json.dumps(DEFAULT_CONFIG))
    # shallow-merge onto defaults so missing keys are safe
    merged = json.loads(json.dumps(DEFAULT_CONFIG))
    merged.update(cfg)
    for k in ("public", "private"):
        base = json.loads(json.dumps(DEFAULT_CONFIG[k]))
        base.update(cfg.get(k) or {})
        merged[k] = base
    return merged


def do_sync(repo: Path, cfg: dict, args) -> int:
    pub = resolve_source("public", repo, cfg, args.public)
    if not pub:
        warn("no public Resonance source found (sibling, env, machine.json, or remote). Cannot sync.")
        return 1
    pub_path, pub_ref, pub_ver = pub
    log(f"public source : {pub_path}  (ref {pub_ref or 'n/a'}, v{pub_ver or '?'})")

    priv = None
    if cfg.get("includePrivate") and not args.no_private:
        priv = resolve_source("private", repo, cfg, args.private)
        if priv:
            log(f"private source: {priv[0]}  (ref {priv[1] or 'n/a'}, v{priv[2] or '?'})")
        else:
            warn("includePrivate is true but no private pack resolved; continuing with public only.")

    if args.dry_run:
        log("(dry-run) no files written.")
        return 0

    # --- migrate: retire any pre-2.2 .agent/ (singular) layout first ----------
    _migrate_old_layout(repo)

    # --- skills: delete-then-copy public, then overlay private ----------------
    skills_dst = repo / ".agents" / "skills"
    pub_skills = pub_path / ".agents" / "skills"
    if not pub_skills.is_dir():
        warn(f"public source has no .agents/skills at {pub_skills}")
        return 1
    n_pub = replace_dir(pub_skills, skills_dst)
    n_priv = 0
    if priv:
        n_priv = overlay_dir(priv[0] / "skills", skills_dst)

    # --- tool shims -----------------------------------------------------------
    tools = cfg.get("tools") or ["claude-code"]
    for tool in tools:
        if tool not in TOOL_MAP:
            warn(f"unknown tool '{tool}' in config; skipping.")
            continue
        pub_shim_rel, repo_shim_rel, priv_shim_sub = TOOL_MAP[tool]
        pub_shim = pub_path / pub_shim_rel
        if pub_shim.is_dir():
            replace_dir(pub_shim, repo / repo_shim_rel)
        else:
            warn(f"public source missing shims for '{tool}' ({pub_shim_rel}); "
                 f"run forge in the mirror. Skipping {tool}.")
        if priv:
            overlay_dir(priv[0] / "shims" / priv_shim_sub, repo / repo_shim_rel)

    # --- identity + entrypoints ----------------------------------------------
    agents_md = pub_path / "AGENTS.md"
    if agents_md.exists():
        shutil.copy2(agents_md, repo / "AGENTS.md")

    _write_runtime(repo)

    # --- lock -----------------------------------------------------------------
    lock = {
        "engine": ENGINE_ID,
        "syncedAt": _dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "public": {"source": str(pub_path), "ref": pub_ref, "version": pub_ver},
        "private": (
            {"source": str(priv[0]), "ref": priv[1], "version": priv[2]} if priv else None
        ),
        "tools": tools,
        "skills": {
            "total": count_skills(skills_dst),
            "public": count_skills(pub_skills),
            "private": count_skills(priv[0] / "skills") if priv else 0,
        },
    }
    write_json(repo / ".resonance" / LOCK_NAME, lock)

    log("")
    log(f"synced {lock['skills']['total']} skills "
        f"({'public+private' if priv else 'public only'}) into {repo.name}")
    log(f"stamp  -> .resonance/{LOCK_NAME}")
    return 0


def do_check(repo: Path, cfg: dict, args) -> int:
    """Advisory. Compares the stamped ref against the currently available source.
    Never blocks: always exits 0. Uses only local sources (no network)."""
    lock = read_json(repo / ".resonance" / LOCK_NAME)
    if not lock:
        log("resonance: not initialised in this repo. Run: resonance init")
        return 0
    pub = resolve_source("public", repo, cfg, args.public)
    if not pub:
        return 0  # offline / no local mirror: stay quiet
    _, cur_ref, cur_ver = pub
    old_ref = (lock.get("public") or {}).get("ref")
    if cur_ref and old_ref and cur_ref != old_ref:
        log(f"resonance: update available (public {old_ref[:8]} -> {cur_ref[:8]}, "
            f"v{cur_ver or '?'}). Run: resonance sync")
    return 0


# ------------------------------------------------------------- vendored payload

def _write_runtime(repo: Path) -> None:
    """Vendor the engine + hook scripts + root entrypoints into the repo so
    hooks and colleagues can run them without the private pack present."""
    runtime = repo / RUNTIME_REL
    (runtime / "hooks").mkdir(parents=True, exist_ok=True)
    # Force LF on everything under the runtime dir so the vendored shell scripts
    # run on macOS/Linux even when committed from Windows.
    (runtime / ".gitattributes").write_text("* text eol=lf\n", encoding="utf-8", newline="\n")
    # self-copy the engine
    shutil.copy2(Path(__file__).resolve(), runtime / "resonance_sync.py")
    # hook + entrypoint scripts from embedded templates
    (runtime / "hooks" / "resonance-check.sh").write_text(CHECK_SH, encoding="utf-8", newline="\n")
    (runtime / "hooks" / "post-merge").write_text(HOOK_SH, encoding="utf-8", newline="\n")
    (runtime / "hooks" / "post-checkout").write_text(HOOK_SH, encoding="utf-8", newline="\n")
    (repo / "resonance.sh").write_text(WRAPPER_SH, encoding="utf-8", newline="\n")
    (repo / "resonance.ps1").write_text(WRAPPER_PS1, encoding="utf-8")
    _chmod_x(runtime / "hooks" / "resonance-check.sh")
    _chmod_x(runtime / "hooks" / "post-merge")
    _chmod_x(runtime / "hooks" / "post-checkout")
    _chmod_x(repo / "resonance.sh")
    _ensure_gitattr(repo, "resonance.sh text eol=lf")


def _chmod_x(p: Path) -> None:
    try:
        p.chmod(p.stat().st_mode | 0o111)
    except Exception:
        pass


def _ensure_gitattr(repo: Path, rule: str) -> None:
    """Append a root .gitattributes rule if absent. Append-only; never rewrites."""
    ga = repo / ".gitattributes"
    text = ga.read_text(encoding="utf-8", errors="ignore") if ga.exists() else ""
    if rule in text.splitlines():
        return
    prefix = "" if (text == "" or text.endswith("\n")) else "\n"
    with ga.open("a", encoding="utf-8", newline="\n") as f:
        f.write(prefix + "# Resonance: keep vendored shell scripts LF for macOS/Linux\n"
                + rule + "\n")


def do_init(repo: Path, cfg_path: Path, args) -> int:
    # 1. config
    if not cfg_path.exists():
        write_json(cfg_path, DEFAULT_CONFIG)
        log(f"created {CONFIG_REL}")
    else:
        log(f"config present: {CONFIG_REL}")

    # 1b. preserve any pre-existing AGENTS.md once (the framework overwrites it)
    am = repo / "AGENTS.md"
    bak = repo / ".resonance" / "AGENTS.pre-resonance.md"
    if am.exists() and not bak.exists():
        bak.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(am, bak)
        log("backed up existing AGENTS.md -> .resonance/AGENTS.pre-resonance.md")

    # 2. sync (writes runtime + payload)
    rc = do_sync(repo, load_config(repo), args)
    if rc != 0:
        return rc

    # 3. git hooks: enable only when it will not clobber existing hooks
    _maybe_enable_hookspath(repo)

    # 4. Claude Code SessionStart hook (shared settings.json, not settings.local.json)
    _merge_claude_hook(repo)

    # 5. gitignore: fix the wholesale .claude/.agents ignore if present, then warn on the rest
    _fix_gitignore(repo)
    _warn_gitignore(repo)
    return 0


def _merge_claude_hook(repo: Path) -> None:
    settings_path = repo / ".claude" / "settings.json"
    settings = read_json(settings_path) or {}
    hooks = settings.setdefault("hooks", {})
    sess = hooks.setdefault("SessionStart", [])
    cmd = "sh ./.agents/.runtime/hooks/resonance-check.sh"
    exists = any(
        h.get("command") == cmd
        for group in sess if isinstance(group, dict)
        for h in group.get("hooks", []) if isinstance(h, dict)
    )
    if not exists:
        sess.append({"hooks": [{"type": "command", "command": cmd}]})
        write_json(settings_path, settings)
        log("Claude Code SessionStart check hook added (.claude/settings.json)")
    else:
        log("Claude Code SessionStart hook already present")


def _maybe_enable_hookspath(repo: Path) -> None:
    """Enable .githooks via core.hooksPath, but only when nothing else owns the
    hooks. core.hooksPath is exclusive: setting it blindly disables git-lfs or
    husky hooks. So we skip (and say why) whenever existing hooks are present,
    and let the Claude SessionStart hook carry the update check instead."""
    existing = git(["config", "--get", "core.hooksPath"], repo)
    if existing and existing not in ("", ".githooks"):
        log(f"note: core.hooksPath already '{existing}'; left as is (SessionStart hook covers the check).")
        return
    if (repo / ".husky").is_dir():
        log("note: husky detected; not setting core.hooksPath (SessionStart hook covers the check).")
        return
    hooks_dir = repo / ".git" / "hooks"
    active = sorted(
        p.name for p in hooks_dir.iterdir()
        if p.is_file() and not p.name.endswith(".sample")
    ) if hooks_dir.is_dir() else []
    if active:
        log(f"note: existing .git/hooks ({', '.join(active)}, e.g. git-lfs) detected; "
            f"not setting core.hooksPath so they keep working (SessionStart hook covers the check).")
        return
    # Safe: no competing hooks. Write templates and enable.
    githooks = repo / ".githooks"
    githooks.mkdir(exist_ok=True)
    for name in ("post-merge", "post-checkout"):
        shutil.copy2(repo / RUNTIME_REL / "hooks" / name, githooks / name)
        _chmod_x(githooks / name)
    if git(["config", "core.hooksPath", ".githooks"], repo) is not None:
        log("git hooks enabled (.githooks via core.hooksPath)")


def _fix_gitignore(repo: Path) -> None:
    """Replace a wholesale `.claude` ignore with granular rules (so `.claude/skills`
    and shared settings are tracked while personal files stay ignored), and drop a
    wholesale `.agents` ignore (the vendored skills must be committed). Line-based
    and idempotent: only rewrites when one of those exact lines is present."""
    gi = repo / ".gitignore"
    if not gi.exists():
        return
    granular = [
        "# Claude Code: keep shared skills + settings tracked, ignore personal/local only",
        ".claude/settings.local.json", ".claude/worktrees/", ".claude/todos/",
        ".claude/shell-snapshots/", ".claude/statsig/", ".claude/projects/",
        ".claude/*.local.json",
    ]
    out, changed = [], False
    for line in gi.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if s in (".claude", ".claude/"):
            out.extend(granular)
            changed = True
        elif s in (".agents", ".agents/"):
            out.append("# .agents is Resonance-managed and tracked (ignore removed)")
            changed = True
        else:
            out.append(line)
    if changed:
        gi.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
        log("gitignore: adjusted so .claude/skills and .agents stay tracked")


def _warn_gitignore(repo: Path) -> None:
    gi = repo / ".gitignore"
    if not gi.exists():
        return
    for line in gi.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if s.startswith(".claude/") and s.endswith("/skills"):
            warn(f".gitignore line '{s}' may hide slash commands from colleagues.")


# --------------------------------------------------------------- entrypoint tpl

WRAPPER_SH = """#!/usr/bin/env bash
# Resonance entrypoint (vendored, do not edit by hand). Dispatches to the engine.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
engine="$here/.agents/.runtime/resonance_sync.py"
py="$(command -v python3 || command -v python || command -v py || true)"
if [ -z "$py" ]; then echo "resonance: python not found" >&2; exit 0; fi
cmd="${1:-check}"; shift || true
exec "$py" "$engine" "$cmd" --repo "$here" "$@"
"""

WRAPPER_PS1 = """#!/usr/bin/env pwsh
# Resonance entrypoint (vendored, do not edit by hand). Dispatches to the engine.
param([Parameter(Position=0)][string]$Command = "check")
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$engine = Join-Path $here ".agents/.runtime/resonance_sync.py"
$py = $null
foreach ($c in @("py","python","python3")) {
  $g = Get-Command $c -ErrorAction SilentlyContinue
  if ($g) { $py = $g.Source; break }
}
if (-not $py) { Write-Host "resonance: python not found"; exit 0 }
& $py $engine $Command --repo $here @args
"""

CHECK_SH = """#!/usr/bin/env bash
# Resonance advisory check (vendored). Never blocks; always exits 0.
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
engine="$root/.agents/.runtime/resonance_sync.py"
py="$(command -v python3 || command -v python || command -v py || true)"
[ -z "$py" ] && exit 0
[ -f "$engine" ] || exit 0
"$py" "$engine" check --repo "$root" 2>/dev/null || true
exit 0
"""

HOOK_SH = """#!/usr/bin/env bash
# Resonance git hook (vendored). Advisory update check on pull/checkout.
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
[ -f "$root/.agents/.runtime/hooks/resonance-check.sh" ] && \\
  sh "$root/.agents/.runtime/hooks/resonance-check.sh" 2>/dev/null || true
exit 0
"""


# ---------------------------------------------------------------------- cli

def resolve_repo(repo_arg: str | None) -> Path:
    if repo_arg:
        return Path(repo_arg).resolve()
    top = git(["rev-parse", "--show-toplevel"], Path.cwd())
    return Path(top).resolve() if top else Path.cwd().resolve()


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="resonance", description="Resonance one-way skill sync.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("sync", "check", "init"):
        p = sub.add_parser(name)
        p.add_argument("--repo", default=None)
        p.add_argument("--public", default=None, help="override public source path")
        p.add_argument("--private", default=None, help="override private pack path")
        p.add_argument("--no-private", action="store_true")
        p.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    repo = resolve_repo(args.repo)
    if not repo.exists():
        warn(f"repo not found: {repo}")
        return 1
    cfg = load_config(repo)

    if args.cmd == "sync":
        return do_sync(repo, cfg, args)
    if args.cmd == "check":
        return do_check(repo, cfg, args)
    if args.cmd == "init":
        return do_init(repo, repo / CONFIG_REL, args)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
