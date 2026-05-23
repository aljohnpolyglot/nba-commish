#!/usr/bin/env python
"""Parse apply_patch envelopes into file-level operations."""
import pickle
import re
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/patches.pkl', 'rb') as f:
    data = pickle.load(f)
patches = data['patches']

REPO_FWD = 'C:/Users/user-MSI/Downloads/nba-commish/'
REPO_BACK = 'C:' + chr(92) + 'Users' + chr(92) + 'user-MSI' + chr(92) + 'Downloads' + chr(92) + 'nba-commish' + chr(92)

def normalize_path(p):
    p = p.strip()
    pl = p.lower()
    if pl.startswith(REPO_FWD.lower()):
        p = p[len(REPO_FWD):]
    elif pl.startswith(REPO_BACK.lower()):
        p = p[len(REPO_BACK):]
    p = p.replace(chr(92), '/')
    return p

file_ops = []
PATCH_HEADER_RE = re.compile(r'^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$')

for seq, pe in enumerate(patches):
    text = pe['patch']
    lines = text.split('\n')
    body = []
    in_patch = False
    for ln in lines:
        if ln.strip() == '*** Begin Patch':
            in_patch = True; continue
        if ln.strip() == '*** End Patch':
            in_patch = False; continue
        if in_patch:
            body.append(ln)
    i = 0
    while i < len(body):
        ln = body[i]
        m = PATCH_HEADER_RE.match(ln)
        if not m:
            i += 1; continue
        op_kind = m.group(1)
        path = normalize_path(m.group(2))
        i += 1
        dest = None
        payload_lines = []
        while i < len(body):
            nxt = body[i]
            if nxt.startswith('*** '):
                m2 = PATCH_HEADER_RE.match(nxt)
                if m2 and m2.group(1) == 'Move to':
                    dest = normalize_path(m2.group(2))
                    i += 1
                    continue
                break
            payload_lines.append(nxt)
            i += 1
        file_ops.append({
            'seq': seq, 'session': pe['session'], 'line': pe['line'], 'ts': pe['ts'],
            'op': op_kind, 'path': path, 'payload': payload_lines, 'dest': dest,
            'output': pe.get('output', ''),
        })

print(f'Total file ops: {len(file_ops)}')
from collections import Counter
op_counter = Counter(o['op'] for o in file_ops)
print('Op type breakdown:', dict(op_counter))
paths = set(o['path'] for o in file_ops)
print(f'Unique paths touched: {len(paths)}')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/file_ops.pkl', 'wb') as f:
    pickle.dump(file_ops, f)

path_counter = Counter(o['path'] for o in file_ops)
print('\nTop 30 most-touched paths:')
for p, c in path_counter.most_common(30):
    print(f'  {c}x  {p}')
