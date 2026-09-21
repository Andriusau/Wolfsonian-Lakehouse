"""Unit tests for backup_state.py pruning and backup routines."""

import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

# Ensure etl-pipelines is importable
ETL_DIR = Path(__file__).resolve().parent.parent / 'etl-pipelines'
if str(ETL_DIR) not in sys.path:
    sys.path.insert(0, str(ETL_DIR))

from backup_state import prune_old_backups, backup_feedback, backup_system_state


class TestBackupRoutines(unittest.TestCase):
    """Tests for backup creation and retention pruning."""

    def test_prune_old_backups(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            recent_file = tmp_path / "feedback_20260921_120000.json"
            recent_file.write_text('{"status": "ok"}')

            old_file = tmp_path / "feedback_20260801_120000.json"
            old_file.write_text('{"status": "old"}')

            # Set mtime on old_file to 40 days ago
            forty_days_ago = time.time() - (40 * 86400)
            os.utime(old_file, (forty_days_ago, forty_days_ago))

            # Prune with 30-day retention
            pruned_count = prune_old_backups(tmp_path, "feedback_*.json", retention_days=30)
            self.assertEqual(pruned_count, 1)
            self.assertTrue(recent_file.exists())
            self.assertFalse(old_file.exists())

    def test_backup_feedback(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            feedback_dir = tmp_path / 'feedback'
            feedback_dir.mkdir()
            feedback_file = feedback_dir / 'feature_requests.json'
            sample_data = [{"id": "feat_1", "title": "Test Proposal"}]
            feedback_file.write_text(json.dumps(sample_data))

            success = backup_feedback(tmp_path, retention_days=30)
            self.assertTrue(success)

            backups = list((tmp_path / 'backups' / 'feedback').glob('feedback_*.json'))
            self.assertEqual(len(backups), 1)
            content = json.loads(backups[0].read_text())
            self.assertEqual(content[0]['title'], "Test Proposal")

    def test_backup_system_state(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            metabase_file = tmp_path / 'metabase.db.mv.db'
            metabase_file.write_text("dummy database content")
            watermark_file = tmp_path / 'watermark_proficio.json'
            watermark_file.write_text('{"high_watermark": "2026-09-21"}')

            success = backup_system_state(tmp_path, retention_days=14)
            self.assertTrue(success)

            backups = list((tmp_path / 'backups' / 'system').glob('state_*.tar.gz'))
            self.assertEqual(len(backups), 1)
            self.assertGreater(backups[0].stat().st_size, 0)


if __name__ == '__main__':
    unittest.main()
