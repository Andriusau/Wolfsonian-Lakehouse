import pandas as pd
import logging
import sys
import json
from pathlib import Path

MASTER_SILVER = Path('/app/data/silver/proficio_silver.parquet')
QA_FAILURES_PARQUET = Path('/app/data/gold/proficio_qa_failures.parquet')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def run_qa_checks(row):
    errors = []
    for field, name in [('title', 'Title'), ('field_identifier', 'Identifier')]:
        if pd.isna(row.get(field)) or str(row.get(field, '')).strip() == '':
            errors.append(f"{name} is missing")
    has_genre = pd.notna(row.get('field_genre')) and str(row.get('field_genre', '')).strip() != ''
    has_date = pd.notna(row.get('field_edtf_date_created')) and str(row.get('field_edtf_date_created', '')).strip() != ''
    has_creator = pd.notna(row.get('field_linked_agent')) and str(row.get('field_linked_agent', '')).strip() != ''
    has_country = pd.notna(row.get('field_place_published')) and str(row.get('field_place_published', '')).strip() != ''
    if not (has_genre and (has_date or has_creator or has_country)):
        errors.append("Required fields missing (Genre and one of Date/Creator/Country)")
    if "_" in str(row.get('field_linked_agent', '')):
        errors.append("Underscores found in processed linked agent field")
    return errors

if __name__ == "__main__":
    if not MASTER_SILVER.exists():
        logging.warning("No Master Silver file found. Skipping QA.")
        sys.exit(0)
        
    logging.info("--- 🔍 RUN QA CHECKS ---")
    df_master = pd.read_parquet(MASTER_SILVER)
    
    df_master['qa_errors'] = df_master.apply(run_qa_checks, axis=1)
    df_master['qa_pass'] = df_master['qa_errors'].apply(lambda x: len(x) == 0)
    
    df_pass = df_master[df_master['qa_pass']].copy()
    df_fail = df_master[~df_master['qa_pass']].copy()
    
    logging.info(f"QA Results: {len(df_pass)} rows passed, {len(df_fail)} rows failed.")

    QA_FAILURES_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    if not df_fail.empty:
        df_fail['qa_errors_str'] = df_fail['qa_errors'].apply(lambda x: " | ".join(x))
        df_fail.astype(str).drop(columns=['qa_errors']).to_parquet(QA_FAILURES_PARQUET, index=False)
        logging.info(f"💾 Saved {len(df_fail)} failed records to {QA_FAILURES_PARQUET}")
        
    # Overwrite master with qa flags so next step doesn't re-calculate
    df_master['qa_errors'] = df_master['qa_errors'].apply(lambda x: " | ".join(x))
    df_master.to_parquet(MASTER_SILVER, index=False)
    
    metrics_path = '/app/data/metrics.json'
    metrics = {}
    if Path(metrics_path).exists():
        try:
            with open(metrics_path, 'r') as f: metrics = json.load(f)
        except: pass
        
    metrics['proficio_qa_failures'] = len(df_fail)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f)
