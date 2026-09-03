import duckdb
import json
import os
import re
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

def get_count_from_parquet(con, filepath, query="SELECT COUNT(*) FROM read_parquet('{}')"):
    if not os.path.exists(filepath):
        return 0
    try:
        return con.execute(query.format(filepath)).fetchone()[0]
    except Exception as e:
        logging.warning(f"Error querying {filepath}: {e}")
        return 0

def update_readme(metrics):
    readme_path = '/app/README.md'
    if not os.path.exists(readme_path):
        # Fallback if run locally outside Docker
        readme_path = 'README.md'
        
    if not os.path.exists(readme_path):
        logging.warning("README.md not found, skipping update.")
        return

    with open(readme_path, 'r') as f:
        content = f.read()

    # The table we want to replace
    table = f"""| Source | System | Records | Method |
|---|---|---|---|
| **Alma** | Ex Libris Library Management | {metrics['alma_silver_total']:,} | Binary MARC (`.mrc`) parsing via PyMARC & Physical Item (`.csv`) mapping |
| **Proficio** | Museum Collection Database | {metrics['proficio_silver_total']:,} | Kerberos-authenticated SQL Server via ODBC |
| **Islandora** | Public Digital Archive | {metrics['islandora_total']:,} | Paginated REST API with concurrent fetching |
| **Unified Gold Catalog** | Merged output | {metrics['unified_catalog_total']:,} | Alma + Proficio aligned and concatenated |
| **Normalized Gold Catalog** | Analytics-ready output | {metrics['unified_catalog_total']:,} | Harmonized genres, dates, creators & titles |
| **Records with Images** | Gold Catalog Filter | {metrics['records_with_images']:,} | Distinct records possessing at least one valid image (a single record can have up to 1,000+ images for books/albums) |
| **Digital Images** | NFS Mounted Share | {metrics['digital_images']:,} | Parallel ingestion and JPEG compression |
| **Digital Audio** | NFS Mounted Share | {metrics['digital_audio']:,} | MP3 caching and metadata mapping |
| **Google Analytics** | GA4 Data API | Dynamic | Automated extraction of website traffic metrics |"""

    # Use regex to replace the table under Data Sources & Volumes
    pattern = r"\| Source \| System \| Records \| Method \|\n\|---\|---\|---\|---\|.*?(?=\n\n|\n---)"
    new_content = re.sub(pattern, table, content, flags=re.DOTALL)

    if new_content == content:
        logging.warning("Regex didn't match the README table. No changes made.")
    else:
        with open(readme_path, 'w') as f:
            f.write(new_content)
        logging.info("README.md successfully updated.")

def main():
    logging.info("--- 📊 Gathering Lakehouse Metrics ---")
    metrics_path = '/app/data/metrics.json'
    if not os.path.exists(os.path.dirname(metrics_path)):
        metrics_path = 'data/metrics.json' # local fallback
        
    metrics = {}
    if os.path.exists(metrics_path):
        with open(metrics_path, 'r') as f:
            try:
                metrics = json.load(f)
            except json.JSONDecodeError:
                metrics = {}

    con = duckdb.connect(':memory:')
    
    # 1. Parquet Counts
    data_dir = '/app/data' if os.path.exists('/app/data') else 'data'
    
    # Store extraction-specific metrics if they exist
    # (keeps them intact for Prefect reporting)
    
    metrics['alma_silver_total'] = get_count_from_parquet(con, f"{data_dir}/silver/alma_silver.parquet")
    metrics['proficio_silver_total'] = get_count_from_parquet(con, f"{data_dir}/silver/proficio_silver.parquet")
    metrics['islandora_total'] = get_count_from_parquet(con, f"{data_dir}/raw/islandora/islandora_lookup.parquet")
    metrics['unified_catalog_total'] = get_count_from_parquet(con, f"{data_dir}/gold/unified_catalog_normalized.parquet")
    
    # Records with Images
    img_query = "SELECT COALESCE(SUM(CAST(has_image AS INT)), 0) FROM read_parquet('{}')"
    metrics['records_with_images'] = int(get_count_from_parquet(con, f"{data_dir}/gold/unified_catalog_normalized.parquet", img_query))

    # 2. File counts for Digital Images and Audio
    img_dir = Path(f"{data_dir}/gold/images")
    if img_dir.exists() and len(list(img_dir.glob('*.jpg'))) > 0:
        metrics['digital_images'] = len(list(img_dir.glob('*.jpg')))
    else:
        # Fallback to last known if empty/not mounted or processing skipped
        metrics['digital_images'] = metrics.get('digital_images', 339715)
        
    audio_dir = Path(f"{data_dir}/gold/audio")
    if audio_dir.exists() and len(list(audio_dir.iterdir())) > 0:
        metrics['digital_audio'] = len([f for f in audio_dir.iterdir() if f.is_file()])
    else:
        metrics['digital_audio'] = metrics.get('digital_audio', 26)
        
    # Write updated metrics.json
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=4)
        
    logging.info(f"Updated {metrics_path} with comprehensive metrics.")
    
    # Update README
    update_readme(metrics)

if __name__ == "__main__":
    main()
