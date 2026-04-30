<div align="center">

  # 🐺 Wolfsonian Lakehouse ETL

  *A robust, containerized Data Lakehouse architecture for extracting, staging, and analyzing museum and library collection data using Python, DuckDB, and Parquet.*

  [![Python 3.10](https://img.shields.io/badge/Python-3.10-blue.svg)](#)
  [![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED.svg)](#)
  [![DuckDB](https://img.shields.io/badge/DuckDB-OLAP-yellow.svg)](#)
  [![Data](https://img.shields.io/badge/Architecture-Medallion-brightgreen.svg)](#)
</div>

---

## 📖 Table of Contents
- [About the Project](#-about-the-project)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Key Features](#-key-features)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Pipeline Execution](#-pipeline-execution)

---

## 🧐 About the Project
The Wolfsonian Lakehouse is an automated ELT (Extract, Load, Transform) pipeline designed to unify disparate data sources into a single, high-performance analytics layer. It extracts data from APIs, legacy SQL Server databases, and binary MARC files, staging them as raw Parquet files before transforming them into a clean, "Gold" standard layer for visualization in Metabase.

## 🏗️ Architecture & Tech Stack
* **Orchestration:** Prefect & Docker Compose
* **Data Extraction:** Python 3.10 (Pandas, PyArrow, requests, pymarc)
* **Database Connectivity:** SQLAlchemy, pyodbc (ODBC Driver 18 for SQL Server)
* **Authentication:** Automated Kerberos (`kinit`) integration inside containers
* **Storage Format:** Apache Parquet (High-speed, columnar storage)
* **Analytics Engine:** DuckDB
* **Visualization:** Metabase

---

## ⚡ Key Features
* **Concurrent API Fetching:** The Islandora microservice utilizes `ThreadPoolExecutor` and auto-discovery logic to fetch paginated API data rapidly and resiliently.
* **Seamless Kerberos Auth:** The Proficio extraction script automatically generates Kerberos tickets inside the Docker container to securely query internal SQL Server databases without exposing passwords in connection strings.
* **Binary File Processing:** Safely extracts hundreds of complex, nested diagnostic fields from Alma `.mrc` library files.
* **Medallion Architecture:** Strictly separates raw, untransformed data (`data/raw/`) from business-ready, clean data (`data/gold/`).
* **Robust Workflow Orchestration:** Uses Prefect to manage the ELT pipeline, providing a UI dashboard for monitoring, task-level retries, and execution logs.

---

## 📂 Project Structure

```text
wolf-lakehouse/
├── config.ini                   # Database credentials (Ignored in Git)
├── data/                        # The Lakehouse Storage
│   ├── gold/                    # Gold Layer: Clean DuckDB views/Parquet
│   ├── raw/                     # Bronze Layer: Unaltered source dumps
│   │   ├── alma/
│   │   │   └── BIBLIOGRAPHIC_16308238980006571_16308238960006571_1.mrc
│   │   ├── islandora/
│   │   │   └── islandora_lookup.parquet
│   │   └── proficio/
│   │       └── objects_raw_dump.parquet
│   └── silver/                  # Silver Layer: Staged and cleaned transformations
├── docker-compose.yml           # The Master Switch for orchestration
├── Dockerfile                   # Builds the Python 3.10 environment + ODBC/Kerberos
├── etl-pipelines/               # Core Extraction Microservices
│   ├── export_proficio_to_workbench.py
│   ├── extract_alma_raw.py
│   ├── extract_islandora_raw.py
│   ├── extract_proficio_raw.py
│   ├── orchestrate_prefect.py   # Master Prefect Workflow
│   ├── requirements.txt
│   ├── transform_alma_raw.py
│   └── transform_proficio_silver.py
├── logs/                        # Transformation and extraction logs
└── README.md
```

---

## 🚀 Pipeline Execution (Powered by Prefect)

We have migrated from a sequential bash script to a robust workflow orchestrator using Prefect!

**1. Rebuild the Docker Image**
If you've recently updated `requirements.txt` or the Dockerfile:
```bash
docker compose build
```

**2. Start the Prefect UI**
Spin up the local Prefect Server to monitor your runs:
```bash
docker compose up prefect-server -d
```
*You can now open [http://localhost:4200](http://localhost:4200) in your web browser to view the Prefect Dashboard.*

**3. Run the Pipeline**
Trigger the extraction and transformation workflow:
```bash
docker compose run --rm lakehouse
```
*Watch your pipeline execute in real-time in the Prefect UI! If any task fails, you can retry just that specific task from the dashboard without starting over.*