.PHONY: start stop run-pipeline logs logs-frontend logs-images build-all frontend lakehouse metabase process-poster-stamps test-poster-stamps process-images process-images-1080p process-images-cleanup process-images-cleanup-dry-run backup test

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

# Run a full Proficio snapshot so deleted records can be captured.
run-proficio-full:
	PROFICIO_FULL_EXTRACT=true docker compose run --rm lakehouse

# Run the cleanup script to remove old reports
cleanup-reports:
	docker compose run --rm lakehouse python etl-pipelines/cleanup_reports.py

# Back up mission-critical state (feedback, metabase DB, watermarks)
backup:
	docker compose run --rm lakehouse python etl-pipelines/backup_state.py

# Run the automated test suite inside the lakehouse container
test:
	docker compose run --rm lakehouse python -m unittest discover -s tests -p "test_*.py" -v

# Reprocess all existing images to 1080p (1920px max dimension) detached in background
process-images-1080p:
	docker rm -f lakehouse-image-processor 2>/dev/null || true
	docker compose run -d --name lakehouse-image-processor -e OVERWRITE_IMAGES=true -e MAX_IMAGE_SIZE=1920 lakehouse python etl-pipelines/process_images.py
	@echo "✅ Started 1080p image processing in the background."
	@echo "👉 Run 'make logs-images' to view live progress (Ctrl+C to exit viewing without stopping the job)."

# Ingest images incrementally in the background
process-images:
	docker rm -f lakehouse-image-processor 2>/dev/null || true
	docker compose run -d --name lakehouse-image-processor lakehouse python etl-pipelines/process_images.py
	@echo "✅ Started image ingestion in the background."
	@echo "👉 Run 'make logs-images' to view live progress (Ctrl+C to exit viewing without stopping the job)."

# Tail live progress of the image processing job
logs-images:
	docker logs -f lakehouse-image-processor

# Run legacy Islandora image rollup cleanup in background
process-images-cleanup:
	docker rm -f lakehouse-image-cleanup 2>/dev/null || true
	docker compose run -d --name lakehouse-image-cleanup lakehouse python etl-pipelines/process_images_cleanup.py
	@echo "✅ Started image cleanup rollup in background."
	@echo "👉 Run 'docker logs -f lakehouse-image-cleanup' to view live progress."

# Dry run mode to preview rollup without writing files
process-images-cleanup-dry-run:
	docker compose run --rm -e DRY_RUN=true lakehouse python etl-pipelines/process_images_cleanup.py

# ==========================================
# ARCHIVE SCRIPTS
# ==========================================

# Run the poster stamps metadata extraction script on all images
process-poster-stamps:
	docker compose run --rm archiver python poster_stamps.py

# Run a test of the poster stamps script on a limited number of images
test-poster-stamps:
	docker compose run --rm -e TEST_LIMIT=5 archiver python poster_stamps.py
