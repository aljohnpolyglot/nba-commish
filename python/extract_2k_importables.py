from __future__ import annotations

import binascii
import json
import re
import shutil
import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GAME_ROOT = Path(r"C:\Program Files (x86)\2K Sports\NBA 2K14")
DEFAULT_RED_MC_ROOT = Path(r"C:\Editing Tools\RED MC")
DEFAULT_SAVE_FILE = Path(r"C:\Users\user-MSI\AppData\Roaming\2K Sports\NBA 2K14\Saves\Association6.FXG")
OUT_DIR = PROJECT_ROOT / "src" / "data" / "2kImport"
RAW_DIR = OUT_DIR / "raw"


RAW_COPY_FILES = [
    ("RED MC", Path("Text") / "Enums.txt"),
    ("RED MC", Path("Text") / "IFF" / "Contents.txt"),
    ("RED MC", Path("Text") / "NBA2K14" / "GridNames.txt"),
    ("RED MC", Path("Tutorials") / "NBA 2K14" / "List Of Text Values.txt"),
    ("RED MC", Path("Tutorials") / "NBA 2K14" / "XBox 360 Disc Contents (by Rondo is GOD)" / "HIDDEN ARENA IDs.txt"),
    ("RED MC", Path("Tutorials") / "NBA 2K14" / "XBox 360 Disc Contents (by Rondo is GOD)" / "Hidden Coach Audio.txt"),
    ("RED MC", Path("Tutorials") / "NBA 2K14" / "XBox 360 Disc Contents (by Rondo is GOD)" / "HIDDEN LOGOS.txt"),
]


ASSET_PATTERNS = {
    "career": [r"^career", r"career"],
    "coaches": [r"^coaches\.bin$", r"coach"],
    "draft": [r"^draft", r"draft"],
    "franchise": [r"^franchise", r"franchise"],
    "presentation": [r"scorebug", r"wipe", r"halftime", r"studioshow", r"loading", r"overlay"],
    "schedule": [r"schedule"],
    "social": [r"social", r"twitter"],
    "staff_team": [r"^team_\d+", r"staff"],
    "tutorial": [r"tutorial"],
}


@dataclass
class ParsedCaptionFile:
    name: str
    sections: list[dict]
    fields: list[dict]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def ensure_clean_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def copy_raw_file(source_root: Path, rel_path: Path, label: str) -> dict | None:
    src = source_root / rel_path
    if not src.exists():
        return None

    dest = RAW_DIR / label / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)

    return {
        "label": label,
        "sourcePath": str(src),
        "relativePath": str(rel_path).replace("\\", "/"),
        "copiedTo": str(dest.relative_to(PROJECT_ROOT)).replace("\\", "/"),
        "size": src.stat().st_size,
    }


def parse_section_header(line: str) -> list[dict]:
    sections: list[dict] = []
    for chunk in line.split(";"):
        chunk = chunk.strip()
        if not chunk or ":" not in chunk:
            continue
        name, count = chunk.split(":", 1)
        count = count.strip()
        if count.isdigit():
            sections.append({"name": name.strip(), "count": int(count)})
    return sections


def parse_caption_file(path: Path) -> ParsedCaptionFile:
    lines = [line.strip() for line in read_text(path).splitlines() if line.strip()]
    sections = parse_section_header(lines[0]) if lines else []
    fields: list[dict] = []
    for line in lines[1:]:
        if line == "#":
            continue
        parts = [part.strip() for part in line.split(";")]
        if not parts or not parts[0]:
            continue
        code = parts[0]
        label = parts[1] if len(parts) > 1 else code
        description = parts[2] if len(parts) > 2 else ""
        fields.append(
            {
                "code": code,
                "label": label,
                "description": description,
            }
        )
    return ParsedCaptionFile(name=path.stem, sections=sections, fields=fields)


def parse_grid_names(path: Path) -> list[str]:
    return [line.strip() for line in read_text(path).splitlines() if line.strip()]


def parse_hidden_pairs(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line in read_text(path).splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        parts = re.split(r"\s{2,}|\t+", stripped)
        parts = [part.strip() for part in parts if part.strip()]
        rows.append({"raw": stripped, "parts": parts})
    return rows


def infer_field_groups(fields: Iterable[dict]) -> dict[str, list[dict]]:
    grouped = {
        "identity": [],
        "contract": [],
        "ratings": [],
        "playstyle": [],
        "simControl": [],
        "other": [],
    }
    for field in fields:
        code = field["code"]
        if code in {"Last_Name", "First_Name", "SType", "PortrID", "CF_ID", "Height", "AudioID", "Experience"}:
            grouped["identity"].append(field)
        elif code.startswith("C") or code == "PlaybookID":
            grouped["contract"].append(field)
        elif code.startswith("S"):
            grouped["ratings"].append(field)
        elif code.startswith("P"):
            grouped["playstyle"].append(field)
        elif code.startswith("TO") or code.startswith("TD"):
            grouped["simControl"].append(field)
        else:
            grouped["other"].append(field)
    return grouped


def build_transaction_groups(fields: Iterable[dict]) -> dict[str, object]:
    base_fields: list[dict] = []
    item_fields: dict[str, list[dict]] = {}

    for field in fields:
        code = field["code"]
        match = re.match(r"^I(\d+)_(.+)$", code)
        if not match:
            base_fields.append(field)
            continue
        item_no = match.group(1)
        item_fields.setdefault(item_no, []).append(
            {
                **field,
                "itemNumber": int(item_no),
                "subCode": match.group(2),
            }
        )

    return {
        "baseFields": base_fields,
        "items": [
            {
                "itemNumber": int(item_no),
                "fields": sorted(fields_for_item, key=lambda row: row["subCode"]),
            }
            for item_no, fields_for_item in sorted(item_fields.items(), key=lambda kv: int(kv[0]))
        ],
    }


def build_asset_manifest(game_root: Path) -> dict[str, object]:
    all_files = [path for path in game_root.iterdir() if path.is_file()]
    by_category: dict[str, list[dict]] = {key: [] for key in ASSET_PATTERNS}
    unmatched: list[str] = []

    for path in sorted(all_files, key=lambda p: p.name.lower()):
        lower_name = path.name.lower()
        matched = False
        for category, patterns in ASSET_PATTERNS.items():
            if any(re.search(pattern, lower_name) for pattern in patterns):
                by_category[category].append(
                    {
                        "name": path.name,
                        "size": path.stat().st_size,
                        "extension": path.suffix.lower(),
                    }
                )
                matched = True
        if not matched:
            unmatched.append(path.name)

    return {
        "sourceRoot": str(game_root),
        "categories": by_category,
        "counts": {key: len(value) for key, value in by_category.items()},
        "sampleUnmatched": unmatched[:100],
    }


def ascii_strings(data: bytes, min_len: int = 4, limit: int = 120) -> list[str]:
    pattern = re.compile(rb"[\x20-\x7E]{%d,}" % min_len)
    values: list[str] = []
    seen: set[str] = set()
    for match in pattern.finditer(data):
        text = match.group(0).decode("ascii", errors="ignore").strip()
        if not text or text in seen:
            continue
        values.append(text)
        seen.add(text)
        if len(values) >= limit:
            break
    return values


def utf16le_strings(data: bytes, min_chars: int = 4, limit: int = 120) -> list[str]:
    pattern = re.compile(rb"(?:[\x20-\x7E]\x00){%d,}" % min_chars)
    values: list[str] = []
    seen: set[str] = set()
    for match in pattern.finditer(data):
        text = match.group(0).decode("utf-16le", errors="ignore").strip("\x00").strip()
        if not text or text in seen:
            continue
        values.append(text)
        seen.add(text)
        if len(values) >= limit:
            break
    return values


def analyze_coaches_bin(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    header = data[:128]
    header_words_le = [struct.unpack("<I", header[i : i + 4])[0] for i in range(0, min(len(header), 64), 4)]
    header_words_be = [struct.unpack(">I", header[i : i + 4])[0] for i in range(0, min(len(header), 64), 4)]
    return {
        "sourcePath": str(path),
        "size": len(data),
        "headerHex": binascii.hexlify(header).decode("ascii"),
        "headerWordsLE": header_words_le,
        "headerWordsBE": header_words_be,
        "asciiSample": ascii_strings(data[:8192]),
        "utf16Sample": utf16le_strings(data[:16384]),
        "notes": [
            "coaches.bin appears to be a packed binary table rather than a plain text staff list.",
            "No coach-name-rich string table surfaced from lightweight ASCII/UTF-16 scanning, so future parsing likely needs record layout reverse engineering.",
        ],
    }


def analyze_fxg(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    header = data[:0x300]
    descriptor_entries: list[dict[str, object]] = []
    for off in range(0x28, min(len(header), 0x260), 12):
        chunk = header[off : off + 12]
        if len(chunk) < 12:
            break
        le = struct.unpack("<III", chunk)
        be = struct.unpack(">III", chunk)
        descriptor_entries.append(
            {
                "offsetHex": f"0x{off:04X}",
                "rawHex": binascii.hexlify(chunk).decode("ascii"),
                "littleEndian": {"a": le[0], "b": le[1], "c": le[2]},
                "bigEndian": {"a": be[0], "b": be[1], "c": be[2]},
            }
        )
    return {
        "sourcePath": str(path),
        "size": len(data),
        "headerHex": binascii.hexlify(header).decode("ascii"),
        "descriptorEntries": descriptor_entries,
        "asciiSample": ascii_strings(data[:4096]),
        "utf16Sample": utf16le_strings(data[:4096]),
        "notes": [
            "Association6.FXG exposes a stable descriptor-table-like region starting at 0x28.",
            "Both endianness views are preserved because the exact semantics of each descriptor word are not fully decoded yet.",
        ],
    }


def write_ts_module(path: Path, const_name: str, payload: object, header: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    json_payload = json.dumps(payload, indent=2, ensure_ascii=False)
    path.write_text(
        f"{header}\n\nexport const {const_name} = {json_payload} as const;\n",
        encoding="utf-8",
    )


def main() -> None:
    game_root = DEFAULT_GAME_ROOT
    red_mc_root = DEFAULT_RED_MC_ROOT
    save_file = DEFAULT_SAVE_FILE

    ensure_clean_dir(OUT_DIR)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    captions_dir = red_mc_root / "Text" / "NBA2K14" / "Captions"
    caption_files = sorted(captions_dir.glob("*.txt"))
    parsed_captions = [parse_caption_file(path) for path in caption_files]
    captions_map = {
        parsed.name: {
            "sections": parsed.sections,
            "fields": parsed.fields,
        }
        for parsed in parsed_captions
    }

    grid_names = parse_grid_names(red_mc_root / "Text" / "NBA2K14" / "GridNames.txt")
    hidden_arena_ids = parse_hidden_pairs(
        red_mc_root
        / "Tutorials"
        / "NBA 2K14"
        / "XBox 360 Disc Contents (by Rondo is GOD)"
        / "HIDDEN ARENA IDs.txt"
    )
    hidden_coach_audio = parse_hidden_pairs(
        red_mc_root
        / "Tutorials"
        / "NBA 2K14"
        / "XBox 360 Disc Contents (by Rondo is GOD)"
        / "Hidden Coach Audio.txt"
    )
    hidden_logos = parse_hidden_pairs(
        red_mc_root
        / "Tutorials"
        / "NBA 2K14"
        / "XBox 360 Disc Contents (by Rondo is GOD)"
        / "HIDDEN LOGOS.txt"
    )

    copied_files = []
    for label, rel_path in RAW_COPY_FILES:
        source_root = red_mc_root if label == "RED MC" else game_root
        copied = copy_raw_file(source_root, rel_path, label.lower().replace(" ", "_"))
        if copied:
            copied_files.append(copied)

    for caption_file in caption_files:
        copied = copy_raw_file(red_mc_root, caption_file.relative_to(red_mc_root), "red_mc")
        if copied:
            copied_files.append(copied)

    asset_manifest = build_asset_manifest(game_root)
    coaches_binary_analysis = analyze_coaches_bin(game_root / "coaches.bin")
    fxg_binary_analysis = analyze_fxg(save_file)
    coaches_schema = {
        "source": "RED MC NBA2K14 staff + coach stat captions",
        "identity": infer_field_groups(captions_map["Staff"]["fields"])["identity"],
        "contract": infer_field_groups(captions_map["Staff"]["fields"])["contract"],
        "ratings": infer_field_groups(captions_map["Staff"]["fields"])["ratings"],
        "playstyle": infer_field_groups(captions_map["Staff"]["fields"])["playstyle"],
        "simControl": infer_field_groups(captions_map["Staff"]["fields"])["simControl"],
        "other": infer_field_groups(captions_map["Staff"]["fields"])["other"],
        "seasonHistory": captions_map["CoachStat"]["fields"],
        "hiddenCoachAudio": hidden_coach_audio,
        "notes": [
            "This is translated schema metadata, not parsed coach rows from coaches.bin or FXG.",
            "The playstyle and sim-control fields line up well with nba-commish coach tendency systems.",
        ],
    }
    transaction_schema = {
        "source": "RED MC NBA2K14 transaction captions",
        **build_transaction_groups(captions_map["Transaction"]["fields"]),
        "notes": [
            "These fields are useful for building Football Manager-style transaction logs and headline generators.",
            "The schema is grouped into base timestamp/order fields plus repeating item slots.",
        ],
    }
    text_template_sources = {
        "source": "Local RED MC tutorial/docs and discovered 2K14 files",
        "gridNames": grid_names,
        "hiddenArenaIds": hidden_arena_ids,
        "hiddenLogos": hidden_logos,
        "candidateAssetBuckets": asset_manifest["counts"],
        "headlineSeedFiles": [
            "careerupdaterecap.iff",
            "draft_lines.bin",
            "socialmedia_profilepics.iff",
            "franchise.iff",
            "career_endorsements.iff",
        ],
        "notes": [
            "Most headline/news text in NBA 2K14 is not exposed as plain text in this install, so these are source hints and schema references rather than extracted prose.",
            "Use the caption labels and transaction structure as generators for nba-commish-native templates.",
        ],
    }
    import_index = {
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "projectRoot": str(PROJECT_ROOT),
        "sources": {
            "gameRoot": str(game_root),
            "redMcRoot": str(red_mc_root),
        },
        "copiedRawFiles": copied_files,
        "generatedModules": [
            "assetManifest.ts",
            "captions.ts",
            "coachSchema.ts",
            "coachesBinaryAnalysis.ts",
            "fxgBinaryAnalysis.ts",
            "tables.ts",
            "textTemplateSources.ts",
            "transactionSchema.ts",
            "index.ts",
        ],
    }

    header = "// Auto-generated by python/extract_2k_importables.py. Edit the generator, not this file."
    write_ts_module(OUT_DIR / "assetManifest.ts", "twoKAssetManifest", asset_manifest, header)
    write_ts_module(OUT_DIR / "captions.ts", "twoKCaptions", captions_map, header)
    write_ts_module(OUT_DIR / "coachSchema.ts", "twoKCoachSchema", coaches_schema, header)
    write_ts_module(OUT_DIR / "coachesBinaryAnalysis.ts", "twoKCoachesBinaryAnalysis", coaches_binary_analysis, header)
    write_ts_module(OUT_DIR / "fxgBinaryAnalysis.ts", "twoKFxgBinaryAnalysis", fxg_binary_analysis, header)
    write_ts_module(OUT_DIR / "tables.ts", "twoKTables", {"gridNames": grid_names}, header)
    write_ts_module(OUT_DIR / "textTemplateSources.ts", "twoKTextTemplateSources", text_template_sources, header)
    write_ts_module(OUT_DIR / "transactionSchema.ts", "twoKTransactionSchema", transaction_schema, header)
    write_ts_module(OUT_DIR / "importIndex.ts", "twoKImportIndex", import_index, header)

    (OUT_DIR / "index.ts").write_text(
        "\n".join(
            [
                "// Auto-generated by python/extract_2k_importables.py.",
                "export { twoKAssetManifest } from './assetManifest';",
                "export { twoKCaptions } from './captions';",
                "export { twoKCoachSchema } from './coachSchema';",
                "export { twoKCoachesBinaryAnalysis } from './coachesBinaryAnalysis';",
                "export { twoKFxgBinaryAnalysis } from './fxgBinaryAnalysis';",
                "export { twoKImportIndex } from './importIndex';",
                "export { twoKTables } from './tables';",
                "export { twoKTextTemplateSources } from './textTemplateSources';",
                "export { twoKTransactionSchema } from './transactionSchema';",
                "",
            ]
        ),
        encoding="utf-8",
    )

    (OUT_DIR / "README.md").write_text(
        "\n".join(
            [
                "# 2K Import Bundle",
                "",
                "Generated from the local NBA 2K14 install and RED MC text metadata.",
                "",
                "Use `python\\extract_2k_importables.py` to regenerate.",
                "",
                "Contents:",
                "- `raw/`: copied source text files from RED MC",
                "- `captions.ts`: parsed RED MC caption metadata",
                "- `coachSchema.ts`: nba-commish-friendly coach/staff schema",
                "- `coachesBinaryAnalysis.ts`: binary/header hints for `coaches.bin`",
                "- `fxgBinaryAnalysis.ts`: descriptor/header hints for `Association6.FXG`",
                "- `transactionSchema.ts`: grouped transaction schema for logs/templates",
                "- `assetManifest.ts`: candidate 2K file manifest by category",
                "- `textTemplateSources.ts`: local template/news/headline seed references",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"Wrote translated 2K import bundle to: {OUT_DIR}")


if __name__ == "__main__":
    main()
