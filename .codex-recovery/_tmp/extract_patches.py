#!/usr/bin/env python
"""Extract all apply_patch calls from Codex rollout JSONL files."""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

FILES = [
    ('10/rollout-2026-05-10T06-19-46-019e0ed3-418d-7131-9ee3-04ea927a1373.jsonl', '2026-05-10T06:19:46'),
    ('10/rollout-2026-05-10T06-48-00-019e0eed-1b81-7311-862a-d06afe4e546d.jsonl', '2026-05-10T06:48:00'),
    ('10/rollout-2026-05-10T07-29-55-019e0f13-7ab8-7f91-849d-bb01e1c354dd.jsonl', '2026-05-10T07:29:55'),
    ('10/rollout-2026-05-10T07-30-48-019e0f14-4919-7740-8da2-c7bd73fdb68c.jsonl', '2026-05-10T07:30:48'),
    ('10/rollout-2026-05-10T07-45-27-019e0f21-b563-7152-a855-1dd3da0cecc6.jsonl', '2026-05-10T07:45:27'),
    ('10/rollout-2026-05-10T12-18-03-019e101b-4551-7be2-81b9-92a2b07f6fff.jsonl', '2026-05-10T12:18:03'),
    ('10/rollout-2026-05-10T13-12-18-019e104c-efde-7701-a7e1-e25c38f3ae03.jsonl', '2026-05-10T13:12:18'),
    ('10/rollout-2026-05-10T20-21-55-019e11d6-4226-77c2-a1ea-dbe08e895b66.jsonl', '2026-05-10T20:21:55'),
    ('11/rollout-2026-05-11T04-40-24-019e139e-a627-7e63-977a-d0430817d62d.jsonl', '2026-05-11T04:40:24'),
    ('13/rollout-2026-05-13T05-12-23-019e1e08-a346-7362-a649-3a87a907b96f.jsonl', '2026-05-13T05:12:23'),
    ('13/rollout-2026-05-13T15-11-06-019e202c-c8b2-76a0-b1cc-f131e1cf07ae.jsonl', '2026-05-13T15:11:06'),
    ('14/rollout-2026-05-14T01-10-34-019e2251-9c63-7c00-a582-b281833e8d22.jsonl', '2026-05-14T01:10:34'),
]
BASE = 'C:/Users/user-MSI/.codex/sessions/2026/05/'

# Collect (session_idx, line_idx, ts, patch_text, status, output_text)
patches = []
# Also collect shell heredoc-style patches
shell_patches = []
# Track call_id -> patch for output matching
out_map = {}

for session_idx, (rel, sess_ts) in enumerate(FILES):
    path = BASE + rel
    pending = {}  # call_id -> patch text
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        for line_idx, raw in enumerate(f):
            try:
                ev = json.loads(raw)
            except Exception:
                continue
            ts = ev.get('timestamp') or sess_ts
            if ev.get('type') != 'response_item':
                continue
            p = ev.get('payload') or {}
            ptype = p.get('type')
            if ptype == 'custom_tool_call' and p.get('name') == 'apply_patch':
                call_id = p.get('call_id')
                inp = p.get('input', '')
                if isinstance(inp, str) and inp.startswith('*** Begin Patch'):
                    pending[call_id] = (session_idx, line_idx, ts, inp)
            elif ptype == 'custom_tool_call_output':
                call_id = p.get('call_id')
                if call_id in pending:
                    s_idx, l_idx, t, inp = pending.pop(call_id)
                    output = p.get('output', '')
                    if isinstance(output, dict):
                        output = output.get('content', '') if output else ''
                    patches.append({
                        'session': session_idx,
                        'line': l_idx,
                        'ts': t,
                        'patch': inp,
                        'output': output[:500] if isinstance(output, str) else str(output)[:500],
                    })
            elif ptype == 'function_call' and p.get('name') == 'shell_command':
                args_str = p.get('arguments', '')
                if isinstance(args_str, str) and ('*** Begin Patch' in args_str or 'apply_patch' in args_str):
                    try:
                        args_obj = json.loads(args_str)
                        cmd = args_obj.get('command', '')
                        if '*** Begin Patch' in cmd:
                            shell_patches.append({
                                'session': session_idx,
                                'line': line_idx,
                                'ts': ts,
                                'cmd': cmd,
                            })
                    except Exception:
                        pass
    # Leftover pending (no output captured)
    for call_id, (s_idx, l_idx, t, inp) in pending.items():
        patches.append({
            'session': s_idx, 'line': l_idx, 'ts': t,
            'patch': inp, 'output': '<no output>',
        })

print(f'Total apply_patch custom_tool_calls: {len(patches)}')
print(f'Total shell heredoc patches: {len(shell_patches)}')

# Sort by (session, line) — chronological
patches.sort(key=lambda x: (x['session'], x['line']))

# Persist
import pickle
with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/patches.pkl', 'wb') as f:
    pickle.dump({'patches': patches, 'shell_patches': shell_patches}, f)
print('Saved patches.pkl')

# Per-session summary
from collections import Counter
sess_counts = Counter(p['session'] for p in patches)
print('Per-session patch counts:')
for s_idx, (rel, _) in enumerate(FILES):
    print(f'  [{s_idx}] {rel}: {sess_counts.get(s_idx, 0)} patches')
