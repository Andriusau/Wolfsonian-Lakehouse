import os
import shutil
from pathlib import Path
import pandas as pd
from tqdm import tqdm

# --- CONFIGURATION ---
DIGITAL_IMAGES_DIR = Path('/app/data/raw/digital_images')
OUTPUT_DIR = Path('/app/data/gold/images')
PARQUET_FILE = Path('/app/data/gold/unified_catalog_normalized.parquet')

def normalize_name(s):
    if not s: return ""
    s = str(s).lower().strip()
    # Normalize common characters to align filename with field_identifier
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

if __name__ == "__main__":
    print("--- 📸 STARTING LOCAL IMAGE INGESTION PIPELINE ---")
    
    if not PARQUET_FILE.exists():
        print(f"❌ Normalized catalog not found at {PARQUET_FILE}. Run normalization script first.")
        exit(1)
        
    if not DIGITAL_IMAGES_DIR.exists():
        print(f"❌ Digital Images directory not found at {DIGITAL_IMAGES_DIR}. Make sure the volume is mounted.")
        exit(1)
        
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Load catalog records
    df = pd.read_parquet(PARQUET_FILE)
    print(f"Loaded {len(df)} records from catalog.")
    
    # 2. Iterate and locate image files using routed priority search
    copied_count = 0
    already_exists_count = 0
    not_found_count = 0
    
    # Use iterrows to inspect the source_system of each record
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Searching and copying images"):
        identifier = row.get('field_identifier')
        source_system = row.get('source_system')
        
        if pd.isna(identifier) or not identifier:
            continue
            
        identifier_str = str(identifier).strip()
        dest_path = OUTPUT_DIR / f"{identifier_str}.jpg"
        
        # Skip if already copied to avoid duplicate processing
        if dest_path.exists():
            already_exists_count += 1
            continue
            
        # Determine the search priority directories based on catalog system
        if source_system == 'Proficio':
            # Museum objects first check Islandora_Objects, then check Islandora_Converted_Objects
            search_subdirs = ['Islandora_Objects', 'Islandora_Converted_Objects']
        elif source_system == 'Alma':
            # Library books first check Islandora_Library, then check Islandora_Converted_Objects
            search_subdirs = ['Islandora_Library', 'Islandora_Converted_Objects']
        else:
            # Fallback to check all folders
            search_subdirs = ['Islandora_Objects', 'Islandora_Library', 'Islandora_Converted_Objects', 'Islandora_Education']
            
        found = False
        
        for subdir in search_subdirs:
            obj_dir = DIGITAL_IMAGES_DIR / subdir / identifier_str
            
            if obj_dir.exists() and obj_dir.is_dir():
                # Find any JPEG, JPG, or PNG files inside
                image_files = list(obj_dir.glob('**/*.jpg')) + \
                              list(obj_dir.glob('**/*.jpeg')) + \
                              list(obj_dir.glob('**/*.png'))
                              
                # Exclude any hidden files (like Mac ._ files)
                image_files = [f for f in image_files if not f.name.startswith('.')]
                
                if image_files:
                    # Select the largest file (usually the highest resolution preview)
                    best_file = max(image_files, key=lambda f: f.stat().st_size)
                    
                    try:
                        # Copy to destination as JPG
                        shutil.copy2(best_file, dest_path)
                        copied_count += 1
                        found = True
                        break  # Found matching image in priority directory, proceed to next record
                    except Exception as e:
                        print(f"⚠️ Failed to copy {best_file.name}: {e}")
                        
        if not found:
            not_found_count += 1
            
    print(f"\n🏁 Finished Ingestion:")
    print(f"   Newly Copied Images: {copied_count}")
    print(f"   Already Existed: {already_exists_count}")
    print(f"   Not Found in NFS: {not_found_count}")
    print(f"   Total JPEGs stored locally: {len(list(OUTPUT_DIR.glob('*.jpg')))}")
