"use client";

import { useState, useEffect } from "react";
import { getMediaFilename, formatLocation } from '@/utils/formatters';
import { createStoreZipBlob, sanitizeAccessionFilename, type ZipFileInput } from '@/utils/zip';
import { loadSavedFieldIds } from '@/utils/exportFields';
import { usePathname } from "next/navigation";

function formatRowValues(row: any, exportHeaders: string[]): string[] {
  const primaryId = (row.field_identifier || "").split(';')[0].trim();
  const imageUrl = row.has_image ? `https://lakehouse.wolfsonian.org/images/${getMediaFilename(primaryId)}.jpg` : "";

  return exportHeaders.map(header => {
    let val = "";
    
    if (header === "image_url") {
      val = imageUrl;
    } else if (header === "spreadsheet_thumbnail") {
      // This formula renders the actual image inside a cell in Google Sheets and newer Excel versions!
      val = imageUrl ? `=IMAGE("${imageUrl}")` : "";
    } else if (header === "location") {
      val = formatLocation(row["location"] || row["sortable4"] || "");
    } else if (header === "creators_with_roles") {
      val = row["creators_with_roles"] || row["field_linked_agent"] || "";
    } else if (header === "Storage_Location" || header === "storage_location") {
      val = row["Storage_Location"] || row["storage_location"] || "";
    } else {
      const raw = row[header];
      if (raw !== null && raw !== undefined) {
        const s = String(raw).trim();
        if (s !== "<NA>" && s !== "NA" && s !== "nan") {
          val = String(raw);
        }
      }
    }
    
    const escaped = val.replace(/"/g, '""');
    return `"${escaped}"`;
  });
}

export function useCollection() {
  const pathname = usePathname();
  const [collection, setCollection] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadCollection = () => {
      try {
        const saved = window.localStorage.getItem("wolfsonian_lakehouse_collection");
        if (saved) {
          setCollection(JSON.parse(saved));
        }
      } catch (e) {
        console.error("Failed to load collection from localStorage", e);
      }
    };

    loadCollection();
    setIsLoaded(true);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "wolfsonian_lakehouse_collection" && e.newValue) {
        setCollection(JSON.parse(e.newValue));
      }
    };

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setCollection(customEvent.detail);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("lakehouse_collection_update", handleCustomEvent);
    window.addEventListener("popstate", loadCollection);
    window.addEventListener("focus", loadCollection);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("lakehouse_collection_update", handleCustomEvent);
      window.removeEventListener("popstate", loadCollection);
      window.removeEventListener("focus", loadCollection);
    };
  }, [pathname]);

  const updateCollection = (newCollection: any[]) => {
    setCollection(newCollection);
    try {
      window.localStorage.setItem("wolfsonian_lakehouse_collection", JSON.stringify(newCollection, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
      ));
      window.dispatchEvent(new CustomEvent("lakehouse_collection_update", { detail: newCollection }));
    } catch (e) {
      console.error("Failed to save collection to localStorage", e);
    }
  };

  const addItem = (item: any) => {
    if (!isInCollection(item.field_identifier)) {
      updateCollection([...collection, item]);
    }
  };

  const removeItem = (identifier: string) => {
    updateCollection(collection.filter((i) => i.field_identifier !== identifier));
  };

  const clearCollection = () => {
    updateCollection([]);
  };

  const isInCollection = (identifier: string) => {
    return collection.some((i) => i.field_identifier === identifier);
  };

  const addItems = (items: any[]) => {
    const existingIds = new Set(collection.map((i) => i.field_identifier));
    const newItems = items.filter(item => !existingIds.has(item.field_identifier));
    if (newItems.length > 0) {
      updateCollection([...collection, ...newItems]);
    }
  };

  const exportCsv = (customFields?: string[]) => {
    if (collection.length === 0) return;
    
    const exportHeaders = (customFields && customFields.length > 0) 
      ? customFields 
      : loadSavedFieldIds("csv");
    
    const csvRows = [];
    // Add headers
    csvRows.push(exportHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    
    // Add rows
    for (const row of collection) {
      csvRows.push(formatRowValues(row, exportHeaders).join(','));
    }
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    link.setAttribute("download", `Wolfsonian_MyList_${mm}${dd}${yyyy}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const exportSingleRecordCsv = (record: any, customFields?: string[]) => {
    if (!record) return;

    const exportHeaders = (customFields && customFields.length > 0)
      ? customFields
      : loadSavedFieldIds("csv");

    const csvRows = [];
    // Add headers
    csvRows.push(exportHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    // Add single record row
    csvRows.push(formatRowValues(record, exportHeaders).join(','));

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const primaryId = (record.field_identifier || "").split(';')[0].trim();
    const safeAccession = sanitizeAccessionFilename(primaryId || "record");
    link.setAttribute("download", `Wolfsonian_${safeAccession}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const exportPdf = (customFields?: string[]) => {
    if (collection.length === 0) return;
    if (customFields && customFields.length > 0 && typeof window !== "undefined") {
      try {
        window.localStorage.setItem("wolfsonian_export_fields_pdf", JSON.stringify(customFields));
      } catch (e) {
        console.error("Failed to save PDF fields to localStorage", e);
      }
    }
    // Open the /exhibit-catalog route which handles the print formatting
    window.open('/exhibit-catalog', '_blank');
  };

  const exportImagesZip = async (
    onProgress?: (progress: { current: number; total: number; currentAccession?: string }) => void
  ): Promise<{ successCount: number; failedCount: number }> => {
    if (collection.length === 0) return { successCount: 0, failedCount: 0 };

    const itemsWithImages = collection.filter((item) => item.has_image !== false && item.field_identifier);
    if (itemsWithImages.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    const files: ZipFileInput[] = [];
    const usedNames = new Set<string>();
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < itemsWithImages.length; i++) {
      const item = itemsWithImages[i];
      const accession = sanitizeAccessionFilename(item.field_identifier);
      
      let fileName = `${accession}.jpg`;
      let counter = 1;
      while (usedNames.has(fileName)) {
        fileName = `${accession}_${counter}.jpg`;
        counter++;
      }
      usedNames.add(fileName);

      onProgress?.({
        current: i,
        total: itemsWithImages.length,
        currentAccession: accession,
      });

      try {
        const primaryId = (item.field_identifier || "").split(";")[0].trim();
        const mediaFilename = getMediaFilename(primaryId);
        const res = await fetch(`/images/${mediaFilename}.jpg`);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          files.push({
            name: fileName,
            data: new Uint8Array(arrayBuffer),
          });
          successCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error(`Failed to fetch image for ${item.field_identifier}:`, err);
        failedCount++;
      }

      onProgress?.({
        current: i + 1,
        total: itemsWithImages.length,
        currentAccession: accession,
      });
    }

    if (files.length > 0) {
      const zipBlob = createStoreZipBlob(files);
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const yyyy = now.getFullYear();
      link.download = `Wolfsonian_Saved_Images_${mm}${dd}${yyyy}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    }

    return { successCount, failedCount };
  };

  return {
    collection,
    isLoaded,
    addItem,
    removeItem,
    clearCollection,
    isInCollection,
    addItems,
    exportCsv,
    exportSingleRecordCsv,
    exportPdf,
    exportImagesZip
  };
}
