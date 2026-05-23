#!/usr/bin/env python
"""Build final report with refined DIVERGED/PARTIAL analysis."""
import pickle, os, sys, json
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/results.pkl', 'rb') as f:
    results = pickle.load(f)
with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/by_path.pkl', 'rb') as f:
    bp = pickle.load(f)
by_path = bp['by_path']

REPO = 'C:/Users/user-MSI/Downloads/nba-commish/'

# For each PARTIAL/DIVERGED file, count truly unique unapplied content
def count_unapplied_lines(path):
    """Count + lines (additions) Codex made that are NOT found on disk."""
    disk = None
    full = os.path.join(REPO, path)
    if os.path.exists(full):
        with open(full, 'r', encoding='utf-8', errors='replace') as f:
            disk = f.read()
    if disk is None:
        return None
    disk_lines_norm = set(l.rstrip() for l in disk.split('\n') if l.strip())
    unapplied = 0
    total_plus = 0
    for op in sorted(by_path[path], key=lambda o: (o['session'], o['line'])):
        if op['op'] != 'Update File':
            continue
        for ln in op['payload']:
            if ln.startswith('+') and not ln.startswith('+++'):
                content = ln[1:].rstrip()
                if not content.strip():
                    continue
                total_plus += 1
                if content not in disk_lines_norm:
                    unapplied += 1
    return (unapplied, total_plus)

# Re-rank
records = []
for path, r in results.items():
    n_ops = len(by_path[path])
    investment = 0
    for o in by_path[path]:
        investment += sum(len(l) for l in o['payload'])
    unapp = count_unapplied_lines(path) if r['disk_exists'] else (None, None)
    records.append({
        'path': path,
        'status': r['status'],
        'n_ops': n_ops,
        'investment': investment,
        'disk_len': r['disk_len'],
        'intended_len': r['intended_len'],
        'has_add': r['has_add'],
        'unapplied_plus_lines': unapp[0] if unapp else None,
        'total_plus_lines': unapp[1] if unapp else None,
    })

# Re-classify based on unapplied
for rec in records:
    if rec['status'] in ('PARTIAL', 'DIVERGED') and rec['unapplied_plus_lines'] is not None:
        if rec['total_plus_lines'] == 0:
            rec['true_status'] = rec['status']
        else:
            ratio = rec['unapplied_plus_lines'] / rec['total_plus_lines']
            if ratio == 0:
                rec['true_status'] = 'IDENTICAL'  # all + lines on disk
            elif ratio < 0.05:
                rec['true_status'] = 'NEARLY_IDENTICAL'
            elif ratio < 0.35:
                rec['true_status'] = 'PARTIAL_MINOR_LOSS'
            elif ratio < 0.75:
                rec['true_status'] = 'PARTIAL_MAJOR_LOSS'
            else:
                rec['true_status'] = 'DIVERGED_MOSTLY_LOST'
    else:
        rec['true_status'] = rec['status']

# Save
with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/final_records.pkl', 'wb') as f:
    pickle.dump(records, f)

# Stats
from collections import Counter
ts_counter = Counter(r['true_status'] for r in records)
print('True status breakdown:')
for st, c in sorted(ts_counter.items(), key=lambda x: -x[1]):
    print(f'  {st}: {c}')

print('\n--- Files with MAJOR LOSS (lots of unapplied + lines) ---')
records.sort(key=lambda r: -(r['unapplied_plus_lines'] or 0))
for r in records:
    if r.get('true_status') in ('PARTIAL_MAJOR_LOSS', 'DIVERGED_MOSTLY_LOST', 'MISSING'):
        print(f'  [{r["true_status"]}] {r["unapplied_plus_lines"]}/{r["total_plus_lines"]} + lines unapplied  {r["path"]} (ops={r["n_ops"]})')

print('\n--- Files with MINOR LOSS ---')
for r in records:
    if r.get('true_status') == 'PARTIAL_MINOR_LOSS':
        print(f'  [{r["true_status"]}] {r["unapplied_plus_lines"]}/{r["total_plus_lines"]} + lines unapplied  {r["path"]} (ops={r["n_ops"]})')
