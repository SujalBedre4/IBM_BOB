import pytest
from src.main import sanitize_filename

# Existing test — minimal coverage, only covers happy path
def test_sanitize_filename_basic():
    assert sanitize_filename("report.pdf") == "report.pdf"
