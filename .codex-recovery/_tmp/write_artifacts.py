#!/usr/bin/env python
"""Write recovery artifacts to .codex-recovery/, mirroring repo structure."""
import pickle, os, sys, json
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/results.pkl', 'rb') as f:
    results = pickle.load(f)
with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/by_path.pkl', 'rb') as f:
    bp = pickle.load(f)
by_path = bp['by_path']

OUT = 'C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/'

def write_safe(rel_path, content):
    full = os.path.join(OUT, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    return len(content)

# Also write per-file hunk-diff sidecars for PARTIAL/DIVERGED with unapplied hunks
def write_unapplied_hunks_sidecar(rel_path, ops, results_entry, by_path_entry):
    """Write a .unapplied-hunks.txt file listing hunks that couldn't be matched on disk."""
    import re
    # Re-walk like categorize.py to find which specific hunks failed
    from collections import OrderedDict

    def parse_hunks(payload):
        hunks = []
        cur = []
        for ln in payload:
            if ln.startswith('@@'):
                if cur:
                    hunks.append(cur); cur = []
            else:
                cur.append(ln)
        if cur:
            hunks.append(cur)
        parsed = []
        for h in hunks:
            before, after = [], []
            for ln in h:
                if not ln:
                    before.append(''); after.append('')
                elif ln[0] == ' ':
                    before.append(ln[1:]); after.append(ln[1:])
                elif ln[0] == '-':
                    before.append(ln[1:])
                elif ln[0] == '+':
                    after.append(ln[1:])
                else:
                    before.append(ln); after.append(ln)
            parsed.append((before, after, h))
        return parsed

    disk_full = os.path.join('C:/Users/user-MSI/Downloads/nba-commish/', rel_path)
    if not os.path.exists(disk_full):
        return 0
    with open(disk_full, 'r', encoding='utf-8', errors='replace') as f:
        disk = f.read()
    disk_lines = [l.rstrip() for l in disk.split('\n')]

    unapplied = []  # list of (op_idx, hunk_idx, raw_hunk_text)
    for op_idx, op in enumerate(sorted(by_path_entry, key=lambda o: (o['session'], o['line']))):
        if op['op'] != 'Update File':
            continue
        for h_idx, (before, after, raw) in enumerate(parse_hunks(op['payload'])):
            if not after:
                continue
            aft = [l.rstrip() for l in after]
            found = False
            for i in range(len(disk_lines) - len(aft) + 1):
                if disk_lines[i:i+len(aft)] == aft:
                    found = True; break
            if not found:
                unapplied.append((op_idx, h_idx, raw, op['session'], op['line'], op['ts']))

    if not unapplied:
        return 0

    sidecar = os.path.join(OUT, rel_path + '.unapplied-hunks.txt')
    os.makedirs(os.path.dirname(sidecar), exist_ok=True)
    with open(sidecar, 'w', encoding='utf-8') as f:
        f.write(f'# Codex hunks NOT found on current disk for {rel_path}\n')
        f.write(f'# {len(unapplied)} hunks unapplied. Total ops: {len(by_path_entry)}\n')
        f.write(f'# Each block is a single V4A hunk.\n\n')
        for op_idx, h_idx, raw, sess, line, ts in unapplied:
            f.write(f'\n--- HUNK [op#{op_idx} hunk#{h_idx}] session={sess} line={line} ts={ts} ---\n')
            for ln in raw:
                f.write(ln + '\n')
    return os.path.getsize(sidecar)

written = []
sidecars = []
for path, r in results.items():
    if r['status'] == 'IDENTICAL':
        continue  # No artifact needed
    # Write intended content
    if r['intended']:
        size = write_safe(path, r['intended'])
        written.append((path, size, r['status']))
    # Write sidecar for PARTIAL/DIVERGED
    if r['status'] in ('PARTIAL', 'DIVERGED'):
        sz = write_unapplied_hunks_sidecar(path, None, r, by_path[path])
        if sz > 0:
            sidecars.append((path + '.unapplied-hunks.txt', sz))

# Also write a summary index
index_lines = []
index_lines.append('# Codex Recovery Index\n')
index_lines.append(f'Total files: {len(results)}\n')
from collections import Counter
sc = Counter(r['status'] for r in results.values())
for st in sorted(sc):
    index_lines.append(f'  {st}: {sc[st]}\n')
index_lines.append('\n## Files written\n')
for p, sz, st in sorted(written, key=lambda x: (x[2], x[0])):
    index_lines.append(f'  [{st}] {p}  ({sz} bytes)\n')
index_lines.append('\n## Sidecars (unapplied-hunks lists)\n')
for p, sz in sorted(sidecars):
    index_lines.append(f'  {p}  ({sz} bytes)\n')

with open(OUT + 'INDEX.md', 'w', encoding='utf-8') as f:
    f.writelines(index_lines)

print(f'Wrote {len(written)} content artifacts.')
print(f'Wrote {len(sidecars)} hunk sidecars.')
total_bytes = sum(s for _, s, _ in written) + sum(s for _, s in sidecars)
print(f'Total bytes: {total_bytes}')
print(f'Index at: {OUT}INDEX.md')
