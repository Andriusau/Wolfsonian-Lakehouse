import pandas as pd
import logging
import json
import sys
import os
from pathlib import Path

# Setup paths
RAW_ALMA = Path('/app/data/raw/alma/alma_raw_dump.parquet')
SILVER_ALMA = Path('/app/data/silver/alma_silver.parquet')

# Ensure directory exists
SILVER_ALMA.parent.mkdir(parents=True, exist_ok=True)

# Logging
logger = logging.getLogger()
if logger.handlers:
    for handler in logger.handlers:
        logger.removeHandler(handler)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logging.info("🚀 Alma Silver Transformer initialized.")

if __name__ == "__main__":
    if not RAW_ALMA.exists():
        logging.warning(f"Alma raw file not found at {RAW_ALMA}. Ensure extract_alma_raw.py runs first.")
        sys.exit(0)
        
    logging.info(f"📥 Loading raw Alma data from {RAW_ALMA}")
    try:
        df = pd.read_parquet(RAW_ALMA)
        logging.info(f"Loaded {len(df)} raw records with {len(df.columns)} columns.")
    except Exception as e:
        logging.error(f"Failed to read raw parquet: {e}")
        sys.exit(1)
        
    logging.info("🛠️ Applying Silver transformations...")
    
    # 1. Drop completely empty columns (very common in MARC dumps)
    initial_cols = len(df.columns)
    df = df.dropna(axis=1, how='all')
    
    # 2. Convert all columns to strings and strip whitespace, replacing empty strings with NaN
    # We only apply this to object (string) columns to be safe
    str_cols = df.select_dtypes(include=['object']).columns
    for col in str_cols:
        df[col] = df[col].astype(str).str.strip().replace('', pd.NA).replace('nan', pd.NA)
        
    # Drop columns that became completely empty after stripping whitespace
    df = df.dropna(axis=1, how='all')
    
    final_cols = len(df.columns)
    logging.info(f"🧹 Cleaned columns: Dropped {initial_cols - final_cols} empty columns.")
    
    # Save to Silver Layer
    logging.info(f"💾 Saving to Silver Parquet: {SILVER_ALMA}")
    df.to_parquet(SILVER_ALMA, index=False)
    
    # Write metrics
    metrics_path = '/app/data/metrics.json'
    metrics = {}
    if Path(metrics_path).exists():
        try:
            with open(metrics_path, 'r') as f:
                metrics = json.load(f)
        except: pass
    
    metrics['alma_silver_total'] = len(df)
    metrics['alma_silver_columns'] = final_cols
    
    os.makedirs(os.path.dirname(metrics_path), exist_ok=True)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f)
        
    logging.info("✅ Alma Silver Pipeline Finished!")
