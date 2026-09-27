"""
Tests for worker-service main module.
Covers: sanitize_filename, calculate_priority_score, POST /jobs
"""
import os
import pytest
from fastapi.testclient import TestClient

# Set required env var before importing the app module
os.environ["INTERNAL_API_KEY"] = "test-api-key-abc123"

from src.main import app, sanitize_filename, calculate_priority_score  # noqa: E402

client = TestClient(app)
VALID_API_KEY = "test-api-key-abc123"


# ---------------------------------------------------------------------------
# sanitize_filename
# ---------------------------------------------------------------------------
class TestSanitizeFilename:
    def test_basic_happy_path(self):
        assert sanitize_filename("report.pdf") == "report.pdf"

    def test_path_traversal_stripped(self):
        # basename strips leading path components
        result = sanitize_filename("../../etc/passwd")
        assert "/" not in result
        assert ".." not in result

    def test_path_traversal_windows_style(self):
        # On Linux, os.path.basename does not parse backslashes as separators,
        # so the whole string survives; after re.sub the leading '..' becomes
        # a leading '.', which the hidden-file/traversal guard correctly rejects.
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename("..\\..\\windows\\system32\\calc.exe")

    def test_leading_dot_raises(self):
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename(".hidden")

    def test_empty_string_raises(self):
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename("")

    def test_slash_only_raises(self):
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename("/")

    def test_special_chars_replaced(self):
        result = sanitize_filename("my file (1).txt")
        assert " " not in result
        assert "(" not in result
        assert ")" not in result

    def test_safe_chars_preserved(self):
        result = sanitize_filename("my-file_2024.log")
        assert result == "my-file_2024.log"


# ---------------------------------------------------------------------------
# calculate_priority_score
# ---------------------------------------------------------------------------
class TestCalculatePriorityScore:
    def test_normal_calculation(self):
        score = calculate_priority_score(urgency=5, size_bytes=0, vip=False)
        assert score == 50.0

    def test_vip_bonus_applied(self):
        score = calculate_priority_score(urgency=5, size_bytes=0, vip=True)
        assert score == 65.0

    def test_large_file_penalty(self):
        # 1 000 000 bytes → penalty = 1.0
        score = calculate_priority_score(urgency=5, size_bytes=1_000_000, vip=False)
        assert score == 49.0

    def test_score_capped_at_100(self):
        # urgency=10 + vip → 100 + 15 - 0 → capped at 100
        score = calculate_priority_score(urgency=10, size_bytes=0, vip=True)
        assert score == 100.0

    def test_urgency_zero_raises(self):
        with pytest.raises(ValueError, match="urgency must be 1"):
            calculate_priority_score(urgency=0, size_bytes=0, vip=False)

    def test_urgency_eleven_raises(self):
        with pytest.raises(ValueError, match="urgency must be 1"):
            calculate_priority_score(urgency=11, size_bytes=0, vip=False)

    def test_negative_size_bytes_raises(self):
        with pytest.raises(ValueError, match="size_bytes cannot be negative"):
            calculate_priority_score(urgency=5, size_bytes=-1, vip=False)

    def test_max_size_penalty_capped(self):
        # 100 MB → penalty capped at 20
        score = calculate_priority_score(urgency=5, size_bytes=100_000_000, vip=False)
        assert score == 30.0


# ---------------------------------------------------------------------------
# POST /jobs
# ---------------------------------------------------------------------------
class TestEnqueueJob:
    def _payload(self, job_type="email", priority=5):
        return {"job_type": job_type, "payload": {"to": "test@example.com"}, "priority": priority}

    def test_missing_api_key_returns_401(self):
        res = client.post("/jobs", json=self._payload())
        assert res.status_code == 401

    def test_wrong_api_key_returns_401(self):
        res = client.post("/jobs", json=self._payload(), headers={"x-api-key": "wrong"})
        assert res.status_code == 401

    def test_valid_request_returns_200(self):
        res = client.post("/jobs", json=self._payload(), headers={"x-api-key": VALID_API_KEY})
        assert res.status_code == 200
        assert res.json()["status"] == "queued"
        assert "job_id" in res.json()

    def test_invalid_job_type_returns_422(self):
        payload = self._payload(job_type="unknown_type")
        res = client.post("/jobs", json=payload, headers={"x-api-key": VALID_API_KEY})
        assert res.status_code == 422

    def test_priority_out_of_range_low_returns_422(self):
        payload = self._payload(priority=0)
        res = client.post("/jobs", json=payload, headers={"x-api-key": VALID_API_KEY})
        assert res.status_code == 422

    def test_priority_out_of_range_high_returns_422(self):
        payload = self._payload(priority=11)
        res = client.post("/jobs", json=payload, headers={"x-api-key": VALID_API_KEY})
        assert res.status_code == 422

    def test_all_valid_job_types_accepted(self):
        for jt in ("email", "report", "export", "notification"):
            res = client.post(
                "/jobs",
                json=self._payload(job_type=jt),
                headers={"x-api-key": VALID_API_KEY},
            )
            assert res.status_code == 200, f"job_type={jt} failed: {res.json()}"
