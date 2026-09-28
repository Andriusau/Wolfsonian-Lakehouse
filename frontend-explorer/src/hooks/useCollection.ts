"use client";

import { useState, useEffect } from "react";
import { getMediaFilename } from '@/utils/formatters';
import { usePathname } from "next/navigation";

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
    
    const defaultHeaders = [
      "field_identifier", "spreadsheet_thumbnail", "title", "field_collection_type", "field_genre",
      "field_description_long", "creators_with_roles", "field_subject", 
      "field_place_published", "field_edtf_date_created", "decade_created",
      "field_extent", "field_credit_line", "field_collection_note", "image_url", "location", "storage_location",
      "Style", "Inscription"
    ];
    
    let exportHeaders = (customFields && customFields.length > 0) ? customFields : defaultHeaders;
    
    // If not passed explicitly, attempt to load saved preferences from localStorage
    if (!customFields && typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("wolfsonian_export_fields_csv");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            exportHeaders = parsed;
          }
        }
      } catch (e) {
        console.error("Error reading saved CSV fields", e);
      }
    }
    
    const csvRows = [];
    
    // Add headers
    csvRows.push(exportHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    
    // Add rows
    for (const row of collection) {
      const primaryId = (row.field_identifier || "").split(';')[0].trim();
      const imageUrl = row.has_image ? `https://lakehouse.wolfsonian.org/images/${getMediaFilename(primaryId)}.jpg` : "";
      
      const values = exportHeaders.map(header => {
        let val = "";
        
        if (header === "image_url") {
          val = imageUrl;
        } else if (header === "spreadsheet_thumbnail") {
          // This formula renders the actual image inside a cell in Google Sheets and newer Excel versions!
          val = imageUrl ? `=IMAGE("${imageUrl}")` : "";
        } else if (header === "location") {
          val = row["location"] || row["sortable4"] || "";
        } else if (header === "creators_with_roles") {
          val = row["creators_with_roles"] || row["field_linked_agent"] || "";
        } else if (header === "Storage_Location" || header === "storage_location") {
          val = row["Storage_Location"] || row["storage_location"] || "";
        } else {
          val = row[header];
        }
        
        const escaped = (val === null || val === undefined) ? "" : String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
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

  return {
    collection,
    isLoaded,
    addItem,
    removeItem,
    clearCollection,
    isInCollection,
    addItems,
    exportCsv,
    exportPdf
  };
}
