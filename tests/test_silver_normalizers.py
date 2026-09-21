"""Unit tests for Silver Layer normalizers in transform_proficio_silver.py."""

import unittest
from pathlib import Path
import sys

# Ensure etl-pipelines is importable
ETL_DIR = Path(__file__).resolve().parent.parent / 'etl-pipelines'
if str(ETL_DIR) not in sys.path:
    sys.path.insert(0, str(ETL_DIR))

import pandas as pd
from transform_proficio_silver import normalize_identifier, get_record_keys


class TestIdentifierNormalization(unittest.TestCase):
    """Tests for normalize_identifier and record keys."""

    def test_basic_identifier(self):
        self.assertEqual(normalize_identifier('XX1990.123'), 'xx1990.123')
        self.assertEqual(normalize_identifier('xx1990.123.'), 'xx1990.123')

    def test_whitespace_and_punctuation_collapsing(self):
        self.assertEqual(normalize_identifier('XX 1990 - 123'), 'xx.1990.123')
        self.assertEqual(normalize_identifier('XX, 1990, 123'), 'xx.1990.123')
        self.assertEqual(normalize_identifier('XX_1990_123'), 'xx.1990.123')

    def test_bracket_and_parentheses_removal(self):
        self.assertEqual(normalize_identifier('XX(1990)[123]'), 'xx.1990.123')
        self.assertEqual(normalize_identifier("XX'1990'123"), 'xx.1990.123')

    def test_null_handling(self):
        self.assertIsNone(normalize_identifier(None))
        self.assertIsNone(normalize_identifier(pd.NA))

    def test_get_record_keys_from_identifier(self):
        df = pd.DataFrame({
            'field_identifier': ['XX1990.1', 'XX 1990.2', None]
        })
        keys = get_record_keys(df)
        self.assertEqual(keys.iloc[0], 'xx1990.1')
        self.assertEqual(keys.iloc[1], 'xx.1990.2')
        self.assertEqual(keys.iloc[2], '')


if __name__ == '__main__':
    unittest.main()
