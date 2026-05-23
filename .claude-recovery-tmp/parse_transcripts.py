"""Forensic extractor: scan Claude transcripts (May 11-14), inventory Write/Edit/MultiEdit calls."""
import json
import os
import sys
from pathlib import Path

TRANSCRIPT_DIR = Path(r"C:\Users\user-MSI\.claude\projects\C--Users-user-MSI-Downloads-nba-commish")
REPO = Path(r"C:\Users\user-MSI\Downloads\nba-commish")
OUT_JSON = REPO / ".claude-recovery-tmp" / "ops.jsonl"

# Transcripts in scope: May 11-14 2026
IN_SCOPE = [
    "53566d62-f3d4-4c0e-86c8-1c2e7750834c.jsonl",
    "a89123c4-b4a8-46c0-b3f5-6657cac9de1a.jsonl",
    "3777b913-5aba-4089-865c-2e55b867502f.jsonl",
    "472f7854-4edd-430b-87f8-da20e0c5a452.jsonl",
    "eeecdc03-28c5-454b-828b-84bdadf22c4a.jsonl",
    "5aa9c251-4ab1-4c02-aef2-6499da99305a.jsonl",
    "2b44e0e0-510f-41a6-9306-31edcd635fbb.jsonl",
    "b501a3c1-c253-497b-a978-fe69ed75bd7a.jsonl",
    "ed7aa231-79f3-4c80-8cea-0777e8c0f950.jsonl",
    "236cb3e0-3fbe-4990-ba41-9ce61039f6c9.jsonl",
    "90b9fdf1-c69d-4341-b4d9-9e880eeb97ab.jsonl",
    "38fa0484-e7df-4a82-a9b3-cd194892fcbf.jsonl",
    "0aa27005-2643-45ed-b7fb-1097809ed49a.jsonl",
    "a1b61e1a-882b-456c-a98c-bc9bab8c8c09.jsonl",
    "33a91699-135a-4a9e-bb0b-424392593565.jsonl",
    "95688548-b953-41ae-9cc6-310a28e4d0cd.jsonl",
    "3a69e23a-ee04-484f-8c7b-48a6e2fa9dc0.jsonl",
    "d0fab4b5-26b8-4584-94ab-8d79ed0ac678.jsonl",
    "833afdf0-e591-4874-ab43-fea4d152f50e.jsonl",
    "bdc5880c-4312-4744-937f-233c5919a60d.jsonl",
    "05423698-7329-4058-be90-0d6424b91fce.jsonl",
    "5ebee631-2bb4-4025-a811-2d435fc83cc3.jsonl",
    "a2905b04-2329-497e-9557-bb04cae7f25c.jsonl",
    "d891427c-c63f-44a5-959b-925a7940379c.jsonl",
    "7b909d26-d526-449c-8f6c-faf0bafddfde.jsonl",
    "e05203d2-2462-4a9f-9de6-e91ee37084c1.jsonl",
    "250e82b7-774a-47f6-a7a6-5080e195202f.jsonl",
    "640bea96-ab32-4036-b63b-de93b7f88d9b.jsonl",
]

OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

def extract_tool_uses(transcript_path):
    """Yield (timestamp, tool_name, input_dict) for each Write/Edit/MultiEdit/NotebookEdit tool_use."""
    with open(transcript_path, "r", encoding="utf-8", errors="replace") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ev.get("type") != "assistant":
                continue
            ts = ev.get("timestamp")
            # content can be inside message.content or at top-level content
            msg = ev.get("message", {})
            content = msg.get("content") if isinstance(msg, dict) else None
            if content is None:
                content = ev.get("content")
            if not isinstance(content, list):
                continue
            for item in content:
                if not isinstance(item, dict):
                    continue
                if item.get("type") != "tool_use":
                    continue
                name = item.get("name")
                if name not in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
                    continue
                inp = item.get("input", {}) or {}
                yield (ts, name, inp, transcript_path.name, line_no)

count = 0
with open(OUT_JSON, "w", encoding="utf-8") as out:
    for name in IN_SCOPE:
        tpath = TRANSCRIPT_DIR / name
        if not tpath.exists():
            print(f"MISSING TRANSCRIPT: {name}", file=sys.stderr)
            continue
        for ts, tool, inp, fname, line_no in extract_tool_uses(tpath):
            rec = {
                "timestamp": ts,
                "transcript": fname,
                "line": line_no,
                "tool": tool,
                "input": inp,
            }
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            count += 1
        print(f"done {name}", file=sys.stderr)

print(f"total tool calls extracted: {count}")
