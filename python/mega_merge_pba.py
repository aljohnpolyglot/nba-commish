import json
import re

# FILE PATHS
SOURCE_IMAGES = r"C:\Users\user-MSI\Downloads\pba_database_v3.json"
SOURCE_STATS = r"C:\Users\user-MSI\Downloads\pba_full_database.json"
TARGET_FILE = r"C:\Users\user-MSI\Downloads\PBA_cleaned.json"
OUTPUT_FILE = r"C:\Users\user-MSI\Downloads\PBA_Final_Cleaned.json"

def normalize(name):
    """Simple cleaner: Uppercase, keep only letters and spaces."""
    if not name: return ""
    # Remove anything that isn't a letter or space, then uppercase
    clean = re.sub(r'[^a-zA-Z\s]', '', name)
    return " ".join(clean.upper().split())

def get_first_last(name):
    """Returns just the first and last word of a name."""
    parts = normalize(name).split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1]}"
    return normalize(name)

def parse_height_to_inches(h_str):
    try:
        match = re.search(r"(\d+)-(\d+)", h_str)
        if match:
            return (int(match.group(1)) * 12) + int(match.group(2))
    except: return None
    return None

def map_position(pos_str):
    if not pos_str: return "G"
    p = pos_str.upper()
    if any(x in p for x in ["PG", "SG", "GUARD", " G"]): return "G"
    if any(x in p for x in ["SF", "PF", "FORWARD", " F"]): return "F"
    if "C" in p: return "C"
    return "G"

def mega_merge():
    print("🚀 Starting PBA Mega Merge (Regex Fixed)...")
    
    try:
        with open(SOURCE_IMAGES, 'r', encoding='utf-8') as f:
            src_imgs = json.load(f)
        with open(SOURCE_STATS, 'r', encoding='utf-8') as f:
            src_stats = json.load(f)
        with open(TARGET_FILE, 'r', encoding='utf-8') as f:
            target_data = json.load(f)
    except FileNotFoundError as e:
        print(f"❌ Error: Could not find file - {e}")
        return

    # Create lookup maps
    img_full_map = {normalize(p['full_name']): p for p in src_imgs}
    img_fl_map = {get_first_last(p['full_name']): p for p in src_imgs}
    
    stats_full_map = {normalize(p['name']): p for p in src_stats}
    stats_fl_map = {get_first_last(p['name']): p for p in src_stats}

    img_count = 0
    stats_count = 0

    for p in target_data['players']:
        first = p.get('firstName', '')
        last = p.get('lastName', '')
        target_full = normalize(f"{first} {last}")
        target_fl = get_first_last(f"{first} {last}")
        
        # --- 1. SEARCH FOR IMAGE ---
        img_match = img_full_map.get(target_full) or img_fl_map.get(target_fl)

        if img_match:
            p['imgURL'] = img_match['image_url']
            if img_match.get('school') and img_match['school'] != "-":
                p['college'] = img_match['school']
            
            new_pos = map_position(img_match.get('position_number'))
            p['pos'] = new_pos
            if p.get('ratings'):
                for r in p['ratings']:
                    r['pos'] = new_pos
            img_count += 1

        # --- 2. SEARCH FOR BIO & ATTRIBUTE NERF ---
        stat_match = stats_full_map.get(target_full) or stats_fl_map.get(target_fl)

        if stat_match:
            # BIO HEIGHT
            inches = parse_height_to_inches(stat_match.get('height', ""))
            if inches:
                p['hgt'] = inches
            
            # ATTRIBUTE HEIGHT NERF (Inside Ratings)
            if p.get('ratings'):
                for r in p['ratings']:
                    # Original value * 0.9 nerf
                    r['hgt'] = int(round(r.get('hgt', 50) * 0.9))

            # Born Year
            y_match = re.search(r"(\d{4})", stat_match.get('born', ""))
            if y_match: p['born']['year'] = int(y_match.group(1))

            # Draft Year
            d_match = re.search(r"(\d{4})", stat_match.get('draft', ""))
            if d_match: p['draft']['year'] = int(d_match.group(1))
            
            stats_count += 1

    # SAVE RESULT
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, indent=2)

    print(f"\n✅ MERGE SUCCESSFUL!")
    print(f"Total Players: {len(target_data['players'])}")
    print(f"Photos Synced: {img_count}")
    print(f"Bio Data Synced: {stats_count}")
    print(f"Saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    mega_merge()