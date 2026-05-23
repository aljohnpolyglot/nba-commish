#!/usr/bin/env python
"""Reconstruct final intended content per file."""
import pickle, os, sys, subprocess
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/by_path.pkl', 'rb') as f:
    bp = pickle.load(f)
by_path = bp['by_path']

REPO = 'C:/Users/user-MSI/Downloads/nba-commish/'

def strip_payload_for_add(lines):
    """For Add File ops, payload lines all start with '+'. Strip the '+'."""
    out = []
    for ln in lines:
        if ln.startswith('+'):
            out.append(ln[1:])
        elif ln == '':
            out.append('')
        else:
            # Edge case: blank line emitted as empty
            out.append(ln)
    # Trailing empty line may be present
    return '\n'.join(out)

def apply_v4a_hunks(base_text, payload_lines):
    """Apply Codex V4A-style hunks. Payload contains:
       @@ optional_context
        context_line
       -removed_line
       +added_line
       Hunks are anchored by context matches in base_text.
    """
    # Split payload into hunks by @@ lines
    hunks = []
    current = []
    for ln in payload_lines:
        if ln.startswith('@@'):
            if current:
                hunks.append(current)
            current = []
        else:
            current.append(ln)
    if current:
        hunks.append(current)
    
    base_lines = base_text.split('\n')
    
    for hunk in hunks:
        # Build the "before" and "after" lines from the hunk
        before = []
        after = []
        for ln in hunk:
            if not ln:
                before.append('')
                after.append('')
            elif ln[0] == ' ':
                before.append(ln[1:])
                after.append(ln[1:])
            elif ln[0] == '-':
                before.append(ln[1:])
            elif ln[0] == '+':
                after.append(ln[1:])
            else:
                # Treat as context (some patches lack leading space on blank context)
                before.append(ln)
                after.append(ln)
        # Find before in base_lines
        if not before:
            continue
        # Try to find a unique match
        match_idx = None
        # Strip leading/trailing blank context which can be ambiguous
        # First try exact match
        for i in range(len(base_lines) - len(before) + 1):
            if base_lines[i:i+len(before)] == before:
                match_idx = i
                break
        if match_idx is None:
            # Try ignoring trailing blank line in `before`
            if before and before[-1] == '':
                trimmed = before[:-1]
                for i in range(len(base_lines) - len(trimmed) + 1):
                    if base_lines[i:i+len(trimmed)] == trimmed:
                        match_idx = i
                        # Adjust before/after to drop trailing blank
                        before = trimmed
                        if after and after[-1] == '':
                            after = after[:-1]
                        break
        if match_idx is None:
            # Soft match: try stripping whitespace
            base_stripped = [l.rstrip() for l in base_lines]
            before_stripped = [l.rstrip() for l in before]
            for i in range(len(base_stripped) - len(before_stripped) + 1):
                if base_stripped[i:i+len(before_stripped)] == before_stripped:
                    match_idx = i
                    break
        if match_idx is None:
            return None, f'Hunk anchor not found (before={len(before)} lines): {before[:3]}'
        # Apply
        base_lines = base_lines[:match_idx] + after + base_lines[match_idx+len(before):]
    return '\n'.join(base_lines), None

def read_disk(path):
    full = os.path.join(REPO, path)
    if not os.path.exists(full):
        return None
    try:
        with open(full, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        try:
            with open(full, 'rb') as f:
                return f.read().decode('utf-8', errors='replace')
        except:
            return None

results = {}  # path -> {content, status, ops_count, failed_hunks}
for path, ops in by_path.items():
    # Find latest Add File (if any) — start from it
    add_ops = [o for o in ops if o['op'] == 'Add File']
    update_ops = [o for o in ops if o['op'] == 'Update File']
    
    start_text = None
    start_seq = -1
    if add_ops:
        # Use latest Add File as base; subsequent Update ops are then applied
        latest_add = max(add_ops, key=lambda o: (o['session'], o['line']))
        start_text = strip_payload_for_add(latest_add['payload'])
        start_seq = (latest_add['session'], latest_add['line'])
        # Only apply Update ops AFTER this Add
        relevant_updates = [o for o in update_ops if (o['session'], o['line']) > start_seq]
    else:
        # No Add — base is current disk content
        start_text = read_disk(path)
        if start_text is None:
            # File doesn't exist on disk and Codex didn't Add it — was perhaps deleted? Skip
            results[path] = {'content': None, 'status': 'NO_BASE',
                             'ops_count': len(ops), 'failed_hunks': 0,
                             'note': 'No Add op and no disk file'}
            continue
        relevant_updates = update_ops
    
    failed_hunks = 0
    cur = start_text
    for op in sorted(relevant_updates, key=lambda o: (o['session'], o['line'])):
        new_text, err = apply_v4a_hunks(cur, op['payload'])
        if err:
            failed_hunks += 1
            # skip this update, but keep going (don't lose work from prior ops)
            continue
        cur = new_text
    results[path] = {
        'content': cur,
        'status': 'OK' if failed_hunks == 0 else 'PARTIAL_RECONSTRUCTION',
        'ops_count': len(ops),
        'failed_hunks': failed_hunks,
        'add_count': len(add_ops),
        'update_count': len(update_ops),
    }

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/results.pkl', 'wb') as f:
    pickle.dump(results, f)

# Stats
ok = sum(1 for r in results.values() if r['status'] == 'OK')
partial = sum(1 for r in results.values() if r['status'] == 'PARTIAL_RECONSTRUCTION')
nobase = sum(1 for r in results.values() if r['status'] == 'NO_BASE')
print(f'Reconstruction: OK={ok}, PARTIAL_RECONSTRUCTION={partial}, NO_BASE={nobase}')

# Show partial paths
print('\nPartial reconstructions (>=1 hunk failed):')
for p, r in results.items():
    if r['status'] == 'PARTIAL_RECONSTRUCTION':
        print(f'  {p}: {r["failed_hunks"]}/{r["update_count"]} update ops failed to anchor')
