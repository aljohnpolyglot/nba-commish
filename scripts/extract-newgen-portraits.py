"""
Extract Texture2D assets from a Unity AssetBundle into PNGs + manifest.

Usage:
    python scripts/extract-newgen-portraits.py <bundle_path> [out_dir]

Defaults:
    out_dir = public/img/newgen
"""
import json
import sys
from pathlib import Path

import UnityPy


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    bundle_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("public/img/newgen")

    if not bundle_path.is_file():
        print(f"ERROR: bundle not found: {bundle_path}")
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Loading bundle: {bundle_path}  ({bundle_path.stat().st_size / 1_048_576:.1f} MB)")

    env = UnityPy.load(str(bundle_path))

    type_counts: dict[str, int] = {}
    manifest: list[dict] = []
    extracted = 0
    failed = 0

    for obj in env.objects:
        type_counts[obj.type.name] = type_counts.get(obj.type.name, 0) + 1
        if obj.type.name != "Texture2D":
            continue
        try:
            data = obj.read()
            name = (data.m_Name or f"unnamed_{obj.path_id}").strip() or f"unnamed_{obj.path_id}"
            safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in name)
            img = data.image
            if img is None:
                failed += 1
                continue
            png_path = out_dir / f"{safe_name}.png"
            img.save(png_path)
            manifest.append({
                "id": safe_name,
                "name": name,
                "width": img.width,
                "height": img.height,
                "path_id": int(obj.path_id),
            })
            extracted += 1
            if extracted % 100 == 0:
                print(f"  ... {extracted} extracted")
        except Exception as exc:
            failed += 1
            print(f"  FAIL path_id={obj.path_id}: {exc}")

    manifest.sort(key=lambda r: r["id"])
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\n--- Summary ---")
    print(f"Object types in bundle: {type_counts}")
    print(f"Texture2D extracted: {extracted}")
    print(f"Texture2D failed:    {failed}")
    print(f"Output dir:          {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
