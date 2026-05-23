#!/usr/bin/env python
"""Filter to only successful patches; group ops by file."""
import pickle, re, sys, json
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/file_ops.pkl', 'rb') as f:
    file_ops = pickle.load(f)

# Identify successful ops: output starts with 'Success' OR JSON-wraps "output": "Success
SUCCESS_RE = re.compile(r'(?:^|")output":?\s*"?Success', re.IGNORECASE)

successful = []
failed = []
for op in file_ops:
    out = op.get('output', '') or ''
    ok = False
    if '"Success' in out or out.startswith('Success'):
        ok = True
    if ok:
        successful.append(op)
    else:
        failed.append(op)

print(f'Successful ops: {len(successful)}')
print(f'Failed ops: {len(failed)}')

# Group ops by path
from collections import defaultdict
by_path = defaultdict(list)
for op in successful:
    by_path[op['path']].append(op)

# Sort each list by (session, line) so chronological
for p in by_path:
    by_path[p].sort(key=lambda o: (o['session'], o['line']))

# Output unique paths and op counts
print(f'\nUnique successful paths: {len(by_path)}')

# Save
with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/by_path.pkl', 'wb') as f:
    pickle.dump({'by_path': dict(by_path), 'failed': failed}, f)

# Distinguish: paths created by Codex (have at least one Add File op)
created = {p for p, ops in by_path.items() if any(o['op'] == 'Add File' for o in ops)}
print(f'Files created by Codex (Add File): {len(created)}')
for p in sorted(created):
    print(f'  + {p}')
