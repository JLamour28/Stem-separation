"""FastAPI app: upload a song, poll the job, fetch stems, download exports, serve the UI."""
from __future__ import annotations

import hashlib
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .jobs import Job, JobManager
from .separator import QUALITY_MODELS
from .storage import (
    ALLOWED_EXTENSIONS,
    FRONTEND_DIST,
    MAX_UPLOAD_BYTES,
    STEM_LABELS,
    STEM_NAMES,
    UPLOAD_DIR,
    build_zip,
    cache_key,
    ensure_dirs,
    safe_stem,
    stems_dir_for,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("stems.app")

manager = JobManager()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
    manager.start()
    log.info("Stem separator ready (torch %s, cpu threads %d)", torch.__version__, torch.get_num_threads())
    yield


app = FastAPI(title="Stem Separator", version="0.1.0", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "torch": torch.__version__,
        "device": "cpu",
        "threads": torch.get_num_threads(),
        "loaded_models": manager.separator.loaded_models,
        "qualities": QUALITY_MODELS,
    }


@app.post("/api/jobs")
async def create_job(file: UploadFile = File(...), quality: str = Form("standard")) -> dict:
    if quality not in QUALITY_MODELS:
        raise HTTPException(400, f"Unknown quality {quality!r}. Use one of {sorted(QUALITY_MODELS)}.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400, f"Unsupported file type {ext or '(none)'}. Use one of {sorted(ALLOWED_EXTENSIONS)}."
        )

    ensure_dirs()
    tmp = UPLOAD_DIR / f".upload-{uuid.uuid4().hex}.part"
    hasher = hashlib.sha256()
    size = 0
    try:
        with tmp.open("wb") as fh:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
                hasher.update(chunk)
                fh.write(chunk)
        if size == 0:
            raise HTTPException(400, "Empty file")
        digest = hasher.hexdigest()[:16]
        final = UPLOAD_DIR / f"{digest}{ext}"
        if final.exists():
            tmp.unlink()
        else:
            tmp.replace(final)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise

    model = QUALITY_MODELS[quality]
    out_dir = stems_dir_for(cache_key(digest, model))
    job = manager.create(
        source_name=safe_stem(file.filename or "song"),
        quality=quality,
        model=model,
        input_path=final,
        out_dir=out_dir,
    )
    log.info(
        "Job %s created for %r (%s, %.1f MB, cached=%s)", job.id, job.source_name, model, size / 1e6, job.cached
    )
    return {"job_id": job.id, "cached": job.cached}


def _get_job(job_id: str) -> Job:
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


def _require_done(job: Job) -> None:
    if job.status != "done":
        raise HTTPException(409, f"Job is {job.status}, stems are not available")


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = _get_job(job_id)
    data = job.to_dict()
    if job.status == "queued":
        data["queue_position"] = manager.queue_position(job)
    return data


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str) -> dict:
    job = manager.cancel(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return {"id": job.id, "status": job.status, "cancel_requested": job.cancel_requested}


@app.get("/api/jobs/{job_id}/stems/{filename}")
def get_stem(job_id: str, filename: str) -> FileResponse:
    job = _get_job(job_id)
    _require_done(job)
    stem = filename[:-4] if filename.lower().endswith(".wav") else filename
    if stem not in STEM_NAMES:
        raise HTTPException(404, f"Unknown stem {stem!r}")
    path = job.out_dir / f"{stem}.wav"
    if not path.exists():
        raise HTTPException(404, "Stem file missing")
    return FileResponse(path, media_type="audio/wav", filename=f"{job.source_name} - {STEM_LABELS[stem]}.wav")


@app.get("/api/jobs/{job_id}/download/{kind}")
def download(job_id: str, kind: str) -> FileResponse:
    job = _get_job(job_id)
    _require_done(job)
    if kind == "all.zip":
        path = build_zip(job.out_dir, job.source_name)
        return FileResponse(path, media_type="application/zip", filename=f"{job.source_name} - Stems.zip")
    if kind == "instrumental.wav":
        path = job.out_dir / "instrumental.wav"
        return FileResponse(path, media_type="audio/wav", filename=f"{job.source_name} - Instrumental.wav")
    if kind == "acapella.wav":
        path = job.out_dir / "vocals.wav"
        return FileResponse(path, media_type="audio/wav", filename=f"{job.source_name} - Acapella.wav")
    raise HTTPException(404, "Unknown download. Use all.zip, instrumental.wav or acapella.wav.")


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:

    @app.get("/")
    def no_frontend() -> dict:
        return {
            "message": "Frontend not built. Run setup.bat, or `npm run build` in frontend/, "
            "or start the Vite dev server with `npm run dev`.",
            "api": "/api/health",
        }
