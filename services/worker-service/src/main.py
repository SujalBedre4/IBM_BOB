from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr, validator
from typing import Optional
import os
import logging

logger = logging.getLogger(__name__)
app = FastAPI(title="worker-service", version="1.4.2")


class JobRequest(BaseModel):
    job_type: str
    payload: dict
    priority: int = 5

    @validator('priority')
    def priority_must_be_valid(cls, v: int) -> int:
        if not 1 <= v <= 10:
            raise ValueError('priority must be between 1 and 10')
        return v

    @validator('job_type')
    def job_type_must_be_allowed(cls, v: str) -> str:
        allowed = {'email', 'report', 'export', 'notification'}
        if v not in allowed:
            raise ValueError(f'job_type must be one of {allowed}')
        return v


class JobResponse(BaseModel):
    job_id: str
    status: str
    estimated_seconds: int


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "worker-service"}


@app.post("/jobs", response_model=JobResponse)
async def enqueue_job(job: JobRequest, x_api_key: Optional[str] = Header(None)):
    """Enqueue an async job to the Celery worker."""
    api_key = os.environ.get("INTERNAL_API_KEY")
    if not api_key or x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    # In production: task = celery_app.send_task(job.job_type, kwargs=job.payload)
    job_id = f"job_{job.job_type}_{hash(str(job.payload)) & 0xFFFF:04x}"
    logger.info("Enqueued job type=%s id=%s priority=%d", job.job_type, job_id, job.priority)

    return JobResponse(
        job_id=job_id,
        status="queued",
        estimated_seconds={"email": 5, "report": 60, "export": 120, "notification": 3}[job.job_type]
    )


def sanitize_filename(name: str) -> str:
    """
    Sanitize a user-supplied filename to prevent path traversal.
    Returns only the basename with safe characters.
    """
    import os
    import re
    basename = os.path.basename(name)
    safe = re.sub(r'[^a-zA-Z0-9._-]', '_', basename)
    if not safe or safe.startswith('.'):
        raise ValueError(f'Invalid filename: {name!r}')
    return safe


def calculate_priority_score(urgency: int, size_bytes: int, vip: bool) -> float:
    """
    Calculate a composite job priority score.
    urgency: 1–10, size_bytes: file size, vip: whether the requester is VIP
    Returns a float score from 0.0 to 100.0.
    """
    if not 1 <= urgency <= 10:
        raise ValueError(f'urgency must be 1–10, got {urgency}')
    if size_bytes < 0:
        raise ValueError(f'size_bytes cannot be negative, got {size_bytes}')

    base = urgency * 10.0
    size_penalty = min(size_bytes / 1_000_000, 20.0)  # up to -20 for large files
    vip_bonus = 15.0 if vip else 0.0
    return round(min(100.0, base - size_penalty + vip_bonus), 2)
