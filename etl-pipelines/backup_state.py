#!/usr/bin/env python3
"""
Automated State Backup Utility for Wolfsonian Lakehouse.

Creates compressed, timestamped snapshots of mission-critical state files:
1. Community feature requests & votes (data/feedback/feature_requests.json)
2. Metabase BI database & dashboards (data/metabase.db.mv.db)
3. Incremental sync watermark tracker (data/watermark_proficio.json)

Includes automated retention pruning to prevent disk space exhaustion.
"""

import argparse
import logging
import os
import shutil
import sys
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('backup_state')


def resolve_data_dir() -> Path:
    """Detect whether running inside Docker container (/app/data) or locally."""
    if Path('/app/data').exists():
        return Path('/app/data')
    # Local fallback
    local_data = Path(__file__).resolve().parent.parent / 'data'
    if local_data.exists():
        return local_data
    return Path('data')


def prune_old_backups(directory: Path, pattern: str, retention_days: int) -> int:
    """Deletes files in directory matching pattern older than retention_days."""
    if not directory.exists():
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    pruned_count = 0

    for file_path in directory.glob(pattern):
        if not file_path.is_file():
            continue
        mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff:
            try:
                file_path.unlink()
                logger.info(f"🗑️ Pruned expired backup: {file_path.name} (age: {(datetime.now(timezone.utc) - mtime).days} days)")
                pruned_count += 1
            except Exception as e:
                logger.warning(f"Failed to prune {file_path.name}: {e}")

    return pruned_count


def backup_feedback(data_dir: Path, retention_days: int) -> bool:
    """Backs up feature_requests.json to data/backups/feedback/."""
    source_file = data_dir / 'feedback' / 'feature_requests.json'
    dest_dir = data_dir / 'backups' / 'feedback'
    dest_dir.mkdir(parents=True, exist_ok=True)

    if not source_file.exists():
        logger.warning(f"Feedback file not found: {source_file}. Skipping feedback backup.")
        return False

    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    dest_file = dest_dir / f"feedback_{timestamp}.json"

    try:
        # Atomic copy
        shutil.copy2(source_file, dest_file)
        file_size_kb = dest_file.stat().st_size / 1024
        logger.info(f"✅ Feedback backup created: {dest_file.name} ({file_size_kb:.1f} KB)")

        # Prune old feedback backups
        pruned = prune_old_backups(dest_dir, "feedback_*.json", retention_days)
        if pruned > 0:
            logger.info(f"   Pruned {pruned} old feedback backup(s) (retention: {retention_days} days).")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to backup feedback: {e}")
        return False


def backup_system_state(data_dir: Path, retention_days: int) -> bool:
    """Bundles Metabase DB and sync watermarks into a compressed tarball."""
    dest_dir = data_dir / 'backups' / 'system'
    dest_dir.mkdir(parents=True, exist_ok=True)

    metabase_db = data_dir / 'metabase.db.mv.db'
    metabase_trace = data_dir / 'metabase.db.trace.db'
    watermark = data_dir / 'watermark_proficio.json'

    files_to_pack = []
    if metabase_db.exists():
        files_to_pack.append(metabase_db)
    else:
        logger.warning(f"Metabase database not found at {metabase_db}")

    if metabase_trace.exists():
        files_to_pack.append(metabase_trace)

    if watermark.exists():
        files_to_pack.append(watermark)

    if not files_to_pack:
        logger.warning("No system state files found to back up.")
        return False

    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    tar_path = dest_dir / f"state_{timestamp}.tar.gz"

    try:
        logger.info(f"📦 Compressing system state files into {tar_path.name}...")
        with tarfile.open(tar_path, "w:gz") as tar:
            for file_path in files_to_pack:
                tar.add(file_path, arcname=file_path.name)

        compressed_size_mb = tar_path.stat().st_size / (1024 * 1024)
        logger.info(f"✅ System state backup created: {tar_path.name} ({compressed_size_mb:.2f} MB)")

        # Prune old system state backups
        pruned = prune_old_backups(dest_dir, "state_*.tar.gz", retention_days)
        if pruned > 0:
            logger.info(f"   Pruned {pruned} old system backup(s) (retention: {retention_days} days).")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to create system state backup: {e}")
        return False


def run_backup(target: str = 'all', system_retention: int = 14, feedback_retention: int = 30) -> bool:
    """Executes state backup with configurable target and retention."""
    data_dir = resolve_data_dir()
    logger.info(f"Starting state backup (target: {target}, data_dir: {data_dir})")

    success = True
    if target in ('all', 'feedback'):
        fb_ok = backup_feedback(data_dir, feedback_retention)
        success = success and fb_ok

    if target in ('all', 'system'):
        sys_ok = backup_system_state(data_dir, system_retention)
        success = success and sys_ok

    if success:
        logger.info("🎉 All requested state backups completed successfully.")
    else:
        logger.warning("⚠️ State backup completed with warnings or missing files.")

    return success


def main():
    parser = argparse.ArgumentParser(description="Backup state files for Wolfsonian Lakehouse.")
    parser.add_argument(
        '--target',
        choices=['all', 'feedback', 'system'],
        default='all',
        help="Which state components to back up (default: all)"
    )
    parser.add_argument(
        '--system-retention',
        type=int,
        default=14,
        help="Days to retain system state archives (default: 14)"
    )
    parser.add_argument(
        '--feedback-retention',
        type=int,
        default=30,
        help="Days to retain feedback JSON archives (default: 30)"
    )
    args = parser.parse_args()

    success = run_backup(
        target=args.target,
        system_retention=args.system_retention,
        feedback_retention=args.feedback_retention
    )
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
