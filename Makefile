.PHONY: start stop run-pipeline logs build

# Start the full environment (Prefect, Metabase, NGINX frontend)
start:
	docker compose up -d

# Build images and start the full environment
build:
	docker compose up -d --build

# Safely stop and tear down all containers
stop:
	docker compose down

# Tail the logs for the lakehouse ETL container
logs:
	docker compose logs -f lakehouse

# Manually trigger the pipeline to run immediately
run-pipeline:
	docker compose run --rm lakehouse
