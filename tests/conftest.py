"""Shared test configuration and fixtures for Wolfsonian Lakehouse tests."""

import os
import sys
from pathlib import Path
import pytest

# Ensure etl-pipelines directory is in Python path for test discovery
REPO_ROOT = Path(__file__).resolve().parent.parent
ETL_DIR = REPO_ROOT / 'etl-pipelines'

if str(ETL_DIR) not in sys.path:
    sys.path.insert(0, str(ETL_DIR))


@pytest.fixture
def sample_relator_strings():
    """Provides sample relator strings representing library and museum creators."""
    return {
        'single_designer': 'relators:dsr:person:Christopher Dresser',
        'author_publisher': 'relators:aut:person:John Ruskin | relators:pbl:person:George Allen',
        'coalesced_roles': 'relators:dsr:person:Christopher Dresser | relators:aut:person:Christopher Dresser',
        'mixed_relators_and_plain': 'relators:art:person:Alphonse Mucha | F. Champenois',
        'with_alias': 'relators:mkr:person:wiener werkstaette',
    }


@pytest.fixture
def sample_dates():
    """Provides sample raw dates representing common catalog formats."""
    return {
        'exact_year': '1925',
        'approximate': 'c. 1930',
        'range': '1914-1918',
        'circa_bracketed': '[circa 1895]',
        'century_only': '20th century',
        'invalid': 'undated',
    }
