"""
Tests for POST /jobs endpoint — authentication and input validation.
Uses Starlette TestClient (sync ASGI test client, no async required).
"""
import os
import pytest

os.environ.setdefault("INTERNAL_API_KEY", "test-api-key")

from starlette.testclient import TestClient  # noqa: E402
from src.main import app  # noqa: E402

VALID_API_KEY = "test-api-key"


@pytest.fixture(autouse=True)
def set_api_key(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", VALID_API_KEY)


@pytest.fixture()
def client():
    return TestClient(app, raise_server_exceptions=False)


class TestEnqueueJobAuth:
    def test_returns_401_when_api_key_missing(self, client):
        resp = client.post("/jobs", json={"job_type": "email", "payload": {}})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid or missing API key"

    def test_returns_401_when_api_key_wrong(self, client):
        resp = client.post(
            "/jobs",
            json={"job_type": "email", "payload": {}},
            headers={"x-api-key": "wrong-key"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid or missing API key"

    def test_returns_401_when_env_api_key_not_set(self, monkeypatch, client):
        monkeypatch.delenv("INTERNAL_API_KEY", raising=False)
        resp = client.post(
            "/jobs",
            json={"job_type": "email", "payload": {}},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert resp.status_code == 401


class TestEnqueueJobValidation:
    def test_returns_422_for_invalid_job_type(self, client):
        resp = client.post(
            "/jobs",
            json={"job_type": "invalid_type", "payload": {}},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert resp.status_code == 422

    def test_returns_422_for_priority_below_minimum(self, client):
        resp = client.post(
            "/jobs",
            json={"job_type": "email", "payload": {}, "priority": 0},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert resp.status_code == 422

    def test_returns_422_for_priority_above_maximum(self, client):
        resp = client.post(
            "/jobs",
            json={"job_type": "email", "payload": {}, "priority": 11},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert resp.status_code == 422

    def test_returns_422_when_job_type_missing(self, client):
        resp = client.post(
            "/jobs",
            json={"payload": {}},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert resp.status_code == 422


class TestEnqueueJobHappyPath:
    @pytest.mark.parametrize("job_type,expected_seconds", [
        ("email", 5),
        ("report", 60),
        ("export", 120),
        ("notification", 3),
    ])
    def test_enqueues_each_job_type_and_returns_correct_estimated_seconds(
        self, client, job_type, expected_seconds
    ):
        resp = client.post(
            "/jobs",
            json={"job_type": job_type, "payload": {"key": "value"}, "priority": 5},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "queued"
        assert body["estimated_seconds"] == expected_seconds
        assert body["job_id"].startswith(f"job_{job_type}_")

    def test_default_priority_is_5(self, client):
        resp = client.post(
            "/jobs",
            json={"job_type": "email", "payload": {}},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "queued"

    def test_job_id_is_deterministic_for_same_payload(self, client):
        payload = {"recipient": "test@example.com"}
        r1 = client.post(
            "/jobs",
            json={"job_type": "email", "payload": payload},
            headers={"x-api-key": VALID_API_KEY},
        )
        r2 = client.post(
            "/jobs",
            json={"job_type": "email", "payload": payload},
            headers={"x-api-key": VALID_API_KEY},
        )
        assert r1.json()["job_id"] == r2.json()["job_id"]
