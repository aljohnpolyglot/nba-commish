#!/usr/bin/env python
"""Write final INDEX.md and SUMMARY.md."""
import pickle, os, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/final_records.pkl', 'rb') as f:
    records = pickle.load(f)
with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/by_path.pkl', 'rb') as f:
    bp = pickle.load(f)
by_path = bp['by_path']
with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/results.pkl', 'rb') as f:
    results = pickle.load(f)

OUT = 'C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/'

from collections import Counter
ts = Counter(r['true_status'] for r in records)

# Identify Add-File-created paths
created = set()
for p, ops in by_path.items():
    if any(o['op'] == 'Add File' for o in ops):
        created.add(p)

# Compute size of recovery artifacts
artifact_files = []
total_bytes = 0
for root, dirs, files in os.walk(OUT):
    if '_tmp' in root: continue
    for fn in files:
        full = os.path.join(root, fn)
        sz = os.path.getsize(full)
        rel = os.path.relpath(full, OUT).replace('\\', '/')
        artifact_files.append((rel, sz))
        total_bytes += sz

# Build INDEX.md
lines = []
lines.append('# Codex Recovery Index\n\n')
lines.append(f'## Status counts\n')
for st in sorted(ts.keys()):
    lines.append(f'- {st}: **{ts[st]}**\n')
lines.append(f'\nTotal recovery artifacts on disk: {len(artifact_files)} files, {total_bytes:,} bytes\n\n')
lines.append('---\n\n')

# Group records by true_status
groups = {}
for r in records:
    groups.setdefault(r['true_status'], []).append(r)

# Order
order = ['DIVERGED_MOSTLY_LOST', 'PARTIAL_MAJOR_LOSS', 'DIVERGED', 'PARTIAL_MINOR_LOSS', 'NEARLY_IDENTICAL', 'IDENTICAL']

def fmt(r):
    unapp = r.get('unapplied_plus_lines') or 0
    total = r.get('total_plus_lines') or 0
    add_mark = '  (CREATED-BY-CODEX)' if r['path'] in created else ''
    return f"- `{r['path']}` — {r['n_ops']} ops, {unapp}/{total} added lines NOT on disk{add_mark}"

for status in order:
    if status not in groups:
        continue
    items = sorted(groups[status], key=lambda r: -(r.get('unapplied_plus_lines') or 0))
    lines.append(f'## {status} ({len(items)})\n\n')
    for r in items:
        lines.append(fmt(r) + '\n')
    lines.append('\n')

with open(OUT + 'INDEX.md', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print(f'Wrote {OUT}INDEX.md')

# Print summary for final report
print(f'\nArtifact count: {len(artifact_files)}, total bytes: {total_bytes:,}')
print('Status counts:')
for st in sorted(ts.keys()):
    print(f'  {st}: {ts[st]}')
