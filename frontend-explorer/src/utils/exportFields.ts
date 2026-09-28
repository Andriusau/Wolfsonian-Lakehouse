export interface ExportFieldDef {
  id: string;
  label: string;
  gridLabel: string;
  category: "core" | "details" | "classification" | "media";
  defaultCsv: boolean;
  defaultPdf: boolean;
  csvOnly?: boolean;
  pdfOnly?: boolean;
}

export const GRID_EXPORT_FIELDS: ExportFieldDef[] = [
  // Media options
  {
    id: "spreadsheet_thumbnail",
    label: "Spreadsheet Thumbnail (=IMAGE)",
    gridLabel: "THUMBNAIL FORMULA",
    category: "media",
    defaultCsv: true,
    defaultPdf: false,
    csvOnly: true,
  },
  {
    id: "image_url",
    label: "Direct Image URL",
    gridLabel: "IMAGE URL",
    category: "media",
    defaultCsv: true,
    defaultPdf: false,
    csvOnly: true,
  },
  {
    id: "image",
    label: "Artwork Image Preview",
    gridLabel: "IMAGE PREVIEW",
    category: "media",
    defaultCsv: false,
    defaultPdf: true,
    pdfOnly: true,
  },

  // Core identification
  {
    id: "field_identifier",
    label: "Accession # / Identifier",
    gridLabel: "ACCESSION #",
    category: "core",
    defaultCsv: true,
    defaultPdf: true,
  },
  {
    id: "title",
    label: "Title",
    gridLabel: "TITLE",
    category: "core",
    defaultCsv: true,
    defaultPdf: true,
  },
  {
    id: "field_collection_type",
    label: "Collection Type",
    gridLabel: "COLLECTION TYPE",
    category: "core",
    defaultCsv: true,
    defaultPdf: false,
  },
  {
    id: "creators_with_roles",
    label: "Creator / Artist (with Roles)",
    gridLabel: "CREATOR",
    category: "core",
    defaultCsv: true,
    defaultPdf: true,
  },

  // Details & Physical
  {
    id: "field_edtf_date_created",
    label: "Date Created",
    gridLabel: "DATE",
    category: "details",
    defaultCsv: true,
    defaultPdf: true,
  },
  {
    id: "field_extent",
    label: "Dimensions / Extent",
    gridLabel: "DIMENSIONS",
    category: "details",
    defaultCsv: true,
    defaultPdf: true,
  },
  {
    id: "field_physical_form",
    label: "Material / Medium",
    gridLabel: "MATERIAL",
    category: "details",
    defaultCsv: true,
    defaultPdf: true,
  },
  {
    id: "field_credit_line",
    label: "Credit Line",
    gridLabel: "CREDIT",
    category: "details",
    defaultCsv: true,
    defaultPdf: true,
  },

  // Classification & Context
  {
    id: "field_genre",
    label: "Object Type / Genre",
    gridLabel: "GENRE",
    category: "classification",
    defaultCsv: true,
    defaultPdf: true,
  },
  {
    id: "field_description_long",
    label: "Description",
    gridLabel: "DESCRIPTION",
    category: "classification",
    defaultCsv: true,
    defaultPdf: true,
  },
  {
    id: "field_subject",
    label: "Subject",
    gridLabel: "SUBJECT",
    category: "classification",
    defaultCsv: true,
    defaultPdf: false,
  },
  {
    id: "field_place_published",
    label: "Place Published",
    gridLabel: "PLACE",
    category: "classification",
    defaultCsv: true,
    defaultPdf: false,
  },
  {
    id: "field_collection_note",
    label: "Collection Note / Exhibition History",
    gridLabel: "NOTE",
    category: "classification",
    defaultCsv: true,
    defaultPdf: false,
  },
];

export const CSV_STORAGE_KEY = "wolfsonian_export_fields_csv";
export const PDF_STORAGE_KEY = "wolfsonian_export_fields_pdf";

export function getDefaultFieldIds(format: "csv" | "pdf"): string[] {
  return GRID_EXPORT_FIELDS
    .filter(f => format === "csv" ? (!f.pdfOnly && f.defaultCsv) : (!f.csvOnly && f.defaultPdf))
    .map(f => f.id);
}

export function getAvailableFields(format: "csv" | "pdf"): ExportFieldDef[] {
  return GRID_EXPORT_FIELDS.filter(f => format === "csv" ? !f.pdfOnly : !f.csvOnly);
}

export function loadSavedFieldIds(format: "csv" | "pdf"): string[] {
  if (typeof window === "undefined") {
    return getDefaultFieldIds(format);
  }
  try {
    const key = format === "csv" ? CSV_STORAGE_KEY : PDF_STORAGE_KEY;
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter to ensure only currently valid field IDs are kept
        const validIds = new Set(getAvailableFields(format).map(f => f.id));
        const filtered = parsed.filter(id => validIds.has(id));
        if (filtered.length > 0) return filtered;
      }
    }
  } catch (e) {
    console.error(`Failed to load ${format} field selections from localStorage`, e);
  }
  return getDefaultFieldIds(format);
}

export function saveSelectedFieldIds(format: "csv" | "pdf", fields: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const key = format === "csv" ? CSV_STORAGE_KEY : PDF_STORAGE_KEY;
    window.localStorage.setItem(key, JSON.stringify(fields));
  } catch (e) {
    console.error(`Failed to save ${format} field selections to localStorage`, e);
  }
}
