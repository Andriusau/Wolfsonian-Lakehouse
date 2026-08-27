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
            CASE 
                WHEN regexp_matches(u.subject, '(?i)ship|ocean|steamboat|cruise|boat|maritime|naval|ferry|vessel') THEN 'Maritime & Ocean Travel'
                WHEN regexp_matches(u.subject, '(?i)war|military|nazi|reich|propaganda|falkland|weapon|gun|army|navy|conflict') THEN 'War, Military & Politics'
                WHEN regexp_matches(u.subject, '(?i)ceramic|glass|porcelain|pottery|enamel') THEN 'Ceramics & Glass'
                WHEN regexp_matches(u.subject, '(?i)metal|silver|gold|jewelry|medallic|medal|iron|steel|brass') THEN 'Metals & Jewelry'
                WHEN regexp_matches(u.subject, '(?i)textile|clothing|fashion|garment|silk|cotton|lace|woven') THEN 'Textiles & Fashion'
                WHEN regexp_matches(u.subject, '(?i)food|beverage|drink|dining|kitchen') THEN 'Food & Beverage'
                WHEN regexp_matches(u.subject, '(?i)furniture|domestic|home|house|seating|cabinet') THEN 'Domestic Life & Furniture'
                WHEN regexp_matches(u.subject, '(?i)health|hygiene|science|technolog|machin|industry|industrial|railroad|train|transportation|transport') THEN 'Science, Industry & Transport'
                WHEN regexp_matches(u.subject, '(?i)architect|building|habitat|interior|structure') THEN 'Architecture & Environment'
                WHEN regexp_matches(u.subject, '(?i)exhibition|fair|exposition') THEN 'Exhibitions & World Fairs'
                WHEN regexp_matches(u.subject, '(?i)book|literature|print|publication') THEN 'Books & Literature'
                WHEN regexp_matches(u.subject, '(?i)travel|tourism|tourist|vacation') THEN 'Travel & Tourism'
                WHEN regexp_matches(u.subject, '(?i)art |arts|nouveau|design|decorat|ornament|graphic|figurative|allegory|portrait|landscape|photography|painting|drawing|sculpture|artist|advertis|commercial') THEN 'Art, Design & Visual Media'
                ELSE 'Other / Uncategorized'
            END AS category,
            COUNT(*) AS total_count
        FROM UnnestedBase u
        JOIN TargetSubjects t ON u.subject = t.subject
        GROUP BY 1, 2, 3
        ORDER BY category ASC, total_count DESC
    ) TO '{OUTPUT_PARQUET}' (FORMAT 'PARQUET');
    """
    
    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    con.execute(query)
    logging.info(f'💾 Saved Rediscovery Subjects Summary: {OUTPUT_PARQUET}')
    con.close()

if __name__ == "__main__":
    main()
