import duckdb
import os
import shutil
import logging
from prefect import task, flow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Reads API logs from JSONL and appends to Parquet, then clears JSONL."""
    log_dir = "/app/logs"
    data_dir = "/app/data/gold"
    
    jsonl_path = os.path.join(log_dir, "api_requests.jsonl")
    processing_path = os.path.join(log_dir, "api_requests_processing.jsonl")
    parquet_path = os.path.join(data_dir, "api_metrics.parquet")

    if not os.path.exists(jsonl_path) or os.path.getsize(jsonl_path) == 0:
        logger.info("No new API logs to process.")
        return

    # Safely move the file so new requests write to a new jsonl file
    shutil.move(jsonl_path, processing_path)
    
    try:
        conn = duckdb.connect(database=':memory:')
        
        # Check if parquet exists
        if os.path.exists(parquet_path):
            conn.execute(f"CREATE TABLE metrics AS SELECT * FROM read_parquet('{parquet_path}')")
            conn.execute(f"INSERT INTO metrics SELECT * FROM read_json_auto('{processing_path}')")
            conn.execute(f"COPY metrics TO '{parquet_path}' (FORMAT PARQUET)")
        else:
            # Create new parquet from jsonl
            conn.execute(f"COPY (SELECT * FROM read_json_auto('{processing_path}')) TO '{parquet_path}' (FORMAT PARQUET)")
            
        logger.info(f"Successfully appended logs to {parquet_path}")
        
    except Exception as e:
        logger.error(f"Failed to transform API logs: {e}")
        # If it fails, move the file back so we don't lose the data
        if os.path.exists(jsonl_path):
            # Append processing to jsonl
            with open(jsonl_path, 'a') as f_jsonl, open(processing_path, 'r') as f_proc:
                f_jsonl.write(f_proc.read())
            os.remove(processing_path)
        else:
            shutil.move(processing_path, jsonl_path)
        raise
    finally:
        # Clean up processing file if it still exists
        if os.path.exists(processing_path):
            os.remove(processing_path)

if __name__ == "__main__":
    main()
