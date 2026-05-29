"use client";

import { useState, useEffect } from "react";
import { useDuckDB } from "../hooks/useDuckDB";

export default function Home() {
  const { isReady, runQuery } = useDuckDB();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch initial data when DB is ready
  useEffect(() => {
    if (isReady) {
      handleSearch();
    }
  }, [isReady]);

  const handleSearch = async () => {
    if (!isReady) return;
    setLoading(true);
    
    try {
      // Very basic search query against the unified catalog view
      let query = `
        SELECT title, field_identifier, field_collection_type, field_genre, field_description_long
        FROM catalog 
        WHERE title IS NOT NULL
      `;
      
      if (searchTerm) {
        query += ` AND (lower(title) LIKE '%${searchTerm.toLowerCase()}%' OR lower(field_description_long) LIKE '%${searchTerm.toLowerCase()}%')`;
      }
      
      query += ` LIMIT 50`;

      const data = await runQuery(query);
      
      // Get total count just for fun
      const countData = await runQuery(`SELECT count(*) as total FROM catalog`);
      
      if (data) setResults(data);
      if (countData && countData.length > 0) setTotalCount(countData[0].total);
      
    } catch (error) {
      console.error(error);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="border-b border-slate-700 pb-6">
          <h1 className="text-4xl font-bold text-white tracking-tight">Wolfsonian Lakehouse Explorer</h1>
          <p className="text-slate-400 mt-2 text-lg">Serverless Parquet search powered by DuckDB-WASM</p>
          
          <div className="mt-4 flex items-center space-x-4">
            <div className={`h-3 w-3 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
            <span className="text-sm font-medium">
              {isReady ? `Engine Online • ${totalCount.toLocaleString()} Total Records Loaded` : 'Initializing WASM Engine...'}
            </span>
          </div>
        </header>

        {/* Search Bar */}
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="Search by title, creator, or description..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-6 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button 
            onClick={handleSearch}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-lg font-semibold transition-colors"
          >
            Search
          </button>
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse">Running local SQL query...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((item, idx) => (
              <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-500 transition-colors group flex flex-col">
                
                {/* Dynamically hotlinking the image from Islandora using the identifier */}
                <div className="h-48 bg-slate-900 relative overflow-hidden flex items-center justify-center border-b border-slate-700">
                  <img 
                    src={`https://digital.wolfsonian.org/sites/default/files/images/${item.field_identifier}.jpg`}
                    alt={item.title}
                    className="object-cover w-full h-full opacity-80 group-hover:opacity-100 transition-opacity"
                    onError={(e) => {
                      // Fallback if image doesn't exist on Islandora
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  {/* Fallback UI */}
                  <div className="absolute hidden flex flex-col items-center justify-center text-slate-600">
                     <span className="text-sm">No Preview Available</span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                      {item.field_collection_type || 'Unknown'}
                    </span>
                    <span className="text-xs text-slate-500">{item.field_identifier}</span>
                  </div>
                  
                  <h3 className="font-bold text-lg text-white leading-tight mb-2 line-clamp-2">
                    {item.title}
                  </h3>
                  
                  <p className="text-slate-400 text-sm line-clamp-3 mb-4 flex-1">
                    {item.field_description_long || 'No description available.'}
                  </p>

                  <div className="pt-4 border-t border-slate-700 mt-auto">
                    <span className="inline-block bg-slate-900 rounded-full px-3 py-1 text-xs text-slate-400">
                      {item.field_genre || 'Uncategorized'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !loading && isReady && (
          <div className="text-center py-20 text-slate-500">
            No items found matching your search. Try adjusting your query!
          </div>
        )}
      </div>
    </div>
  );
}
