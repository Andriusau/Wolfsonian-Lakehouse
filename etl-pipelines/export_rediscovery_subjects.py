import duckdb
import logging
from pathlib import Path

UNIFIED_CATALOG_NORMALIZED = Path('/app/data/gold/unified_catalog_normalized.parquet')
OUTPUT_PARQUET = Path('/app/data/gold/rediscovery_subjects_summary.parquet')
TERMS_FILE = Path('/app/archive_scripts/Subject_Terms.txt')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    if not UNIFIED_CATALOG_NORMALIZED.exists():
        logging.warning(f'Normalized catalog not found at {UNIFIED_CATALOG_NORMALIZED}. Skipping.')
        return

    if not TERMS_FILE.exists():
        logging.warning(f'Terms file not found at {TERMS_FILE}. Skipping.')
        return

    logging.info('--- 🔄 GENERATE REDISCOVERY SUBJECTS SUMMARY ---')
    
    # Read terms
    with open(TERMS_FILE, 'r') as f:
        terms = [line.strip() for line in f if line.strip()]
        
    logging.info(f'Loaded {len(terms)} terms from {TERMS_FILE.name}.')

    # Construct the VALUES clause
    values_list = []
    for term in terms:
        # Escape single quotes for SQL
        escaped_term = term.replace("'", "''")
        values_list.append(f"('{escaped_term}')")
    
    values_clause = ", ".join(values_list)

    # Connect to in-memory duckdb
    con = duckdb.connect(':memory:')
    
    # Construct and run query
    query = f"""
    COPY (
        WITH UnnestedBase AS (
            SELECT 
                COALESCE(NULLIF(TRIM(field_collection_type), ''), '(Unknown Collection)') AS collection,
                TRIM(unnest(string_split(field_subject, '|'))) AS subject
            FROM read_parquet('{UNIFIED_CATALOG_NORMALIZED}')
            WHERE field_subject IS NOT NULL 
              AND field_subject != ''
        ),
        TargetSubjects AS (
            SELECT subject FROM (VALUES {values_clause}) AS t(subject)
        )
        SELECT 
            u.collection,
            u.subject,
            COUNT(*) AS total_count
        FROM UnnestedBase u
        JOIN TargetSubjects t ON u.subject = t.subject
        GROUP BY 1, 2
        ORDER BY u.subject ASC, total_count DESC
    ) TO '{OUTPUT_PARQUET}' (FORMAT 'PARQUET');
    """
    
    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    con.execute(query)
    logging.info(f'💾 Saved Rediscovery Subjects Summary: {OUTPUT_PARQUET}')
    con.close()

if __name__ == "__main__":
    main()
