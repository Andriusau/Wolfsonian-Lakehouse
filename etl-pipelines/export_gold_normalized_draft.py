import pandas as pd
import logging
import sys
import re
from pathlib import Path

UNIFIED_CATALOG = Path('/app/data/gold/unified_catalog.parquet')
OUTPUT_PARQUET  = Path('/app/data/gold/unified_catalog_normalized.parquet')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ---------------------------------------------------------------------------
# GENRE NORMALIZATION
# Map every known raw value (from both Alma and Proficio) to a clean label.
# Add more entries as you discover new values in Metabase.
# ---------------------------------------------------------------------------
GENRE_MAP = {
    # Posters
    'POSTER': 'Poster', 'POSTERS': 'Poster', 'BROADSIDE': 'Poster',
    # Pamphlets
    'PAMPHLET': 'Pamphlet', 'PAMPHLETS': 'Pamphlet',
    #'BROCHURE': 'Pamphlet.', 'LEAFLET': 'Pamphlet',
    # Books
    'BOOK': 'Book', 'BOOKS': 'Book', 'MONOGRAPH': 'Book', 'Biography', 'BIOGRAPHY', 'Books.',
    # Periodicals
    'PERIODICAL': 'Periodical', 'JOURNAL': 'Periodical',
    'MAGAZINE': 'Periodical', 'SERIAL': 'Periodical',
    # Photographs
    'PHOTOGRAPH': 'Photograph', 'PHOTO': 'Photograph',
    'PHOTOGRAPHY': 'Photograph', 'NEGATIVE': 'Photograph',
    'SLIDE': 'Photograph',
    # Drawings
    'DRAWING': 'Drawing', 'DRAWINGS': 'Drawing', 'SKETCH': 'Drawing',
    # Prints
    'PRINT': 'Print', 'PRINTS': 'Print', 'LITHOGRAPH': 'Print',
    #'ETCHING': 'Print', 'WOODCUT': 'Print', 'ENGRAVING': 'Print',
    # Postcards
    'POSTCARD': 'Postcard', 'POST CARD': 'Postcard', 'POSTCARDS': 'Postcard',
    # Ephemera
    'EPHEMERA': 'Ephemera', 'EPHEMERAL': 'Ephemera',
    # Mixed media / objects
    'MIXED MEDIA': 'Mixed Media', 'MIXED-MEDIA': 'Mixed Media',
    'OBJECT': 'Object', 'OBJECTS': 'Object',
    # Paintings / art
    'PAINTING': 'Painting', 'PAINTINGS': 'Painting',
    'SCULPTURE': 'Sculpture',
    'TEXTILE': 'Textile', 'TEXTILES': 'Textile', 'FABRIC': 'Textile',
    # Maps
    'MAP': 'Map', 'MAPS': 'Map',
    # Furniture / design
    'FURNITURE': 'Furniture',
}

def normalize_genre(val):
    if pd.isna(val) or str(val).strip() == '':
        return pd.NA
    return GENRE_MAP.get(str(val).strip().upper(), str(val).strip().title())


# ---------------------------------------------------------------------------
# DATE NORMALIZATION
# Extract the earliest 4-digit year from any date string for numeric analysis.
# ---------------------------------------------------------------------------
def extract_year(val):
    if pd.isna(val):
        return pd.NA
    match = re.search(r'\b(1[5-9]\d{2}|20[0-2]\d)\b', str(val))
    return int(match.group(1)) if match else pd.NA

def year_to_decade(year):
    if pd.isna(year):
        return pd.NA
    return (int(year) // 10) * 10


# ---------------------------------------------------------------------------
# CREATOR NORMALIZATION
# Alma stores agents as "Last, First||role". Strip the role suffix.
# Proficio stores free-text. Both become a clean display name.
# ---------------------------------------------------------------------------
def normalize_creator(val):
    if pd.isna(val) or str(val).strip() == '':
        return pd.NA
    # Take only the first creator if multiple are pipe-separated
    first = str(val).split('||')[0].strip()
    # Remove trailing punctuation common in MARC (period, comma)
    first = first.rstrip('.,;')
    return first if first else pd.NA


# ---------------------------------------------------------------------------
# TITLE NORMALIZATION
# MARC titles often end with a trailing period. Strip it.
# ---------------------------------------------------------------------------
def normalize_title(val):
    if pd.isna(val) or str(val).strip() == '':
        return pd.NA
    return str(val).strip().rstrip('.')


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    if not UNIFIED_CATALOG.exists():
        logging.warning(f'Unified catalog not found at {UNIFIED_CATALOG}. Run export_gold_unified_catalog.py first.')
        sys.exit(0)

    logging.info('--- 🔄 GENERATE GOLD NORMALIZED CATALOG ---')
    df = pd.read_parquet(UNIFIED_CATALOG)
    logging.info(f'Loaded {len(df)} records from unified catalog.')

    # --- Genre ---
    if 'field_genre' in df.columns:
        df['field_genre'] = df['field_genre'].apply(normalize_genre)
        logging.info('✅ Normalized field_genre.')

    # --- Title ---
    if 'title' in df.columns:
        df['title'] = df['title'].apply(normalize_title)
        logging.info('✅ Normalized title.')

    # --- Creator ---
    if 'field_linked_agent' in df.columns:
        df['field_linked_agent'] = df['field_linked_agent'].apply(normalize_creator)
        logging.info('✅ Normalized field_linked_agent.')

    # --- Date: add derived year + decade columns for charting ---
    if 'field_edtf_date_created' in df.columns:
        df['year_created']   = df['field_edtf_date_created'].apply(extract_year)
        df['decade_created'] = df['year_created'].apply(year_to_decade)
        logging.info('✅ Derived year_created and decade_created columns.')

    # --- Drop fully empty columns ---
    before = len(df.columns)
    df = df.dropna(axis=1, how='all')
    logging.info(f'Dropped {before - len(df.columns)} fully empty columns.')

    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUTPUT_PARQUET, index=False)
    logging.info(f'💾 Saved Normalized Catalog: {OUTPUT_PARQUET}')
    logging.info(f'Final Shape: {len(df)} records, {len(df.columns)} columns.')
    logging.info('✅ Gold Normalized Catalog complete!')
