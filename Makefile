.PHONY: start stop run-pipeline logs logs-frontend build-all frontend lakehouse metabase

# Start the full environment (Prefect, Metabase, NGINX frontend)
start:
	docker compose up -d

# Safely stop and tear down all containers
stop:
	docker compose down

# ==========================================
# BUILD / RESTART COMMANDS
# ==========================================

# Build images and start the full environment (WARNING: Restarts all pipelines)
build-all:
	docker compose up -d --build

# Rebuild and start only the frontend container
frontend:
	docker compose up -d --build frontend

# Rebuild and start only the lakehouse ETL container
lakehouse:
	docker compose up -d --build lakehouse

# Rebuild and start only the metabase container
metabase:
	docker compose up -d --build metabase

# ==========================================
# UTILITY COMMANDS
# ==========================================

# Tail the logs for the lakehouse ETL container
logs:
	docker compose logs -f lakehouse

# Tail the logs for the frontend container
logs-frontend:
	docker compose logs -f frontend

# Manually trigger the pipeline to run immediately
run-pipeline:
	docker compose run --rm lakehouse

# Run the cleanup script to remove old reports
cleanup-reports:
	docker compose run --rm lakehouse python etl-pipelines/cleanup_reports.py
