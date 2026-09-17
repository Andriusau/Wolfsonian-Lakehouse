import pandas as pd
import logging
import json
import sys
import os
import re
from pathlib import Path

# Setup paths
DATA_DIR = Path('/app/data') if Path('/app/data').exists() else Path('data')
RAW_ALMA = DATA_DIR / 'raw/alma/alma_raw_dump.parquet'
SILVER_ALMA = DATA_DIR / 'silver/alma_silver.parquet'
RAW_ALMA_PHYS = DATA_DIR / 'raw/alma/alma_physical_dump.parquet'

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

def main():
    if not RAW_ALMA.exists():
        logging.warning(f"Alma raw file not found at {RAW_ALMA}. Ensure extract_alma_raw.py runs first.")
        return
        
    logging.info(f"📥 Loading raw Alma data from {RAW_ALMA}")
    try:
        df = pd.read_parquet(RAW_ALMA)
        logging.info(f"Loaded {len(df)} raw records with {len(df.columns)} columns.")
    except Exception as e:
        logging.error(f"Failed to read raw parquet: {e}")
        raise RuntimeError("Task Failed. Check logs for details.")
        
    logging.info("🛠️ Applying Silver transformations...")
    
    # 0. MAP RAW COLUMNS TO WORKBENCH STANDARDS
    alma_rename_map = {
        'new_907_full': 'field_identifier',
        'new_001_ctrl': 'alma_identifier',
        'new_598_a': 'field_credit_line',
        'new_655_a': 'field_genre',
        'new_500_a': 'field_description_long',
        'new_561_a': 'field_collection_note',
        'new_260_a': 'field_place_published',
        'new_546_a': 'field_language',
        'new_610_a': 'field_subjects_name',
        'new_008_ctrl': 'country_code',             
        'new_006_ctrl': 'field_lvr',                
        'new_650_z': 'field_geographic_subject',    
        'new_650_y': 'field_temporal_subject',      
    }
    df = df.rename(columns=alma_rename_map)

    # Initialize all Alma records as bibliographic base
    df['alma_source_type'] = '/raw/alma/bibliographic'

    # --- MERGE PHYSICAL ITEMS ---
    if RAW_ALMA_PHYS.exists():
        logging.info(f"📥 Loading raw Alma Physical data from {RAW_ALMA_PHYS}")
        try:
            df_phys = pd.read_parquet(RAW_ALMA_PHYS)
            logging.info(f"Loaded {len(df_phys)} physical records.")
            
            # Deduplicate physical items to avoid multiplying bib records (take the first item's location)
            df_phys = df_phys.drop_duplicates(subset=['MMS Record ID'])
            
            # Merge
            df['alma_identifier'] = df['alma_identifier'].astype(str)
            df_phys['MMS Record ID'] = df_phys['MMS Record ID'].astype(str)
            df = df.merge(df_phys, how='left', left_on='alma_identifier', right_on='MMS Record ID')
            
            # Map location
            if 'Permanent Physical Location' in df.columns:
                def map_location(loc):
                    if pd.isna(loc):
                        return pd.NA
                    l = str(loc).strip()
                    if l in ['REF', 'REFO', 'REFDO', 'Reference (REF)', 'Reference Oversized (REFO)', 'Reference Double Oversized (REFDO)']:
                        return 'Reference'
                    return l
                df['location'] = df['Permanent Physical Location'].apply(map_location)
                logging.info("✅ Mapped physical location to 'location' column.")
            
            # Create alma_source_type flag
            if 'MMS Record ID' in df.columns:
                df['alma_source_type'] = df['MMS Record ID'].apply(
                    lambda x: '/raw/alma/physical' if pd.notna(x) else '/raw/alma/bibliographic'
                )
            else:
                df['alma_source_type'] = '/raw/alma/bibliographic'
            logging.info("✅ Created alma_source_type flag.")
        except Exception as e:
            logging.error(f"Failed to read/merge physical parquet: {e}")

    # Construct EDTF Date (field_edtf_date_created)
    # Prefer 264$c (modern production date) over 260$c (legacy imprint date)
    if 'new_264_c' in df.columns or 'new_260_c' in df.columns:
        def get_date(row):
            d264 = str(row['new_264_c']).strip() if 'new_264_c' in row and pd.notna(row['new_264_c']) else ''
            d260 = str(row['new_260_c']).strip() if 'new_260_c' in row and pd.notna(row['new_260_c']) else ''
            val = d264 or d260
            # Clean up MARC date punctuation (e.g., [1934], 1934., c1934)
            if val:
                val = re.sub(r'[\[\]\(\)\.\,c]', '', val).strip()
            return val if val else None
        
        df['field_edtf_date_created'] = df.apply(get_date, axis=1)
    
    relator_codes = {
        'abridger': 'abr', 'actor': 'act', 'adapter': 'adp', 'addressee': 'rcp', 'analyst': 'anl', 
        'animator': 'anm', 'annotator': 'ann', 'architect': 'arc', 'arranger': 'arr', 'art copyist': 'acp', 
        'art director': 'adi', 'artist': 'art', 'artistic director': 'ard', 'assignee': 'asg', 
        'author': 'aut', 'autographer': 'ato', 'binder': 'bnd', 'binding designer': 'bdd', 
        'book designer': 'bkd', 'book producer': 'bkp', 'bookjacket designer': 'bjd', 'bookplate designer': 'bpd', 
        'bookseller': 'bsl', 'calligrapher': 'cll', 'cartographer': 'ctg', 'caster': 'cas', 'censor': 'cns', 
        'choreographer': 'chr', 'cinematographer': 'cng', 'client': 'cli', 'collector': 'col', 
        'colorist': 'clr', 'commentator': 'cmm', 'compiler': 'com', 'composer': 'cmp', 'compositor': 'cmt', 
        'conceptor': 'ccp', 'conductor': 'cnd', 'conservator': 'con', 'consultant': 'csl', 
        'contributor': 'ctb', 'costume designer': 'cst', 'cover designer': 'cov', 'cover illustrator': 'ill', 
        'creator': 'cre', 'curator': 'cur', 'dancer': 'dnc', 'delineator': 'dln', 'depicted': 'dpc', 
        'designer': 'dsr', 'director': 'drt', 'distributor': 'dst', 'donor': 'dnr', 'draftsman': 'drm', 
        'editor': 'edt', 'engineer': 'eng', 'engraver': 'egr', 'etcher': 'etr', 'expert': 'exp', 
        'filmmaker': 'fmk', 'former owner': 'fmo', 'funder': 'fnd', 'graphic technician': 'grt', 
        'honoree': 'hnr', 'host': 'hst', 'illuminator': 'ilu', 'illustrator': 'ill', 'inscriber': 'ins', 
        'instrumentalist': 'itr', 'inventor': 'inv', 'issuing body': 'isb', 'judge': 'jud', 
        'landscape architect': 'lsa', 'lead': 'led', 'lender': 'len', 'librettist': 'lbt', 
        'lighting designer': 'lgd', 'lithographer': 'ltg', 'lyricist': 'lyr', 'maker': 'mkr', 
        'manufacturer': 'mfr', 'metal-engraver': 'mte', 'musician': 'mus', 'narrator': 'nrt', 
        'organizer': 'orm', 'originator': 'org', 'other': 'oth', 'owner': 'own', 'patron': 'pat', 
        'performer': 'prf', 'photographer': 'pht', 'platemaker': 'plt', 'printer': 'prt', 
        'printer of plates': 'pop', 'printmaker': 'prm', 'producer': 'pro', 'production company': 'prn', 
        'production designer': 'prs', 'programmer': 'prg', 'publisher': 'pbl', 'publishing director': 'pbd', 
        'recordist': 'rcd', 'redaktor': 'red', 'renderer': 'ren', 'reporter': 'rpt', 'researcher': 'res', 
        'restorationist': 'rsr', 'reviewer': 'rev', 'scenarist': 'sce', 'translator': 'trl', 'wood-engraver': 'wde',
        'ed': 'edt', 'comp': 'com', 'ill': 'ill'
    }

    def resolve_code(term, code=None, default_code='oth'):
        if code and pd.notna(code):
            c_clean = str(code).strip().lower()
            if c_clean in relator_codes.values():
                return c_clean
        if term and pd.notna(term):
            term_clean = re.sub(r'[^a-zA-Z\s]', '', str(term)).strip().lower()
            for k, v in relator_codes.items():
                if k in term_clean:
                    return v
        return default_code

    # Append all creators to field_linked_agent with structured relator roles
    def merge_creators(row):
        creators = []
        seen = set()

        def add_agent(name, code):
            if not name or pd.isna(name):
                return
            n = str(name).strip().rstrip('.,;')
            if not n or n.lower() in ['[s.n.]', 's.n.', 's.n', 'unknown', 'publisher not identified', '[publisher not identified]']:
                return
            key = (n.lower(), code)
            if key not in seen:
                seen.add(key)
                creators.append(f"relators:{code}:person:{n}")

        # 1. Primary personal author (100)
        if 'new_100_a' in row and pd.notna(row['new_100_a']) and str(row['new_100_a']).strip():
            role = resolve_code(row.get('new_100_e'), row.get('new_100_4'), default_code='aut')
            add_agent(row['new_100_a'], role)

        # 2. Added personal author (700)
        if 'new_700_a' in row and pd.notna(row['new_700_a']) and str(row['new_700_a']).strip():
            names = [n.strip() for n in str(row['new_700_a']).split('|')]
            terms = [t.strip() for t in str(row.get('new_700_e', '')).split('|')] if pd.notna(row.get('new_700_e')) else []
            codes = [c.strip() for c in str(row.get('new_700_4', '')).split('|')] if pd.notna(row.get('new_700_4')) else []
            for i, n in enumerate(names):
                t = terms[i] if i < len(terms) else ''
                c = codes[i] if i < len(codes) else ''
                role = resolve_code(t, c, default_code='oth')
                add_agent(n, role)

        # 3. Corporate author (110)
        if 'new_110_a' in row and pd.notna(row['new_110_a']) and str(row['new_110_a']).strip():
            role = resolve_code(row.get('new_110_e'), row.get('new_110_4'), default_code='oth')
            add_agent(row['new_110_a'], role)

        # 4. Added corporate author (710)
        if 'new_710_a' in row and pd.notna(row['new_710_a']) and str(row['new_710_a']).strip():
            names = [n.strip() for n in str(row['new_710_a']).split('|')]
            terms = [t.strip() for t in str(row.get('new_710_e', '')).split('|')] if pd.notna(row.get('new_710_e')) else []
            codes = [c.strip() for c in str(row.get('new_710_4', '')).split('|')] if pd.notna(row.get('new_710_4')) else []
            for i, n in enumerate(names):
                t = terms[i] if i < len(terms) else ''
                c = codes[i] if i < len(codes) else ''
                role = resolve_code(t, c, default_code='oth')
                add_agent(n, role)

        # 5. Conference / Meeting author (111)
        if 'new_111_a' in row and pd.notna(row['new_111_a']) and str(row['new_111_a']).strip():
            for m in str(row['new_111_a']).split('|'):
                add_agent(m, 'oth')

        # 6. Publishers (260$b and 264$b)
        for pub_field in ['new_260_b', 'new_264_b']:
            if pub_field in row and pd.notna(row[pub_field]) and str(row[pub_field]).strip():
                for p in str(row[pub_field]).split('|'):
                    add_agent(p, 'pbl')

        return '|'.join(creators) if creators else pd.NA
        
    df['field_linked_agent'] = df.apply(merge_creators, axis=1)
    
    # Pass through pre-joined subject from raw layer
    if 'raw_field_subject' in df.columns:
        df['field_subject'] = df['raw_field_subject']
    else:
        df['field_subject'] = pd.NA

    # Pass through pre-joined note from raw layer
    if 'raw_field_note' in df.columns:
        df['field_note'] = df['raw_field_note']
    else:
        df['field_note'] = pd.NA

    # Construct field_subject_pictured
    def merge_subjects_pictured(row):
        subjects = []
        for field in ['new_965_a', 'new_965_x', 'new_965_z', 'new_965_y']:
            if field in row and pd.notna(row[field]):
                val = str(row[field]).strip()
                if val: subjects.append(val)
        return ' | '.join(subjects) if subjects else pd.NA
        
    df['field_subject_pictured'] = df.apply(merge_subjects_pictured, axis=1)

    # Extract three_letter_code
    if 'country_code' in df.columns:
        df['three_letter_code'] = df['country_code'].str[15:18]
    
    # Construct a composite title if the pieces exist
    if 'new_245_a' in df.columns:
        b_col = df['new_245_b'].fillna('') if 'new_245_b' in df.columns else ''
        df['title'] = df['new_245_a'].fillna('') + ' ' + b_col
        df['title'] = df['title'].str.strip()
        
    # Construct physical extent (300 $a, $b, $c)
    if 'new_300_a' in df.columns:
        b_col = df['new_300_b'].fillna('') if 'new_300_b' in df.columns else ''
        c_col = df['new_300_c'].fillna('') if 'new_300_c' in df.columns else ''
        
        # Combine a, b, and c with commas
        ext_parts = df['new_300_a'].fillna('') + ', ' + b_col + ', ' + c_col
        # Clean up any weird double commas from empty columns
        df['field_extent'] = ext_parts.str.replace(r',\s*,', ',', regex=True).str.strip(', ').str.strip()
        
    # Add static fields
    df['field_resource_type'] = 'Collection'
    df['field_model'] = 'Paged Content'
    # Set Collection Type dynamically based on location
    if 'location' in df.columns:
        df['field_collection_type'] = df['location'].apply(
            lambda x: 'Research/Reference Books' if pd.notna(x) and x == 'Reference' else 'Library'
        )
    else:
        df['field_collection_type'] = 'Library'
    
    # Apply text transformations (from MASTER notebook)
    if 'field_identifier' in df.columns:
        df['field_identifier'] = df['field_identifier'].str.replace('Local', '', regex=False).str.replace('local', '', regex=False).str.replace('@', ' ', regex=False)
        # Fallback to alma_identifier if field_identifier is empty or missing (especially for Reference books)
        if 'alma_identifier' in df.columns:
            df['field_identifier'] = df['field_identifier'].replace(r'^\s*$', None, regex=True).fillna(df['alma_identifier'])
    if 'title' in df.columns:
        df['title'] = df['title'].str.replace('/', '', regex=False).str.replace('--', '', regex=False)
    if 'field_genre' in df.columns:
        df['field_genre'] = df['field_genre'].str.replace('.', '', regex=False)
    if 'field_place_published' in df.columns:
        df['field_place_published'] = df['field_place_published'].str.replace(':', '', regex=False)
    if 'field_physical_form' in df.columns:
        df['field_physical_form'] = df['field_physical_form'].str.replace('.', '', regex=False)
    if 'field_language' in df.columns:
        df['field_language'] = df['field_language'].str.replace('.', '', regex=False)
    if 'field_geographic_subject' in df.columns:
        df['field_geographic_subject'] = df['field_geographic_subject'].str.replace('.', '', regex=False)
    
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


if __name__ == "__main__":
    main()
