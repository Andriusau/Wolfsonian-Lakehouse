import { useState, useEffect } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

export function useDuckDB() {
  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
  const [conn, setConn] = useState<duckdb.AsyncDuckDBConnection | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      // 1. Select the correct bundle for the browser from JSDelivr CDN
      // This completely avoids any Next.js Webpack worker configuration issues!
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();
      const newDb = new duckdb.AsyncDuckDB(logger, worker);

      await newDb.instantiate(bundle.mainModule, bundle.pthreadWorker);

      const newConn = await newDb.connect();

      // 2. Register the parquet file from the public directory
      // Since it's mounted via Docker to /public/data/, the browser can access it at /data/
      try {
        await newDb.registerFileURL('normalized_catalog.parquet', '/data/gold_normalized_catalog.parquet', duckdb.DuckDBDataProtocol.HTTP, false);
        // Create a view so we can query it like a normal table
        await newConn.query(`CREATE VIEW catalog AS SELECT * FROM read_parquet('normalized_catalog.parquet');`);
        console.log("DuckDB initialized and Parquet file mounted!");
      } catch (e) {
        console.error("Failed to mount parquet file. It might not exist in the public directory yet.", e);
      }

      setDb(newDb);
      setConn(newConn);
      setIsReady(true);
    }

    init();

    return () => {
      conn?.close();
      db?.terminate();
    };
  }, []);

  // Helper function to run queries
  const runQuery = async (query: string) => {
    if (!conn) return null;
    try {
      const arrowResult: any = await conn.query(query);
      // Convert Arrow table to standard JSON array
      return arrowResult.toArray().map((row: any) => row.toJSON());
    } catch (e) {
      console.error("Query Failed:", e);
      return [];
    }
  };

  return { isReady, runQuery };
}
