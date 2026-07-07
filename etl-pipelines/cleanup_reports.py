import os
import glob
from datetime import datetime

def cleanup_old_reports(directory: str = '/app/data/gold'):
    """
    Deletes timestamped CSV reports older than today to prevent disk bloat.
    Assumes filenames contain a YYYYMMDD date string.
    """
    today_str = datetime.now().strftime('%Y%m%d')
    files_to_delete = []

    # 1. Collect alma_vs_islandora_report files
    for file in glob.glob(os.path.join(directory, 'alma_vs_islandora_report_*.csv')):
        filename = os.path.basename(file)
        parts = filename.split('_')
        if len(parts) >= 5:
            date_str = parts[4]
            # Ensure it's an 8-digit date string before comparing
            if len(date_str) == 8 and date_str.isdigit():
                if date_str < today_str:
                    files_to_delete.append(file)

    # 2. Collect duplicates_report files
    for file in glob.glob(os.path.join(directory, 'duplicates_report_*.csv')):
        filename = os.path.basename(file)
        parts = filename.split('_')
        if len(parts) >= 3:
            date_str = parts[2]
            if len(date_str) == 8 and date_str.isdigit():
                if date_str < today_str:
                    files_to_delete.append(file)

    if not files_to_delete:
        print(f"✅ No older reports found to delete in {directory} (keeping only {today_str} or newer).")
        return

    print(f"🗑️ Found {len(files_to_delete)} old reports. Deleting...")
    for f in files_to_delete:
        try:
            os.remove(f)
            print(f"  Deleted: {os.path.basename(f)}")
        except Exception as e:
            print(f"  ❌ Error deleting {f}: {e}")
            
    print("✅ Cleanup complete.")

if __name__ == "__main__":
    # Use Docker path if running in container, else fallback to local relative path
    target_dir = '/app/data/gold' if os.path.exists('/app/data/gold') else 'data/gold'
    
    print("--- 🧹 STARTING OLD REPORT CLEANUP ---")
    cleanup_old_reports(target_dir)
