"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMediaFilename, formatLocation } from "@/utils/formatters";
import { 
  getAvailableFields, 
  loadSavedFieldIds, 
  saveSelectedFieldIds, 
  getDefaultFieldIds 
} from "@/utils/exportFields";

export default function ExhibitCatalog() {
  const [collection, setCollection] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [showFieldPicker, setShowFieldPicker] = useState(false);

  useEffect(() => {
    // Load collection from localStorage
    try {
      const saved = window.localStorage.getItem("wolfsonian_lakehouse_collection");
      if (saved) {
        setCollection(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load collection for print view", e);
    }

    // Load PDF field selections
    const fields = loadSavedFieldIds("pdf");
    setSelectedFields(fields);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    // Automatically trigger print dialog when fully loaded if not configuring
    if (isLoaded && collection.length > 0) {
      const timeout = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [isLoaded]);

  const toggleField = (fieldId: string) => {
    const updated = selectedFields.includes(fieldId)
      ? selectedFields.filter(f => f !== fieldId)
      : [...selectedFields, fieldId];
    setSelectedFields(updated);
    saveSelectedFieldIds("pdf", updated);
  };

  const selectAll = () => {
    const all = getAvailableFields("pdf").map(f => f.id);
    setSelectedFields(all);
    saveSelectedFieldIds("pdf", all);
  };

  const deselectAll = () => {
    setSelectedFields(["title"]); // Keep title at minimum
    saveSelectedFieldIds("pdf", ["title"]);
  };

  const resetDefaults = () => {
    const defaults = getDefaultFieldIds("pdf");
    setSelectedFields(defaults);
    saveSelectedFieldIds("pdf", defaults);
  };

  if (!isLoaded) return <div className="p-8">Loading catalog...</div>;
  if (collection.length === 0) {
    return (
      <div className="p-12 text-center font-mono">
        <h2 className="text-xl font-bold mb-4">YOUR COLLECTION IS EMPTY</h2>
        <Link href="/" className="px-4 py-2 border border-black uppercase text-sm font-bold hover:bg-black hover:text-white transition-colors">
          Return to Explorer
        </Link>
      </div>
    );
  }

  const isVisible = (fieldId: string) => selectedFields.includes(fieldId);
  const showImage = isVisible("image");

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const availablePdfFields = getAvailableFields("pdf");

  return (
    <div className="bg-white min-h-screen text-black font-sans print:bg-white print:text-black">
      {/* Sticky Interactive Toolbar (Hidden in Print) */}
      <div className="print:hidden sticky top-0 z-50 bg-neutral-900 text-white border-b border-neutral-700 px-6 py-3 flex flex-wrap items-center justify-between gap-4 font-mono text-xs shadow-lg">
        <div className="flex items-center space-x-4">
          <Link 
            href="/"
            className="text-neutral-400 hover:text-white transition-colors font-bold uppercase"
          >
            ← Back to Search
          </Link>
          <span className="text-neutral-600">|</span>
          <span className="font-bold text-cyan-400 uppercase">
            Curated PDF Catalog ({collection.length} Objects)
          </span>
          <span className="text-neutral-400 hidden sm:inline">
            ({selectedFields.length} of {availablePdfFields.length} fields visible)
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFieldPicker(!showFieldPicker)}
            className="px-3 py-1.5 border border-neutral-600 hover:border-white text-neutral-200 hover:text-white transition-colors uppercase font-bold"
          >
            {showFieldPicker ? "[✕] Hide Fields" : "[⚙] Customize Fields"}
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black font-bold uppercase tracking-wider transition-colors shadow"
          >
            [🖨] Print / Save as PDF
          </button>
        </div>

        {/* Expandable Field Selection Drawer in Print View */}
        {showFieldPicker && (
          <div className="w-full mt-3 pt-3 border-t border-neutral-800 bg-neutral-950 p-4 rounded animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-neutral-300 uppercase tracking-wider text-[11px]">
                Toggle Metadata Displayed on Each Printed Page:
              </span>
              <div className="flex space-x-2 text-[10px]">
                <button onClick={selectAll} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300">
                  Select All
                </button>
                <button onClick={deselectAll} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300">
                  Clear
                </button>
                <button onClick={resetDefaults} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300">
                  Reset Defaults
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {availablePdfFields.map((f) => {
                const checked = isVisible(f.id);
                return (
                  <label 
                    key={f.id} 
                    className={`flex items-center space-x-2 p-2 border cursor-pointer transition-colors text-[11px] ${
                      checked 
                        ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200' 
                        : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <input 
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleField(f.id)}
                      className="accent-cyan-400"
                    />
                    <span className="truncate">{f.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Cover Page */}
      <div className="flex flex-col items-center justify-center min-h-screen p-12 text-center break-after-page print:break-after-page">
        <div className="max-w-2xl space-y-8">
          <div className="text-xs uppercase tracking-[0.3em] font-bold text-gray-500 mb-8">
            The Wolfsonian-FIU
          </div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-6">
            PDF Curated List
          </h1>
          <div className="h-1 w-24 bg-black mx-auto my-8"></div>
          <p className="text-xl font-light text-gray-600">
            A curated selection of {collection.length} items from the Wolfsonian-FIU Lakehouse.
          </p>
          <div className="pt-16 text-sm font-mono text-gray-400 uppercase tracking-widest">
            Generated on {today}
          </div>
        </div>
      </div>

      {/* Catalog Items */}
      <div className="max-w-4xl mx-auto p-8 space-y-16 print:p-0 print:space-y-12">
        {collection.map((item, index) => {
          const primaryId = (item.field_identifier || "").split(";")[0].trim();
          const imageUrl = item.has_image ? `/images/${getMediaFilename(primaryId)}.jpg` : null;
          const creatorDisplay = item.creators_with_roles || item.field_linked_agent;

          return (
            <div 
              key={index} 
              className="flex flex-col md:flex-row gap-8 items-start border-b border-gray-200 pb-12 break-inside-avoid print:break-inside-avoid"
            >
              {/* Image Column (Only if selected) */}
              {showImage && (
                <div className="w-full md:w-1/2 flex-shrink-0 bg-gray-100 flex items-center justify-center min-h-[300px]">
                  {imageUrl ? (
                    <img 
                      src={imageUrl} 
                      alt={item.title} 
                      className="max-w-full max-h-[500px] object-contain"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="text-sm font-mono text-gray-400 uppercase tracking-widest p-12 text-center">
                      [ No Image Available ]
                    </div>
                  )}
                </div>
              )}

              {/* Metadata Column */}
              <div className={`w-full ${showImage ? 'md:w-1/2' : ''} space-y-4`}>
                {isVisible("field_identifier") && item.field_identifier && (
                  <div className="text-xs font-mono font-bold text-gray-500 uppercase tracking-widest">
                    {item.field_identifier}
                  </div>
                )}
                
                {isVisible("title") && (
                  <h2 className="text-2xl font-bold leading-tight">
                    {item.title || "Untitled"}
                  </h2>
                )}

                <div className="space-y-2 pt-4">
                  {isVisible("field_collection_type") && item.field_collection_type && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Collection Type</span>
                      <span className="text-sm font-medium">{item.field_collection_type}</span>
                    </div>
                  )}

                  {isVisible("creators_with_roles") && creatorDisplay && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Creator / Artist</span>
                      <span className="text-sm">{creatorDisplay.split('|').join('; ')}</span>
                    </div>
                  )}
                  
                  {isVisible("field_edtf_date_created") && item.field_edtf_date_created && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Date</span>
                      <span className="text-sm">{item.field_edtf_date_created}</span>
                    </div>
                  )}

                  {isVisible("decade_created") && item.decade_created && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Decade Created</span>
                      <span className="text-sm">{item.decade_created}s</span>
                    </div>
                  )}

                  {isVisible("field_extent") && item.field_extent && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Dimensions / Extent</span>
                      <span className="text-sm">{item.field_extent}</span>
                    </div>
                  )}

                  {isVisible("field_physical_form") && item.field_physical_form && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Material / Medium</span>
                      <span className="text-sm">{item.field_physical_form}</span>
                    </div>
                  )}

                  {isVisible("field_genre") && item.field_genre && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Object Type / Genre</span>
                      <span className="text-sm">{item.field_genre.split('|').join(', ')}</span>
                    </div>
                  )}

                  {isVisible("field_credit_line") && item.field_credit_line && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Credit Line</span>
                      <span className="text-sm">{item.field_credit_line}</span>
                    </div>
                  )}

                  {isVisible("field_subject") && item.field_subject && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Subject</span>
                      <span className="text-sm">{item.field_subject.split('|').join('; ')}</span>
                    </div>
                  )}

                  {isVisible("field_place_published") && item.field_place_published && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Place Published</span>
                      <span className="text-sm">{item.field_place_published}</span>
                    </div>
                  )}

                  {isVisible("field_collection_note") && item.field_collection_note && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Note / Exhibition History</span>
                      <span className="text-sm text-gray-600">{item.field_collection_note}</span>
                    </div>
                  )}

                  {isVisible("Style") && item.Style && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Style / Movement</span>
                      <span className="text-sm">{item.Style}</span>
                    </div>
                  )}

                  {isVisible("Inscription") && item.Inscription && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Inscriptions / Markings</span>
                      <span className="text-sm">{item.Inscription}</span>
                    </div>
                  )}

                  {isVisible("exhibit_label") && item.exhibit_label && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Exhibit Label</span>
                      <span className="text-sm">{item.exhibit_label}</span>
                    </div>
                  )}

                  {isVisible("exhibit_title") && item.exhibit_title && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Exhibition Title</span>
                      <span className="text-sm">{item.exhibit_title}</span>
                    </div>
                  )}

                  {isVisible("location") && item.location && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Location</span>
                      <span className="text-sm">{formatLocation(item.location)}</span>
                    </div>
                  )}

                  {isVisible("storage_location") && item.storage_location && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Storage Location</span>
                      <span className="text-sm">{item.storage_location}</span>
                    </div>
                  )}
                </div>

                {isVisible("field_description_long") && item.field_description_long && (
                  <div className="pt-4 text-sm text-gray-700 leading-relaxed font-light border-t border-gray-100">
                    {item.field_description_long}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
