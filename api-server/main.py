from fastapi import FastAPI, HTTPException, Query, Request
import time
import json
import os
from datetime import datetime
import duckdb
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path

from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

app = FastAPI(
    title="Wolfsonian Lakehouse API",
    description="Public REST API for programmatic access to the Wolfsonian-FIU collections data.",
    version="1.0.0"
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow cross-origin requests (CORS) from any origin (or specify labs.wolfsonian.org)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for this public API
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time_ms = (time.time() - start_time) * 1000

    # Ensure logs directory exists
    log_dir = "/app/logs"
    os.makedirs(log_dir, exist_ok=True)
    
    # Filter out health checks if desired, but good to log everything
    log_data = {
        "timestamp": datetime.utcnow().isoformat(),
        "endpoint": request.url.path,
        "method": request.method,
        "client_ip": request.client.host if request.client else None,
        "status_code": response.status_code,
        "response_time_ms": round(process_time_ms, 2)
    }
    
    # Append to JSONL file
    log_file_path = os.path.join(log_dir, "api_requests.jsonl")
    try:
        with open(log_file_path, "a") as f:
            f.write(json.dumps(log_data) + "\n")
    except Exception as e:
        # Silently fail if log can't be written so API doesn't crash
        pass
        
    return response

PARQUET_PATH = "/app/data/gold/unified_catalog_normalized.parquet"

# Initialize DuckDB connection
conn = duckdb.connect(database=':memory:', read_only=False)

def check_data_ready():
    if not Path(PARQUET_PATH).exists():
        raise HTTPException(status_code=503, detail="Lakehouse data is currently unavailable.")

@app.get("/api/v1/records")
@limiter.limit("100/minute")
def get_records(
    request: Request,
    limit: int = Query(50, ge=1, le=1000, description="Number of records to return"),
    offset: int = Query(0, ge=0, description="Number of records to skip")
):
    """
    Fetch a paginated list of artifacts from the Lakehouse.
    """
    check_data_ready()
    try:
        query = f"""
            SELECT * EXCLUDE (search_text) 
            FROM read_parquet('{PARQUET_PATH}') 
            ORDER BY id
            LIMIT {limit} OFFSET {offset}
        """
        result = conn.execute(query)
        columns = [desc[0] for desc in result.description]
        records = [dict(zip(columns, row)) for row in result.fetchall()]
        
        # Replace None with empty string for backward compatibility
        for r in records:
            for k, v in r.items():
                if v is None:
                    r[k] = ""
                    
        return {"data": records, "limit": limit, "offset": offset}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/aa_good_lookup")
@limiter.limit("100/minute")
def get_aa_good_lookup(
    request: Request,
    limit: int = Query(50, ge=1, le=1000, description="Number of records to return"),
    offset: int = Query(0, ge=0, description="Number of records to skip")
):
    """
    Legacy endpoint matching the exact output of the old Drupal 'aa_good_lookup' view.
    """
    check_data_ready()
    try:
        query = f"""
            SELECT 
                field_identifier as "Accession Number",
                field_collection_type as "Resource Type",
                title as "Title",
                id as "ID (Node ID)",
                field_collection_note as "Collection",
                field_linked_agent as "Creator",
                field_genre as "Genre",
                field_edtf_date_created as "Date",
                field_place_published as "Geographic Origin",
                field_subject as "Subject",
                field_description_long as "Description",
                field_credit_line as "Credit Line",
                field_physical_form as "Material",
                field_extent as "Extent",
                image_count as "Media: Name",
                alma_identifier as "Additional Accession Numbers"
            FROM read_parquet('{PARQUET_PATH}')
            ORDER BY id
            LIMIT {limit} OFFSET {offset}
        """
        result = conn.execute(query)
        columns = [desc[0] for desc in result.description]
        records = [dict(zip(columns, row)) for row in result.fetchall()]
        
        # Replace None with empty string for backward compatibility
        for r in records:
            for k, v in r.items():
                if v is None:
                    r[k] = ""
                    
        return {"data": records, "limit": limit, "offset": offset}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/records/{identifier}")
@limiter.limit("100/minute")
def get_record(request: Request, identifier: str):
    """
    Fetch a specific artifact by its exact ID (e.g., 2022.7.3).
    Matches against both the internal id and the accession number (field_identifier).
    """
    check_data_ready()
    try:
        # Use parameters to prevent SQL injection
        query = f"""
            SELECT * EXCLUDE (search_text) 
            FROM read_parquet('{PARQUET_PATH}')
            WHERE field_identifier = ? OR CAST(id AS VARCHAR) = ?
            LIMIT 1
        """
        result = conn.execute(query, [identifier, identifier])
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()
        
        if not rows:
            raise HTTPException(status_code=404, detail="Record not found")
            
        record = dict(zip(columns, rows[0]))
        # Replace None with empty string
        for k, v in record.items():
            if v is None:
                record[k] = ""
                
        return record
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/search")
@limiter.limit("100/minute")
def search_records(
    request: Request,
    q: str = Query(..., description="Full-text search query"),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """
    Full-text search leveraging DuckDB's search indexes.
    """
    check_data_ready()
    try:
        # DuckDB string functions: list_contains(string_split(search_text, ' '), 'chair') 
        # Or simple ILIKE for demonstration if FTS is not pre-indexed in Parquet
        # To make it safer against SQL injection, we use parameters.
        search_term = f"%{q}%"
        query = f"""
            SELECT * EXCLUDE (search_text)
            FROM read_parquet('{PARQUET_PATH}')
            WHERE title ILIKE ? OR field_description_long ILIKE ? OR field_identifier ILIKE ?
            ORDER BY has_image DESC, title ASC
            LIMIT {limit} OFFSET {offset}
        """
        result = conn.execute(query, [search_term, search_term, search_term])
        columns = [desc[0] for desc in result.description]
        records = [dict(zip(columns, row)) for row in result.fetchall()]
        
        # Replace None with empty string
        for r in records:
            for k, v in r.items():
                if v is None:
                    r[k] = ""
                    
        return {"data": records, "query": q, "limit": limit, "offset": offset}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "ok", "data_ready": Path(PARQUET_PATH).exists()}
