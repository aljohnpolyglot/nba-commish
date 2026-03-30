import json
import os

# List of all files to combine
FILES = [
    "nbastoreshorts.json",
    "nbastorehoodies.json",
    "nbastorehats.json",
    "nbastorehardwoodclassics.json",
    "nbastoretshirts.json",
    "nbastoreaccesories.json",
    "nbastorecollectibles.json",
    "nbastorefootwear.json",
    "nbastorejerseys.json"
]

DOWNLOADS_PATH = r"C:\Users\user-MSI\Downloads"
OUTPUT_FILE = os.path.join(DOWNLOADS_PATH, "nbastore_master_database.json")

def merge_nba_store_data():
    master_list = []
    
    print("🏀 Starting NBA Store JSON Merger...")

    for filename in FILES:
        file_path = os.path.join(DOWNLOADS_PATH, filename)
        
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    # Determine category from filename
                    category = filename.replace("nbastore", "").replace(".json", "").capitalize()
                    
                    # If data is a list of items
                    if isinstance(data, list):
                        for item in data:
                            item['category'] = category
                        master_list.extend(data)
                        print(f"✅ Added {len(data)} items from {filename} ({category})")
                    else:
                        print(f"⚠️ Warning: {filename} is not a list format. Skipping.")
            
            except Exception as e:
                print(f"❌ Error reading {filename}: {e}")
        else:
            print(f"❓ File not found: {filename}")

    # Write the combined file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(master_list, f, indent=2)

    print(f"\n🔥 SUCCESS! Combined {len(master_list)} total items.")
    print(f"📂 Master File: {OUTPUT_FILE}")

if __name__ == "__main__":
    merge_nba_store_data()