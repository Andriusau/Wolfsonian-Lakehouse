export function parseDelimited(value: any, delimiter: string = '|'): string[] {
  if (!value) return [];
  
  const parsed = String(value)
    .split(delimiter)
    .map(item => item.trim())
    .filter(item => item.length > 0);

  return Array.from(new Set(parsed));
}

export function formatEDTFDate(dateStr: any): string {
  if (!dateStr) return '';
  let str = String(dateStr).trim();

  let isUncertain = false;
  let isApproximate = false;

  if (str.endsWith('?')) {
    isUncertain = true;
    str = str.slice(0, -1);
  } else if (str.endsWith('~')) {
    isApproximate = true;
    str = str.slice(0, -1);
  }

  if (str.includes('/')) {
    str = str.split('/').join(' to ');
  }

  if (isUncertain) {
    str += ' (year uncertain)';
  } else if (isApproximate) {
    str += ' (year approximate)';
  }

  return str;
}


export function getMediaFilename(identifier: string | null | undefined): string {
  if (!identifier) return "";
  const primaryId = String(identifier).split(';')[0].trim();
  return primaryId.replace(/[^a-zA-Z0-9.-]/g, '_');
}

export const LIBRARY_LOCATION_NAMES: Record<string, string> = {
  'RAR': 'Rare',
  'RARO': 'Rare Oversized',
  'RARDO': 'Rare Double Oversized',
  'WOR': "World's Fairs",
  'WORO': "World's Fairs Oversized",
  'WORDO': "World's Fairs Double Oversized",
  'OLY': 'Olympics',
  'OLYO': 'Olympics Oversized',
  'OLYDO': 'Olympics Double Oversized',
  'PER': 'Periodicals',
  'PERDO': 'Periodicals Double Oversized',
  'SBH': 'Subject Headings',
  'SBHO': 'Subject Headings Oversized',
  'SBHDO': 'Subject Headings Double Oversized',
  'WOL': 'Ephemera',
  'VEE': 'Veeze',
  'RUP': 'Rupprecht',
  'GEOBP': 'George B. Post',
  'CCC': 'CCC',
};

export function formatLocation(rawLocation?: any): string {
  if (!rawLocation) return '';
  const trimmed = String(rawLocation).trim();
  return LIBRARY_LOCATION_NAMES[trimmed] || trimmed;
}
