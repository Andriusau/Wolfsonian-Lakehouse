import pandas as pd
import sqlalchemy as sa
from sqlalchemy.engine import URL
import configparser
import os
import sys
import subprocess

config = configparser.ConfigParser()
config_path = '/app/config.ini'

if not os.path.exists(config_path):
    print(f"❌ Error: Configuration file not found at {config_path}")
    sys.exit(1)

config.read(config_path)

def get_proficio_connection():
    server = config['proficio']['server'].strip()
    database = config['proficio']['database'].strip()
    username = config['proficio']['username'].strip()
    keytab = config['proficio']['keytab_path'].strip()

    # --- 1. THE FIX: AUTOMATE KERBEROS INSIDE THE CONTAINER ---
    print(f"🔑 Generating Kerberos ticket for {username}...")
    
    # This acts like a human typing the password into the kinit prompt
    kinit_process = subprocess.run(
        ['kinit','-k','-t', keytab, username],
        text=True,
        capture_output=True
    )

    if kinit_process.returncode != 0:
        print(f"❌ Kerberos Auth Failed: {kinit_process.stderr}")
        sys.exit(1)

    print("✅ Secure Ketyab Authentication Success!!")

    # --- 2. THE CONNECTION STRING ---
    # Now that we have a ticket, we use Trusted_Connection=yes
    # No UID or PWD goes into this string!
    connection_url = URL.create(
        drivername="mssql+pyodbc",
        host=server,
        database=database,
        query={
            "driver": "ODBC Driver 18 for SQL Server",
            "Trusted_Connection": "yes",
            "Encrypt": "yes",
            "TrustServerCertificate": "yes"
        }
    )
    
    return sa.create_engine(connection_url)

def raw_data_dump(table_name, output_path):
    engine = get_proficio_connection()
    print(f"🚀 Connecting to Proficio to dump '{table_name}'...")

    query = f"SELECT * FROM {table_name}"

    try:
        with engine.connect() as conn:
            df = pd.read_sql(sa.text(query), conn)

        if df.empty:
            print(f"⚠️ Warning: No data found in '{table_name}'.")
            return

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        df.to_parquet(output_path, index=False)
        print(f"✅ Success! Dumped {len(df)} rows straight to {output_path}")

    except Exception as e:
        print(f"\n❌ Connection Error:\n{str(e)}")

if __name__ == "__main__":
    raw_data_dump("objects", "/app/data/raw/proficio/objects_raw_dump.parquet")
