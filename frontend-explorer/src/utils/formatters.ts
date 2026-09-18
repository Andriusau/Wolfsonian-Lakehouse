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


export function getMediaFilenames(identifier: string | null | undefined): string[] {
  if (!identifier) return [];
  const parts = String(identifier)
    .split(/[,;]/)
    .map(part => part.trim())
    .filter(Boolean);
  return Array.from(new Set(parts.map(part => part.replace(/[^a-zA-Z0-9.-]/g, '_'))));
}

export function getMediaFilename(identifier: string | null | undefined): string {
  if (!identifier) return "";
  const filenames = getMediaFilenames(identifier);
  return filenames[0] || "";
}
