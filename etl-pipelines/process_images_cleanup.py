import os
import re
import sys
import argparse
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
from tqdm import tqdm
from PIL import Image, ImageFile, ImageOps, TiffImagePlugin

# Configure PIL for large heritage images and legacy TIFF files
Image.MAX_IMAGE_PIXELS = 250000000
ImageFile.LOAD_TRUNCATED_IMAGES = True
if hasattr(TiffImagePlugin, 'MAX_SAMPLESPERPIXEL'):
    TiffImagePlugin.MAX_SAMPLESPERPIXEL = 10

# --- CONFIGURATION & PATH RESOLUTION ---
BASE_DIR = Path('/app') if Path('/app/data').exists() else Path(__file__).resolve().parent.parent
DIGITAL_IMAGES_DIR = BASE_DIR / 'data/raw/digital_images'
ISLANDORA_LIB_DIR = DIGITAL_IMAGES_DIR / 'Islandora_Library'
OUTPUT_DIR = BASE_DIR / 'data/gold/images'
PARQUET_FILE = BASE_DIR / 'data/gold/unified_catalog_normalized.parquet'
ERROR_REPORT_FILE = BASE_DIR / 'data/gold/image_cleanup_errors_report.csv'

XLSX_CANDIDATE_PATHS = [
    BASE_DIR / 'islandora_library_children_to_parents_review.xlsx',
    BASE_DIR / 'data/export/islandora_library_children_to_parents_review.xlsx',
]

MAX_IMAGE_SIZE = int(os.environ.get('MAX_IMAGE_SIZE', '1920'))
OVERWRITE_IMAGES = os.environ.get('OVERWRITE_IMAGES', 'false').lower() in ('true', '1', 'yes')

FATAL_FILES_TO_SKIP = {
    'WOLF_library_XB1990.534_038.tif',
    'WOLF_library_XB1990.1227_052.tif',
    'WOLF_library_XC2019.02.1.62_226 2.tif',
    'WOLF_library_XB1990.879_041.tif',
    'WOLF_library_XB2020.11.1.4_024 (2).tif'
}

VALID_IMAGE_EXTS = {'.tif', '.tiff', '.jpg', '.jpeg', '.png'}

def normalize_name(s):
    if not s: return ""
    s = str(s).lower().strip()
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

def get_media_filename(s):
    if not s: return ""
    return re.sub(r'[^a-zA-Z0-9.-]', '_', str(s).strip())

def natural_sort_key(s):
    """Sort strings containing numbers naturally (e.g. item.2 comes before item.10)."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

def load_rollup_mapping(include_medium=False):
    """
    Loads rollup mappings from the audit Excel spreadsheet if available,
    or falls back to dynamic catalog prefix analysis.
    """
    xlsx_path = None
    for p in XLSX_CANDIDATE_PATHS:
        if p.exists():
            xlsx_path = p
            break

    if xlsx_path:
        print(f"📖 Loading parent-child rollup definitions from {xlsx_path}...")
        try:
            df_rollups = pd.read_excel(xlsx_path, sheet_name='Proposed Rollups')
            print(f"   Found {len(df_rollups)} candidate rows in spreadsheet.")
            
            # Filter by confidence level
            if not include_medium:
                # High confidence only (Explicitly Referenced, Numeric Sub-item, Letter Suffix)
                df_filtered = df_rollups[df_rollups['Confidence'].astype(str).str.startswith('High')].copy()
                print(f"   Filtered to {len(df_filtered)} HIGH-CONFIDENCE folders (skipped {len(df_rollups) - len(df_filtered)} medium-confidence).")
            else:
                df_filtered = df_rollups.copy()
                print(f"   Including ALL {len(df_filtered)} candidate folders (including medium confidence).")

            mapping = []
            for _, row in df_filtered.iterrows():
                folder = str(row['Islandora Folder Name']).strip()
                parent_id = str(row['Proposed Parent ID']).strip()
                conf = str(row.get('Confidence', 'Unknown'))
                mapping.append({
                    'folder_name': folder,
                    'parent_id': parent_id,
                    'confidence': conf
                })
            return mapping
        except Exception as e:
            print(f"⚠️ Failed to read Excel workbook: {e}. Falling back to dynamic catalog matching.")

    # Dynamic fallback if Excel is not present
    print("🔍 Generating rollup mappings dynamically from catalog and Islandora_Library...")
    if not PARQUET_FILE.exists() or not ISLANDORA_LIB_DIR.exists():
        raise RuntimeError("Cannot generate mappings dynamically: missing catalog or Islandora_Library directory.")

    df_cat = pd.read_parquet(PARQUET_FILE)
    catalog_lookup = {}
    for _, row in df_cat.iterrows():
        raw_id = str(row.get('field_identifier', ''))
        parts = [p.strip() for p in raw_id.split(';') if p.strip()]
        for part in parts:
            norm = normalize_name(part)
            if norm and norm not in catalog_lookup:
                catalog_lookup[norm] = {'raw_id': raw_id, 'matched_part': part}

    folders = [f for f in os.listdir(ISLANDORA_LIB_DIR) if not f.startswith('.')]
    mapping = []

    for folder in sorted(folders):
        norm_folder = normalize_name(folder)
        if norm_folder in catalog_lookup:
            continue # Exact match, already handled

        parts = norm_folder.split('.')
        parent_cand = None
        matched_key = None
        for i in range(len(parts) - 1, 0, -1):
            cand_key = '.'.join(parts[:i])
            if cand_key in catalog_lookup:
                parent_cand = catalog_lookup[cand_key]
                matched_key = cand_key
                break

        if parent_cand:
            suffix = norm_folder[len(matched_key):].strip('.')
            parent_raw = parent_cand['raw_id']
            is_high = False
            if folder.lower() in parent_raw.lower() or suffix in parent_raw or suffix.isdigit() or re.match(r'^[a-zA-Z]$', suffix):
                is_high = True

            if is_high or include_medium:
                mapping.append({
                    'folder_name': folder,
                    'parent_id': parent_cand['matched_part'],
                    'confidence': 'High' if is_high else 'Medium'
                })

    print(f"   Dynamically identified {len(mapping)} rollup folders.")
    return mapping

def convert_and_save_image(src_path, dest_path):
    """Safely opens, transforms, and compresses an image to web-ready JPEG."""
    if src_path.name in FATAL_FILES_TO_SKIP:
        raise ValueError(f"Skipping {src_path.name} (in FATAL_FILES_TO_SKIP)")

    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        rgb_img = img.convert('RGB')
        max_size = MAX_IMAGE_SIZE
        if max(rgb_img.size) > max_size:
            try:
                resample_method = Image.Resampling.LANCZOS
            except AttributeError:
                resample_method = Image.ANTIALIAS
            rgb_img.thumbnail((max_size, max_size), resample_method)
        rgb_img.save(dest_path, 'JPEG', quality=80)

def process_single_task(task_spec):
    """
    Worker task: processes one source image and creates the parent-rolled-up destination JPEG
    and optional child alias hardlink.
    """
    src_file, dest_file, child_alias_file, dry_run = task_spec

    if dry_run:
        return 'dry_run', dest_file.name, None

    if not OVERWRITE_IMAGES and dest_file.exists():
        # Parent image already exists; ensure child alias link is in place
        if child_alias_file and not child_alias_file.exists():
            try:
                os.link(dest_file, child_alias_file)
            except Exception:
                pass
        return 'already_exists', dest_file.name, None

    try:
        convert_and_save_image(src_file, dest_file)
        # Create child alias if applicable
        if child_alias_file and not child_alias_file.exists():
            try:
                os.link(dest_file, child_alias_file)
            except Exception:
                pass
        return 'success', dest_file.name, None
    except Exception as e:
        return 'error', dest_file.name, f"{src_file.name}: {e}"

def main():
    parser = argparse.ArgumentParser(description="Roll up Islandora Library child/plate folders to parent catalog records.")
    parser.add_argument('--dry-run', action='store_true', default=os.environ.get('DRY_RUN', 'false').lower() in ('true', '1', 'yes'),
                        help="Simulate the cleanup without writing any files.")
    parser.add_argument('--include-medium', action='store_true', default=os.environ.get('INCLUDE_MEDIUM', 'false').lower() in ('true', '1', 'yes'),
                        help="Include Medium-confidence prefix candidates in addition to High-confidence.")
    parser.add_argument('--limit', type=int, default=int(os.environ.get('LIMIT', '0')),
                        help="Limit the number of parent records to process (useful for smoke tests).")
    parser.add_argument('--workers', type=int, default=int(os.environ.get('MAX_WORKERS', '16')),
                        help="Number of concurrent worker threads.")
    args = parser.parse_args()

    print("=================================================================")
    print("🧹 STARTING ISLANDORA LIBRARY CHILD-TO-PARENT CLEANUP PIPELINE")
    print(f"Mode: {'DRY RUN (Preview Only)' if args.dry_run else 'LIVE PROCESSING'}")
    print(f"Confidence Filter: {'High + Medium' if args.include_medium else 'High Confidence Only (Tiers 1, 2, 3)'}")
    print(f"Max Image Dimension: {MAX_IMAGE_SIZE}px | Threads: {args.workers}")
    print("=================================================================\n")

    if not args.dry_run:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load mappings
    mappings = load_rollup_mapping(include_medium=args.include_medium)
    if not mappings:
        print("❌ No rollup mappings found to process. Exiting.")
        return

    # 2. Group child folders by Parent ID
    parent_to_folders = defaultdict(list)
    for m in mappings:
        parent_to_folders[m['parent_id']].append(m['folder_name'])

    total_parents = len(parent_to_folders)
    print(f"\n📊 Grouped {len(mappings)} child folders under {total_parents} unique parent catalog records.")

    if args.limit > 0:
        limited_parents = list(parent_to_folders.keys())[:args.limit]
        parent_to_folders = {p: parent_to_folders[p] for p in limited_parents}
        print(f"⚠️ Limiting execution to first {args.limit} parent records as requested.")

    # 3. Cache existing processed images in gold directory
    print("Caching existing destination images in Gold store...")
    existing_dest_images = set()
    if OUTPUT_DIR.exists():
        existing_dest_images.update(f.name for f in OUTPUT_DIR.glob('*.jpg'))
    print(f"  Found {len(existing_dest_images)} existing JPEGs in destination.")

    # 4. Plan and construct processing tasks
    print("\nPlanning file operations with natural page/plate sequencing...")
    tasks = []
    
    for parent_id, child_folders in parent_to_folders.items():
        base_parent_name = get_media_filename(parent_id)

        # Detect existing images attached to parent to determine starting sequence index
        # e.g. If Parent.jpg exists, next index is _1; if Parent.jpg and Parent_1.jpg exist, next is _2.
        has_primary = f"{base_parent_name}.jpg" in existing_dest_images
        existing_sub_indices = []
        pattern = re.compile(rf"^{re.escape(base_parent_name)}_(\d+)\.jpg$")
        for img_name in existing_dest_images:
            m = pattern.match(img_name)
            if m:
                existing_sub_indices.append(int(m.group(1)))

        if not has_primary:
            next_idx = 0
        elif existing_sub_indices:
            next_idx = max(existing_sub_indices) + 1
        else:
            next_idx = 1

        # Sort child folders naturally (e.g. plate 1, plate 2... plate 10... plate 35)
        sorted_folders = sorted(child_folders, key=natural_sort_key)

        for folder_name in sorted_folders:
            folder_path = ISLANDORA_LIB_DIR / folder_name
            if not folder_path.is_dir():
                continue

            # Gather valid image files in this child folder
            try:
                child_files = [
                    f for f in folder_path.iterdir()
                    if f.is_file() and not f.name.startswith('.') and f.suffix.lower() in VALID_IMAGE_EXTS
                ]
            except Exception:
                child_files = []

            # Sort files inside the child folder naturally
            sorted_child_files = sorted(child_files, key=lambda x: natural_sort_key(x.name))

            for f_idx, src_file in enumerate(sorted_child_files):
                # Destination filename on parent record
                if next_idx == 0:
                    dest_filename = f"{base_parent_name}.jpg"
                else:
                    dest_filename = f"{base_parent_name}_{next_idx}.jpg"
                
                dest_path = OUTPUT_DIR / dest_filename

                # Also create alias for child folder ID (e.g. child.jpg)
                child_base = get_media_filename(folder_name)
                alias_filename = f"{child_base}.jpg" if f_idx == 0 else f"{child_base}_{f_idx}.jpg"
                alias_path = OUTPUT_DIR / alias_filename if alias_filename != dest_filename else None

                tasks.append((src_file, dest_path, alias_path, args.dry_run))
                next_idx += 1

    print(f"Total planned image conversion tasks: {len(tasks)}")

    if args.dry_run:
        print("\n--- 🔍 DRY RUN PREVIEW (First 20 planned operations) ---")
        for i, (src, dest, alias, _) in enumerate(tasks[:20]):
            alias_note = f" (Alias: {alias.name})" if alias else ""
            print(f"  [{i+1:02d}] {src.parent.name}/{src.name}  --->  {dest.name}{alias_note}")
        if len(tasks) > 20:
            print(f"  ... and {len(tasks) - 20} more image files.")
        print("\n✅ Dry run completed successfully. No files were written.")
        return

    # 5. Execute conversion tasks in parallel
    print(f"\n🚀 Processing {len(tasks)} image files using {args.workers} threads...")
    copied_count = 0
    already_exists_count = 0
    error_count = 0
    errors = []

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_single_task, t): t for t in tasks}

        for fut in tqdm(as_completed(futures), total=len(futures), desc="Processing cleanup images"):
            res, dest_name, err = fut.result()
            if res == 'success':
                copied_count += 1
                existing_dest_images.add(dest_name)
            elif res == 'already_exists':
                already_exists_count += 1
            elif res == 'error':
                error_count += 1
                if err:
                    errors.append(err)

    print("\n🏁 Image Rollup Completed:")
    print(f"   Newly Processed / Rolled Up: {copied_count}")
    print(f"   Already Existed:             {already_exists_count}")
    print(f"   Errors:                      {error_count}")
    print(f"   Total Local Gold Images:     {len(list(OUTPUT_DIR.glob('*.jpg')))}")

    if errors:
        print(f"Saving {len(errors)} error details to {ERROR_REPORT_FILE}...")
        pd.DataFrame({'error': errors}).to_csv(ERROR_REPORT_FILE, index=False)

    # 6. Update catalog image counts
    if PARQUET_FILE.exists():
        print("\n📚 Updating normalized unified catalog with refreshed image counts...")
        final_images = {f.name for f in OUTPUT_DIR.glob('*.jpg')}

        def check_image_count(identifier):
            if pd.isna(identifier) or not identifier:
                return 0
            identifier_str = str(identifier).strip()
            id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
            for part in id_parts:
                if len(part) <= 200:
                    base = get_media_filename(part)
                    if f"{base}.jpg" in final_images:
                        count = 1
                        while f"{base}_{count}.jpg" in final_images:
                            count += 1
                        return count
            return 0

        df = pd.read_parquet(PARQUET_FILE)
        df['image_count'] = df['field_identifier'].apply(check_image_count)
        df['has_image'] = df['image_count'] > 0

        tmp_parquet = PARQUET_FILE.with_suffix('.tmp.parquet')
        df.to_parquet(tmp_parquet, index=False)
        tmp_parquet.replace(PARQUET_FILE)
        
        updated_records = len(df[df['has_image']])
        print(f"✅ Catalog updated! Total records with images now: {updated_records:,} (image_count and has_image flags refreshed).")

    print("\n✨ Done! Cleanup finished successfully.")

if __name__ == "__main__":
    main()
