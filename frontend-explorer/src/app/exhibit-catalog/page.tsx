"use client";

import { useEffect, useState } from "react";

export default function ExhibitCatalog() {
  const [collection, setCollection] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

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
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    // Automatically trigger print dialog when fully loaded
    if (isLoaded) {
      // Small timeout to ensure images start loading
      const timeout = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [isLoaded]);

  if (!isLoaded) return <div className="p-8">Loading catalog...</div>;
  if (collection.length === 0) return <div className="p-8">Your collection is empty.</div>;

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-white min-h-screen text-black font-sans print:bg-white print:text-black">
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
          const imageUrl = item.has_image ? `https://lakehouse.wolfsonian.org/images/${primaryId}.jpg` : null;

          return (
            <div 
              key={index} 
              className="flex flex-col md:flex-row gap-8 items-start border-b border-gray-200 pb-12 break-inside-avoid print:break-inside-avoid"
            >
              {/* Image Column */}
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

              {/* Metadata Column */}
              <div className="w-full md:w-1/2 space-y-4">
                <div className="text-xs font-mono font-bold text-gray-500 uppercase tracking-widest">
                  {item.field_identifier}
                </div>
                
                <h2 className="text-2xl font-bold leading-tight">
                  {item.title || "Untitled"}
                </h2>

                <div className="space-y-2 pt-4">
                  {item.field_linked_agent && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Creator</span>
                      <span className="text-sm">{item.field_linked_agent.split('|').join('; ')}</span>
                    </div>
                  )}
                  
                  {item.field_edtf_date_created && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Date</span>
                      <span className="text-sm">{item.field_edtf_date_created}</span>
                    </div>
                  )}

                  {item.field_genre && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Object Type</span>
                      <span className="text-sm">{item.field_genre.split('|').join(', ')}</span>
                    </div>
                  )}
                  
                  {item.field_physical_form && (
                    <div>
                      <span className="text-xs font-bold uppercase text-gray-400 tracking-wider block">Medium</span>
                      <span className="text-sm">{item.field_physical_form}</span>
                    </div>
                  )}
                </div>

                {item.field_description_long && (
                  <div className="pt-4 text-sm text-gray-700 leading-relaxed font-light">
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
