"""Unit tests for Gold Layer normalizers in export_gold_normalized.py."""

import unittest
from pathlib import Path
import sys

# Ensure etl-pipelines is importable
ETL_DIR = Path(__file__).resolve().parent.parent / 'etl-pipelines'
if str(ETL_DIR) not in sys.path:
    sys.path.insert(0, str(ETL_DIR))

import pandas as pd
from export_gold_normalized import (
    normalize_genre,
    normalize_subject,
    append_style_to_subject,
    extract_year,
    year_to_decade,
    clean_creator_name,
    normalize_creator,
    normalize_creators_with_roles,
    extract_creator_roles,
    normalize_title,
    normalize_place_published,
)


class TestGenreNormalization(unittest.TestCase):
    """Tests for normalize_genre."""

    def test_uppercase_and_trim(self):
        self.assertEqual(normalize_genre('poster'), 'POSTER')
        self.assertEqual(normalize_genre('  POSTER  '), 'POSTER')

    def test_strip_trailing_punctuation(self):
        self.assertEqual(normalize_genre('POSTER.'), 'POSTER')
        self.assertEqual(normalize_genre('PRINT;'), 'PRINT')
        self.assertEqual(normalize_genre('BOOK:'), 'BOOKS')

    def test_synonym_mappings(self):
        self.assertEqual(normalize_genre('PHOTO'), 'PHOTOGRAPH')
        self.assertEqual(normalize_genre('NEGATIVE'), 'PHOTOGRAPH')
        self.assertEqual(normalize_genre('DRAWINGS'), 'DRAWING')
        self.assertEqual(normalize_genre('POST CARD'), 'POSTCARD')
        self.assertEqual(normalize_genre('STATUE'), 'SCULPTURE')
        self.assertEqual(normalize_genre('TEXTILES'), 'TEXTILE')

    def test_null_and_empty_handling(self):
        self.assertTrue(pd.isna(normalize_genre(None)))
        self.assertTrue(pd.isna(normalize_genre('')))
        self.assertTrue(pd.isna(normalize_genre('   ')))
        self.assertTrue(pd.isna(normalize_genre('none')))
        self.assertTrue(pd.isna(normalize_genre(pd.NA)))


class TestSubjectAndStyleNormalization(unittest.TestCase):
    """Tests for normalize_subject and append_style_to_subject."""

    def test_normalize_subject_pipe_split(self):
        result = normalize_subject('Art Deco | Architecture. | Posters')
        self.assertEqual(result, 'Art Deco | Architecture | Posters')

    def test_normalize_subject_strip_prefix(self):
        result = normalize_subject('subject: World War I | SUBJECT: Propaganda')
        self.assertEqual(result, 'World War I | Propaganda')

    def test_normalize_subject_empty(self):
        self.assertTrue(pd.isna(normalize_subject(None)))
        self.assertTrue(pd.isna(normalize_subject('')))
        self.assertTrue(pd.isna(normalize_subject('none')))

    def test_append_style_to_subject_merge(self):
        result = append_style_to_subject('Propaganda | Posters', 'Art Deco')
        self.assertEqual(result, 'Propaganda | Posters | Art Deco')

    def test_append_style_to_subject_avoids_duplicate(self):
        result = append_style_to_subject('Art Deco | Posters', 'Art Deco')
        self.assertEqual(result, 'Art Deco | Posters')

    def test_append_style_to_subject_when_subject_na(self):
        self.assertEqual(append_style_to_subject(pd.NA, 'Bauhaus'), 'Bauhaus')
        self.assertEqual(append_style_to_subject(None, 'Bauhaus'), 'Bauhaus')

    def test_append_style_to_subject_when_style_na(self):
        self.assertEqual(append_style_to_subject('Posters', pd.NA), 'Posters')
        self.assertEqual(append_style_to_subject('Posters', None), 'Posters')


class TestDateNormalization(unittest.TestCase):
    """Tests for extract_year and year_to_decade."""

    def test_extract_year_exact(self):
        self.assertEqual(extract_year('1925'), 1925)
        self.assertEqual(extract_year(1930), 1930)

    def test_extract_year_circa(self):
        self.assertEqual(extract_year('c. 1935'), 1935)
        self.assertEqual(extract_year('[circa 1890]'), 1890)
        self.assertEqual(extract_year('ca. 1904-1906'), 1904)

    def test_extract_year_invalid(self):
        self.assertTrue(pd.isna(extract_year('undated')))
        self.assertTrue(pd.isna(extract_year('unknown')))
        self.assertTrue(pd.isna(extract_year(None)))
        self.assertTrue(pd.isna(extract_year(pd.NA)))

    def test_year_to_decade(self):
        self.assertEqual(year_to_decade(1935), 1930)
        self.assertEqual(year_to_decade(1900), 1900)
        self.assertEqual(year_to_decade(1889), 1880)
        self.assertEqual(year_to_decade(2026), 2020)
        self.assertTrue(pd.isna(year_to_decade(pd.NA)))


class TestCreatorAndRelatorNormalization(unittest.TestCase):
    """Tests for creator parsing, relator extraction, and role coalescing."""

    def test_clean_creator_name(self):
        self.assertEqual(clean_creator_name('Smith, John.'), 'Smith, John')
        self.assertEqual(clean_creator_name('Dresser, Christopher;'), 'Dresser, Christopher')
        self.assertEqual(clean_creator_name('wiener werkstaette'), 'Wiener Werkstätte')
        self.assertEqual(clean_creator_name('josef grof'), 'József Gróf')

    def test_normalize_creator_metabase_clean(self):
        raw = 'relators:dsr:person:Christopher Dresser | relators:mkr:person:Coalbrookdale Co'
        self.assertEqual(normalize_creator(raw), 'Christopher Dresser | Coalbrookdale Co')

    def test_normalize_creator_plain_strings(self):
        raw = 'Alphonse Mucha | F. Champenois'
        self.assertEqual(normalize_creator(raw), 'Alphonse Mucha | F. Champenois')

    def test_normalize_creator_deduplication(self):
        raw = 'relators:dsr:person:Christopher Dresser | relators:aut:person:Christopher Dresser'
        self.assertEqual(normalize_creator(raw), 'Christopher Dresser')

    def test_normalize_creators_with_roles_coalescing(self):
        raw = 'relators:dsr:person:Christopher Dresser | relators:aut:person:Christopher Dresser'
        expected = 'Christopher Dresser (Designer, Author)'
        self.assertEqual(normalize_creators_with_roles(raw), expected)

    def test_normalize_creators_with_roles_multiple_people(self):
        raw = 'relators:art:person:John Ruskin | relators:pbl:person:George Allen'
        expected = 'John Ruskin (Artist) | George Allen (Publisher)'
        self.assertEqual(normalize_creators_with_roles(raw), expected)

    def test_extract_creator_roles(self):
        raw = 'relators:dsr:person:Christopher Dresser | relators:pbl:person:George Allen'
        result = extract_creator_roles(raw)
        self.assertIn('Designer', result)
        self.assertIn('Publisher', result)

    def test_null_creator_handling(self):
        self.assertTrue(pd.isna(normalize_creator(None)))
        self.assertTrue(pd.isna(normalize_creators_with_roles('')))
        self.assertTrue(pd.isna(extract_creator_roles(pd.NA)))


class TestTitleAndPlaceNormalization(unittest.TestCase):
    """Tests for normalize_title and normalize_place_published."""

    def test_normalize_title_strips_trailing_period(self):
        self.assertEqual(normalize_title('The Great Exhibition.'), 'The Great Exhibition')
        self.assertEqual(normalize_title('Paris 1900...'), 'Paris 1900')

    def test_normalize_title_preserves_clean(self):
        self.assertEqual(normalize_title('Metropolis'), 'Metropolis')

    def test_normalize_title_empty(self):
        self.assertTrue(pd.isna(normalize_title(None)))
        self.assertTrue(pd.isna(normalize_title('')))

    def test_normalize_place_published_cleaning(self):
        self.assertEqual(normalize_place_published('[Paris]'), 'Paris')
        self.assertEqual(normalize_place_published('London :'), 'London')
        self.assertEqual(normalize_place_published('Berlin, Germany.'), 'Berlin, Germany')

    def test_normalize_place_published_unknown(self):
        self.assertEqual(normalize_place_published('[Place of publication not identified]'), 'Unknown')
        self.assertEqual(normalize_place_published('[S.l.]'), 'Unknown')


if __name__ == '__main__':
    unittest.main()
