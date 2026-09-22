import os
import re
from pathlib import Path
import pandas as pd

# Paths inside Docker container
UNIFIED_CATALOG = Path('/app/data/gold/unified_catalog_normalized.parquet')
DIGITAL_IMAGES_DIR = Path('/app/data/raw/digital_images/Islandora_Library')
EXPORT_DIR = Path('/app/data/export')
OUTPUT_XLSX = EXPORT_DIR / 'islandora_library_children_to_parents_review.xlsx'

def normalize_name(s):
    if not s:
        return ""
    s = str(s).lower().strip()
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

def main():
    print("--- 📋 GENERATING ISLANDORA LIBRARY CHILD-TO-PARENT ROLLUP REPORT ---")
    
    if not UNIFIED_CATALOG.exists():
        raise FileNotFoundError(f"Catalog not found at {UNIFIED_CATALOG}")
    if not DIGITAL_IMAGES_DIR.exists():
        raise FileNotFoundError(f"Digital images directory not found at {DIGITAL_IMAGES_DIR}")
        
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading catalog records...")
    df = pd.read_parquet(UNIFIED_CATALOG)
    print(f"Loaded {len(df)} records.")

    # Build fast lookups for Alma and Proficio
    # Lookup: normalized_part -> dict of metadata
    catalog_lookup = {}
    
    for _, row in df.iterrows():
        raw_id = str(row.get('field_identifier', ''))
        source = str(row.get('source_system', ''))
        title = str(row.get('title', ''))
        has_image = bool(row.get('has_image', False))
        image_count = int(row.get('image_count', 0))
        collection_type = str(row.get('field_collection_type', ''))
        
        parts = [p.strip() for p in raw_id.split(';') if p.strip()]
        for part in parts:
            norm = normalize_name(part)
            if norm and norm not in catalog_lookup:
                catalog_lookup[norm] = {
                    'raw_id': raw_id,
                    'matched_part': part,
                    'source_system': source,
                    'title': title,
                    'has_image': has_image,
                    'current_image_count': image_count,
                    'collection_type': collection_type
                }

    print(f"Indexed {len(catalog_lookup)} unique normalized identifier keys.")

    # Read all folders in Islandora_Library
    print("Scanning Islandora_Library folders...")
    folders = [f for f in os.listdir(DIGITAL_IMAGES_DIR) if not f.startswith('.')]
    print(f"Found {len(folders)} total folders.")

    valid_exts = {'.tif', '.tiff', '.jpg', '.jpeg', '.png'}
    
    rollup_rows = []
    unmatched_rows = []
    exact_matched_count = 0

    for folder in sorted(folders):
        norm_folder = normalize_name(folder)
        
        # 1. Exact match check
        if norm_folder in catalog_lookup:
            exact_matched_count += 1
            continue

        # 2. Inspect folder contents
        folder_path = DIGITAL_IMAGES_DIR / folder
        files = []
        if folder_path.is_dir():
            try:
                files = [f for f in os.listdir(folder_path) if not f.startswith('.') and Path(f).suffix.lower() in valid_exts]
            except Exception:
                files = []
                
        child_file_count = len(files)
        sample_file = files[0] if files else "N/A"

        # 3. Check for Parent Rollup Candidate
        # Progressively trim rightmost dot segments:
        # e.g., 'xc2011.08.2.179.32' -> 'xc2011.08.2.179'
        # e.g., '83.2.1033.1' -> '83.2.1033'
        parts = norm_folder.split('.')
        parent_candidate = None
        matched_key = None
        
        for i in range(len(parts) - 1, 0, -1):
            cand_key = '.'.join(parts[:i])
            if cand_key in catalog_lookup:
                parent_candidate = catalog_lookup[cand_key]
                matched_key = cand_key
                break

        if parent_candidate:
            # Determine confidence & relationship
            suffix = norm_folder[len(matched_key):].strip('.')
            parent_raw = parent_candidate['raw_id']
            
            # Check if parent record explicitly mentions this subpart in its semicolon string or range
            if folder.lower() in parent_raw.lower() or suffix in parent_raw:
                confidence = "High (Referenced in Parent Catalog Record)"
            elif suffix.isdigit():
                confidence = "High (Numeric Sub-item / Plate Index)"
            elif re.match(r'^[a-zA-Z]$', suffix):
                confidence = "High (Letter Part / Version Suffix)"
            else:
                confidence = "Medium (Prefix Match - Review Recommended)"

            rollup_rows.append({
                'Islandora Folder Name': folder,
                'Proposed Parent ID': parent_candidate['matched_part'],
                'Parent Source System': parent_candidate['source_system'],
                'Confidence': confidence,
                'Child Image Count': child_file_count,
                'Child Sample File': sample_file,
                'Parent Has Images Now': 'Yes' if parent_candidate['has_image'] else 'No',
                'Parent Current Image Count': parent_candidate['current_image_count'],
                'Parent Title': parent_candidate['title'],
                'Parent Full Catalog ID': parent_raw,
                'Parent Collection Type': parent_candidate['collection_type']
            })
        else:
            unmatched_rows.append({
                'Islandora Folder Name': folder,
                'Child Image Count': child_file_count,
                'Child Sample File': sample_file,
                'Notes': 'No parent or exact catalog record found'
            })

    print(f"\nProcessing Summary:")
    print(f" - Exact Matches (Already Handled): {exact_matched_count}")
    print(f" - Children to Roll Up to Parents: {len(rollup_rows)}")
    print(f" - Still Unmatched Folders: {len(unmatched_rows)}")

    # Create DataFrames
    df_rollup = pd.DataFrame(rollup_rows)
    df_unmatched = pd.DataFrame(unmatched_rows)
    
    # Summary Sheet
    summary_data = [
        {'Metric': 'Total Folders in Islandora_Library', 'Value': len(folders)},
        {'Metric': 'Folders with Exact Match in Catalog', 'Value': exact_matched_count},
        {'Metric': 'Child Folders Candidate for Parent Rollup', 'Value': len(rollup_rows)},
        {'Metric': 'Child Folders Rolling Up to Alma (Library)', 'Value': len(df_rollup[df_rollup['Parent Source System'] == 'Alma']) if not df_rollup.empty else 0},
        {'Metric': 'Child Folders Rolling Up to Proficio (Museum)', 'Value': len(df_rollup[df_rollup['Parent Source System'] == 'Proficio']) if not df_rollup.empty else 0},
        {'Metric': 'Total Images in Candidate Child Folders', 'Value': df_rollup['Child Image Count'].sum() if not df_rollup.empty else 0},
        {'Metric': 'Remaining Unmatched Folders (No Match)', 'Value': len(unmatched_rows)},
    ]
    df_summary = pd.DataFrame(summary_data)

    print(f"Exporting Excel spreadsheet to {OUTPUT_XLSX}...")
    with pd.ExcelWriter(OUTPUT_XLSX, engine='openpyxl') as writer:
        df_summary.to_excel(writer, sheet_name='Summary', index=False)
        df_rollup.to_excel(writer, sheet_name='Proposed Rollups', index=False)
        df_unmatched.to_excel(writer, sheet_name='Still Unmatched', index=False)

    print("✅ Excel report successfully generated!")

if __name__ == "__main__":
    main()
