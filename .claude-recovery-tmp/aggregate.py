"""Aggregate ops by file path. Check disk + git + codex-recovery presence. Recover missing content."""
import json
import os
import subprocess
from pathlib import Path
from collections import defaultdict

REPO = Path(r"C:\Users\user-MSI\Downloads\nba-commish")
OPS_FILE = REPO / ".claude-recovery-tmp" / "ops.jsonl"
RECOVERY_ROOT = REPO / ".claude-recovery"
CODEX_RECOVERY = REPO / ".codex-recovery"

ops = []
with open(OPS_FILE, "r", encoding="utf-8") as f:
    for line in f:
        ops.append(json.loads(line))

# Group ops by normalized absolute path
by_file = defaultdict(list)
for op in ops:
    fp = op["input"].get("file_path") or op["input"].get("notebook_path") or ""
    if not fp:
        continue
    # Normalize: resolve to absolute, lowercase drive
    try:
        norm = str(Path(fp).resolve())
    except Exception:
        norm = fp
    # Force consistent Windows-style
    norm = norm.replace("/", "\\")
    by_file[norm].append(op)

print(f"unique files: {len(by_file)}")

# Check codex recovery list
codex_files = set()
if CODEX_RECOVERY.exists():
    for p in CODEX_RECOVERY.rglob("*"):
        if p.is_file():
            rel = p.relative_to(CODEX_RECOVERY)
            codex_files.add(str(rel).replace("/", "\\").lower())
print(f"codex recovery files: {len(codex_files)}")

# Get git tracked files (all branches/history)
git_all = subprocess.run(
    ["git", "-C", str(REPO), "log", "--all", "--pretty=format:", "--name-only"],
    capture_output=True, text=True, errors="replace"
)
git_paths = set()
for line in git_all.stdout.splitlines():
    line = line.strip()
    if line:
        git_paths.add(line.replace("/", "\\").lower())
print(f"git historical paths: {len(git_paths)}")

# Per-file analysis
results = []
for norm_path, file_ops in by_file.items():
    p = Path(norm_path)
    # rel to repo
    try:
        rel = p.relative_to(REPO)
        rel_str = str(rel).replace("/", "\\")
    except ValueError:
        rel_str = None

    on_disk = p.exists()
    in_git = False
    in_codex = False
    if rel_str:
        in_git = rel_str.lower() in git_paths
        in_codex = rel_str.lower() in codex_files

    # latest op
    sorted_ops = sorted(file_ops, key=lambda o: o.get("timestamp") or "")
    latest = sorted_ops[-1]

    # count tool types
    tool_counts = defaultdict(int)
    for o in file_ops:
        tool_counts[o["tool"]] += 1

    results.append({
        "path": norm_path,
        "rel": rel_str,
        "n_ops": len(file_ops),
        "tool_counts": dict(tool_counts),
        "latest_ts": latest.get("timestamp"),
        "latest_tool": latest["tool"],
        "latest_transcript": latest["transcript"],
        "on_disk": on_disk,
        "in_git": in_git,
        "in_codex": in_codex,
        "all_ops": sorted_ops,
    })

# Find potentially missing
missing = [r for r in results if not r["on_disk"] and not r["in_git"] and not r["in_codex"]]
print(f"potentially missing (not on disk, not git, not codex-recovery): {len(missing)}")

# Save summary
summary_path = REPO / ".claude-recovery-tmp" / "summary.json"
with open(summary_path, "w", encoding="utf-8") as f:
    json.dump({
        "n_ops": len(ops),
        "n_files": len(by_file),
        "n_missing": len(missing),
        "missing_paths": [m["path"] for m in missing],
        "files": [
            {k: v for k, v in r.items() if k != "all_ops"}
            for r in results
        ],
    }, f, indent=2, default=str)
print(f"summary written: {summary_path}")

# Now reconstruct content for each missing file
def reconstruct(file_ops):
    """Replay ops in timestamp order. Returns final content string or None."""
    content = None
    notes = []
    for op in sorted(file_ops, key=lambda o: o.get("timestamp") or ""):
        tool = op["tool"]
        inp = op["input"]
        if tool == "Write":
            content = inp.get("content", "")
            notes.append(f"  Write @ {op['timestamp']}: {len(content.splitlines())} lines (replaces)")
        elif tool == "Edit":
            old = inp.get("old_string", "")
            new = inp.get("new_string", "")
            replace_all = inp.get("replace_all", False)
            if content is None:
                notes.append(f"  Edit @ {op['timestamp']}: SKIPPED (no base content; file presumably existed on disk)")
                continue
            if replace_all:
                if old in content:
                    content = content.replace(old, new)
                    notes.append(f"  Edit (all) @ {op['timestamp']}: applied")
                else:
                    notes.append(f"  Edit (all) @ {op['timestamp']}: old_string not found")
            else:
                if old in content:
                    content = content.replace(old, new, 1)
                    notes.append(f"  Edit @ {op['timestamp']}: applied")
                else:
                    notes.append(f"  Edit @ {op['timestamp']}: old_string not found")
        elif tool == "MultiEdit":
            edits = inp.get("edits", [])
            if content is None:
                notes.append(f"  MultiEdit @ {op['timestamp']}: SKIPPED (no base content)")
                continue
            for e in edits:
                old = e.get("old_string", "")
                new = e.get("new_string", "")
                if old in content:
                    content = content.replace(old, new, 1)
            notes.append(f"  MultiEdit @ {op['timestamp']}: {len(edits)} edits applied (best-effort)")
    return content, notes

# Save recovered content for missing files
recovery_log = []
for m in missing:
    content, notes = reconstruct(m["all_ops"])
    target = m["path"]
    rel = m["rel"] or os.path.basename(target)
    out_path = RECOVERY_ROOT / rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if content is not None:
        try:
            with open(out_path, "w", encoding="utf-8", newline="") as f:
                f.write(content)
            recovery_log.append({"rel": rel, "wrote": True, "size": len(content), "lines": len(content.splitlines()), "notes": notes})
        except Exception as e:
            recovery_log.append({"rel": rel, "wrote": False, "err": str(e), "notes": notes})
    else:
        # Only edits, no base — log metadata so user can investigate
        meta_path = out_path.parent / (out_path.name + ".EDITS_ONLY.txt")
        try:
            meta_path.parent.mkdir(parents=True, exist_ok=True)
            with open(meta_path, "w", encoding="utf-8") as f:
                f.write("Claude only Edited (never wrote from scratch) this file.\n")
                f.write("File was missing both from disk and git; cannot reconstruct.\n\n")
                f.write("Operations:\n")
                for op in sorted(m["all_ops"], key=lambda o: o.get("timestamp") or ""):
                    f.write(f"  {op['timestamp']} {op['tool']} (transcript={op['transcript']} line={op['line']})\n")
            recovery_log.append({"rel": rel, "wrote": False, "edits_only": True, "notes": notes})
        except Exception as e:
            recovery_log.append({"rel": rel, "wrote": False, "err": str(e)})

with open(REPO / ".claude-recovery-tmp" / "recovery_log.json", "w", encoding="utf-8") as f:
    json.dump(recovery_log, f, indent=2, default=str)
print(f"recovery_log written: {len(recovery_log)} entries")

# Top 20 most-edited
top = sorted(results, key=lambda r: -r["n_ops"])[:20]
print("\nTop 20:")
for r in top:
    flag = "OK" if (r["on_disk"] or r["in_git"] or r["in_codex"]) else "MISSING"
    print(f"  [{flag}] n={r['n_ops']:3d} {r['rel'] or r['path']}")
