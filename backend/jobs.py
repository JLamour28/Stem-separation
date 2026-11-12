"""In-memory job registry and a single background worker thread that runs separations."""
from __future__ import annotations

import logging
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .separator import JobCancelled, StemSeparator
from .storage import STEM_NAMES, read_meta, stems_complete

log = logging.getLogger("stems.jobs")

ACTIVE_STATUSES = ("queued", "loading_model", "running")


@dataclass
class Job:
    id: str
    source_name: str
    quality: str
    model: str
    input_path: Path
    out_dir: Path
    status: str = "queued"
    progress: float = 0.0
    stage: str = "queued"
    error: Optional[str] = None
    cached: bool = False
    cancel_requested: bool = False
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    meta: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        elapsed = None
        if self.started_at is not None:
            elapsed = round((self.finished_at or time.time()) - self.started_at, 1)
        return {
            "id": self.id,
            "status": self.status,
            "progress": round(self.progress, 4),
            "stage": self.stage,
            "error": self.error,
            "source_name": self.source_name,
            "quality": self.quality,
            "model": self.model,
            "cached": self.cached,
            "stems": list(STEM_NAMES) if self.status == "done" else [],
            "duration": self.meta.get("duration_sec"),
            "elapsed_sec": elapsed,
            "seconds_taken": self.meta.get("seconds_taken"),
            "created_at": self.created_at,
        }


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._queue: "queue.Queue[Job]" = queue.Queue()
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self.separator = StemSeparator()

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._worker, name="separation-worker", daemon=True)
            self._thread.start()

    def create(self, source_name: str, quality: str, model: str, input_path: Path, out_dir: Path) -> Job:
        job = Job(
            id=uuid.uuid4().hex[:12],
            source_name=source_name,
            quality=quality,
            model=model,
            input_path=input_path,
            out_dir=out_dir,
        )
        meta = read_meta(out_dir)
        if meta and stems_complete(out_dir):
            job.status, job.stage, job.progress = "done", "done", 1.0
            job.cached = True
            job.meta = meta
            job.finished_at = time.time()
            log.info("Cache hit for %r (%s)", source_name, out_dir.name)
        with self._lock:
            self._jobs[job.id] = job
        if not job.cached:
            self._queue.put(job)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> Optional[Job]:
        job = self.get(job_id)
        if job is None:
            return None
        if job.status in ACTIVE_STATUSES:
            job.cancel_requested = True
            if job.status == "queued":
                job.status, job.stage = "cancelled", "cancelled"
                job.finished_at = time.time()
        return job

    def queue_position(self, job: Job) -> int:
        with self._lock:
            ahead = [
                j for j in self._jobs.values() if j.status == "queued" and j.created_at < job.created_at
            ]
        return len(ahead)

    def _worker(self) -> None:
        while True:
            job = self._queue.get()
            try:
                if job.cancel_requested or job.status == "cancelled":
                    job.status, job.stage = "cancelled", "cancelled"
                    continue
                # Same song may have been finished by an earlier queued job.
                meta = read_meta(job.out_dir)
                if meta and stems_complete(job.out_dir):
                    job.meta = meta
                    job.cached = True
                    job.status, job.stage, job.progress = "done", "done", 1.0
                    continue
                job.status, job.stage = "running", "running"
                job.started_at = time.time()

                def progress(frac: float, stage: str, _job: Job = job) -> None:
                    _job.progress = frac
                    _job.stage = stage
                    if stage in ("loading_model", "running"):
                        _job.status = stage

                def should_cancel(_job: Job = job) -> bool:
                    return _job.cancel_requested

                job.meta = self.separator.separate(
                    input_path=job.input_path,
                    model=job.model,
                    out_dir=job.out_dir,
                    source_name=job.source_name,
                    quality=job.quality,
                    progress=progress,
                    should_cancel=should_cancel,
                )
                job.status, job.stage, job.progress = "done", "done", 1.0
            except JobCancelled:
                job.status, job.stage = "cancelled", "cancelled"
                log.info("Job %s cancelled", job.id)
            except Exception as exc:  # noqa: BLE001 - surface anything to the UI
                job.status, job.stage = "error", "error"
                job.error = f"{type(exc).__name__}: {exc}"
                log.exception("Job %s failed", job.id)
            finally:
                job.finished_at = time.time()
                self._queue.task_done()
