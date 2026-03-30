import json
import os

# Define file paths (Adjusted to your provided paths)
SOURCE_FILE = r"C:\Users\user-MSI\Downloads\pba_database_v3.json"
TARGET_FILE = r"C:\Users\user-MSI\Downloads\pba_full_database.json"
OUTPUT_FILE = r"C:\Users\user-MSI\Downloads\pba_final_merged.json"

def normalize(name):
    """Clean name for better matching."""
    return " ".join(name.upper().replace(".", "").replace("-", " ").split())

def get_parts(name):
    """Split name into components."""
    parts = normalize(name).split()
    if len(parts) < 2:
        return parts, "", ""
    return parts, parts[0], parts[-1]

def run_merger():
    # Load Source (the one with the good images)
    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        source_data = json.load(f)

    # Load Target (the one with the full stats)
    with open(TARGET_FILE, 'r', encoding='utf-8') as f:
        target_data = json.load(f)

    # We keep track of which source items have been used
    used_source_indices = set()
    matches_found = 0

    print(f"Starting merge: {len(target_data)} targets, {len(source_data)} sources.")

    # Pass 1: Exact Name Match
    for target in target_data:
        t_name = normalize(target.get('name', ''))
        for i, source in enumerate(source_data):
            if i in used_source_indices: continue
            
            s_full_name = normalize(source.get('full_name', ''))
            
            if t_name == s_full_name:
                target['image'] = source['image_url']
                target['school'] = source.get('school', 'N/A')
                used_source_indices.add(i)
                matches_found += 1
                break

    # Pass 2: First + Last Name Match (Removing middle names)
    for target in target_data:
        if 'pba.ph' in target.get('image', ''): continue # Skip if already matched
        
        t_parts, t_first, t_last = get_parts(target.get('name', ''))
        for i, source in enumerate(source_data):
            if i in used_source_indices: continue
            
            s_parts, s_first, s_last = get_parts(source.get('full_name', ''))
            
            if t_first == s_first and t_last == s_last:
                target['image'] = source['image_url']
                target['school'] = source.get('school', 'N/A')
                used_source_indices.add(i)
                matches_found += 1
                break

    # Pass 3: First Initial + Last Name Match
    for target in target_data:
        if 'pba.ph' in target.get('image', ''): continue
        
        t_parts, t_first, t_last = get_parts(target.get('name', ''))
        if not t_first: continue

        for i, source in enumerate(source_data):
            if i in used_source_indices: continue
            
            s_parts, s_first, s_last = get_parts(source.get('full_name', ''))
            if not s_first: continue
            
            # Match R. Pogoy with Roger Pogoy
            if t_first[0] == s_first[0] and t_last == s_last:
                target['image'] = source['image_url']
                target['school'] = source.get('school', 'N/A')
                used_source_indices.add(i)
                matches_found += 1
                break

    # Pass 4: Orphan Match (Surname only)
    for target in target_data:
        if 'pba.ph' in target.get('image', ''): continue
        
        t_parts, t_first, t_last = get_parts(target.get('name', ''))
        
        for i, source in enumerate(source_data):
            if i in used_source_indices: continue
            
            s_parts, s_first, s_last = get_parts(source.get('full_name', ''))
            
            if t_last == s_last:
                print(f"⚠️ Orphan match by surname: {target['name']} <-> {source['full_name']}")
                target['image'] = source['image_url']
                target['school'] = source.get('school', 'N/A')
                used_source_indices.add(i)
                matches_found += 1
                break

    # Save the Result
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, indent=2)

    print(f"\n✅ SUCCESS!")
    print(f"Total matches found and images updated: {matches_found}")
    print(f"Final database saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    run_merger()