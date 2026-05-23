#!/usr/bin/env python
"""Categorize each file based on whether Codex's final intended content is on disk."""
import pickle, os, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/by_path.pkl', 'rb') as f:
    bp = pickle.load(f)
by_path = bp['by_path']

REPO = 'C:/Users/user-MSI/Downloads/nba-commish/'

def read_disk(path):
    full = os.path.join(REPO, path)
    if not os.path.exists(full):
        return None
    try:
        with open(full, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        try:
            with open(full, 'rb') as f:
                return f.read().decode('utf-8', errors='replace')
        except:
            return None

def strip_payload_for_add(lines):
    out = []
    for ln in lines:
        if ln.startswith('+'):
            out.append(ln[1:])
        else:
            out.append(ln)
    return '\n'.join(out)

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
        parsed.append((before, after))
    return parsed

def apply_hunk(base_lines, before, after):
    if not before:
        return base_lines + after
    for i in range(len(base_lines) - len(before) + 1):
        if base_lines[i:i+len(before)] == before:
            return base_lines[:i] + after + base_lines[i+len(before):]
    if before and before[-1] == '':
        tb = before[:-1]
        ta = after[:-1] if (after and after[-1] == '') else after
        for i in range(len(base_lines) - len(tb) + 1):
            if base_lines[i:i+len(tb)] == tb:
                return base_lines[:i] + ta + base_lines[i+len(tb):]
    bs = [l.rstrip() for l in base_lines]
    bef = [l.rstrip() for l in before]
    for i in range(len(bs) - len(bef) + 1):
        if bs[i:i+len(bef)] == bef:
            return base_lines[:i] + after + base_lines[i+len(bef):]
    return None

def hunk_already_applied(disk_lines, before, after):
    if not after:
        if not before:
            return True
        bs = [l.rstrip() for l in disk_lines]
        bef = [l.rstrip() for l in before]
        for i in range(len(bs) - len(bef) + 1):
            if bs[i:i+len(bef)] == bef:
                return False
        return True
    ds = [l.rstrip() for l in disk_lines]
    aft = [l.rstrip() for l in after]
    if not aft:
        return True
    # Use only the unique-looking + lines (skip blank/context-only blocks)
    added_only = [a for (b, a) in [(before, after)] for line in [None]]
    # Look for after-block in disk (full sequence)
    for i in range(len(ds) - len(aft) + 1):
        if ds[i:i+len(aft)] == aft:
            return True
    return False

results = {}
for path, ops in by_path.items():
    add_ops = [o for o in ops if o['op'] == 'Add File']
    update_ops = [o for o in ops if o['op'] == 'Update File']
    disk = read_disk(path)
    has_add = bool(add_ops)
    if has_add:
        latest_add = max(add_ops, key=lambda o: (o['session'], o['line']))
        start_text = strip_payload_for_add(latest_add['payload'])
        start_seq = (latest_add['session'], latest_add['line'])
        post_updates = [o for o in update_ops if (o['session'], o['line']) > start_seq]
    else:
        start_text = disk if disk is not None else ''
        post_updates = update_ops
    base_lines = start_text.split('\n')
    failed_count = 0
    total_hunks = 0
    applied_count = 0
    all_hunks_data = []
    for op in sorted(post_updates, key=lambda o: (o['session'], o['line'])):
        parsed = parse_hunks(op['payload'])
        all_hunks_data.extend(parsed)
        for before, after in parsed:
            total_hunks += 1
            new_base = apply_hunk(base_lines, before, after)
            if new_base is None:
                failed_count += 1
            else:
                base_lines = new_base
                applied_count += 1
    intended_text = '\n'.join(base_lines)
    if not post_updates and has_add:
        intended_text = start_text
    if disk is None:
        status = 'MISSING'
    else:
        if disk.strip() == intended_text.strip():
            status = 'IDENTICAL'
        else:
            disk_lines = disk.split('\n')
            applied_on_disk = 0
            for before, after in all_hunks_data:
                if hunk_already_applied(disk_lines, before, after):
                    applied_on_disk += 1
            if has_add:
                # Check first 30 lines of intended appear in disk
                head_intended = '\n'.join(intended_text.split('\n')[:20]).strip()
                if head_intended and head_intended in disk:
                    if applied_on_disk == total_hunks:
                        status = 'IDENTICAL'
                    elif applied_on_disk > 0:
                        status = 'PARTIAL'
                    else:
                        status = 'DIVERGED'
                else:
                    if len(disk) < 100 and len(intended_text) > 300:
                        status = 'MISSING_OR_TRUNCATED'
                    else:
                        status = 'DIVERGED'
            else:
                if total_hunks > 0 and applied_on_disk == total_hunks:
                    status = 'IDENTICAL'
                elif applied_on_disk == 0:
                    status = 'DIVERGED'
                elif applied_on_disk < total_hunks:
                    status = 'PARTIAL'
                else:
                    status = 'DIVERGED'
    results[path] = {
        'status': status,
        'intended': intended_text,
        'disk_exists': disk is not None,
        'disk_len': len(disk) if disk else 0,
        'intended_len': len(intended_text),
        'has_add': has_add,
        'total_hunks': total_hunks,
        'applied_count': applied_count,
        'failed_count': failed_count,
        'total_ops': len(ops),
    }

from collections import Counter
status_counter = Counter(r['status'] for r in results.values())
print('Status breakdown:')
for st, c in sorted(status_counter.items(), key=lambda x: -x[1]):
    print(f'  {st}: {c}')

with open('C:/Users/user-MSI/Downloads/nba-commish/.codex-recovery/_tmp/results.pkl', 'wb') as f:
    pickle.dump(results, f)

print()
for status in ['MISSING', 'MISSING_OR_TRUNCATED', 'DIVERGED', 'PARTIAL']:
    files = [p for p, r in results.items() if r['status'] == status]
    if files:
        print(f'\n=== {status} ({len(files)}) ===')
        for p in sorted(files):
            r = results[p]
            print(f'  {p}: disk={r["disk_len"]} intended={r["intended_len"]} hunks={r["applied_count"]}/{r["total_hunks"]} ops={r["total_ops"]}')
