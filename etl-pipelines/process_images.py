import os
import re
import shutil
from pathlib import Path
import pandas as pd
from tqdm import tqdm
from PIL import Image

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
    
    # Cache the list of existing folder names in each NFS subdirectory to prevent slow NFS roundtrips
    print("Caching NFS directory structure...")
    existing_folders = {}
    subdirs_to_cache = ['Islandora_Objects', 'Islandora_Library', 'Islandora_Converted_Objects', 'Islandora_Education']
    for subdir in subdirs_to_cache:
        path = DIGITAL_IMAGES_DIR / subdir
        if path.exists() and path.is_dir():
            try:
                # Use a set for O(1) lookups
                existing_folders[subdir] = set(os.listdir(path))
                print(f"  Cached {len(existing_folders[subdir])} folders in {subdir}")
            except Exception as e:
                print(f"  ⚠️ Failed to cache {subdir}: {e}")
                existing_folders[subdir] = set()
        else:
            existing_folders[subdir] = set()
    
    # Cache existing local output images to prevent slow exists() filesystem lookups
    print("Caching local processed images...")
    existing_dest_images = set(f.name for f in OUTPUT_DIR.glob('*.jpg'))
    print(f"  Cached {len(existing_dest_images)} processed images.")
    
    # 2. Iterate and locate image files using routed priority search
    copied_count = 0
    already_exists_count = 0
    not_found_count = 0
    
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Searching and copying images"):
        identifier = row.get('field_identifier')
        source_system = row.get('source_system')
        
        if pd.isna(identifier) or not identifier:
            continue
            
        identifier_str = str(identifier).strip()
        
        # Handle compound semicolon-separated identifiers (e.g. "ID1 ; ID2 ; ID3")
        # Split and resolve to the primary ID to avoid OS filename length limits (Errno 36)
        id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
        primary_id = id_parts[0] if id_parts else identifier_str
        
        # Safety length check for OS filesystem limits (maximum 255 characters)
        if len(primary_id) > 200:
            print(f"⚠️ Skipping ID (exceeds file system length limit): {primary_id[:60]}...")
            continue
            
        dest_filename = f"{primary_id}.jpg"
        dest_path = OUTPUT_DIR / dest_filename
        
        # Skip if already copied to avoid duplicate processing
        if dest_filename in existing_dest_images:
            already_exists_count += 1
            continue
            
        # Determine the search priority directories based on catalog system
        if source_system == 'Proficio':
            search_subdirs = ['Islandora_Objects', 'Islandora_Converted_Objects']
        elif source_system == 'Alma':
            search_subdirs = ['Islandora_Library', 'Islandora_Converted_Objects']
        else:
            search_subdirs = ['Islandora_Objects', 'Islandora_Library', 'Islandora_Converted_Objects', 'Islandora_Education']
            
        # Collect candidate subfolder names on NFS (full name first, then sub-parts)
        search_candidates = []
        if len(identifier_str) < 200:
            search_candidates.append(identifier_str)
        for part in id_parts:
            if part not in search_candidates and len(part) < 200:
                search_candidates.append(part)
                
        found = False
        
        for candidate in search_candidates:
            if found:
                break
                
            for subdir in search_subdirs:
                # O(1) in-memory check to bypass expensive NFS metadata network requests
                if candidate in existing_folders.get(subdir, set()):
                    obj_dir = DIGITAL_IMAGES_DIR / subdir / candidate
                    if obj_dir.is_dir():
                        # Find TIFF, JPEG, PNG or GIF files inside (case-insensitive glob)
                        image_files = []
                        for ext in ['*.tif', '*.tiff', '*.jpg', '*.jpeg', '*.png', '*.TIF', '*.TIFF', '*.JPG', '*.JPEG', '*.PNG']:
                            image_files.extend(obj_dir.glob(f"**/{ext}"))
                                      
                        # Exclude any hidden files (like Mac ._ files)
                        image_files = [f for f in image_files if not f.name.startswith('.')]
                        
                        if image_files:
                            # Select the largest file (usually the highest resolution preview)
                            best_file = max(image_files, key=lambda f: f.stat().st_size)
                            
                            try:
                                if best_file.suffix.lower() in ['.tif', '.tiff']:
                                    # Convert TIFF to JPEG on the fly
                                    with Image.open(best_file) as img:
                                        rgb_img = img.convert('RGB')
                                        
                                        # Resize to max 1200px on the longest side to save disk space and bandwidth
                                        max_size = 1200
                                        if max(rgb_img.size) > max_size:
                                            try:
                                                resample_method = Image.Resampling.LANCZOS
                                            except AttributeError:
                                                resample_method = Image.ANTIALIAS
                                            rgb_img.thumbnail((max_size, max_size), resample_method)
                                            
                                        rgb_img.save(dest_path, 'JPEG', quality=80)
                                else:
                                    # Copy JPEGs/PNGs directly
                                    shutil.copy2(best_file, dest_path)
                                copied_count += 1
                                existing_dest_images.add(dest_filename)
                                found = True
                                break  # Found image for this candidate, break from subdirs loop
                            except Exception as e:
                                print(f"⚠️ Failed to copy/convert {best_file.name}: {e}")
                                
        if not found:
            not_found_count += 1
            
    print(f"\n🏁 Finished Ingestion:")
    print(f"   Newly Copied Images: {copied_count}")
    print(f"   Already Existed: {already_exists_count}")
    print(f"   Not Found in NFS: {not_found_count}")
    print(f"   Total JPEGs stored locally: {len(list(OUTPUT_DIR.glob('*.jpg')))}")
