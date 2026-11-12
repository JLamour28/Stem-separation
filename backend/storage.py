"""Paths, upload hashing helpers and on-disk stem cache layout."""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
STEMS_DIR = DATA_DIR / "stems"
FRONTEND_DIST = ROOT / "frontend" / "dist"

# Order and naming follow DJ.Studio's lanes. Demucs calls "melody" "other".
STEM_NAMES = ("drums", "bass", "melody", "vocals")
STEM_LABELS = {"drums": "Drums", "bass": "Bass", "melody": "Melody", "vocals": "Vocals"}

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024

_UNSAFE = re.compile(r"[^A-Za-z0-9 _.\-()\[\]&',]+")


def ensure_dirs() -> None:
    for d in (UPLOAD_DIR, STEMS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def safe_stem(filename: str) -> str:
    """Return a filesystem-safe song name (without extension) for export filenames."""
    name = Path(filename or "song").stem
    name = _UNSAFE.sub("_", name).strip(" ._") or "song"
    return name[:120]


def cache_key(file_hash: str, model: str) -> str:
    return f"{file_hash}-{model}"


def stems_dir_for(key: str) -> Path:
    return STEMS_DIR / key


def meta_path(out_dir: Path) -> Path:
    return out_dir / "meta.json"


def read_meta(out_dir: Path) -> Optional[dict]:
    p = meta_path(out_dir)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_meta(out_dir: Path, meta: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_path(out_dir).write_text(json.dumps(meta, indent=2), encoding="utf-8")


def stems_complete(out_dir: Path) -> bool:
    return all((out_dir / f"{name}.wav").exists() for name in STEM_NAMES) and (
        out_dir / "instrumental.wav"
    ).exists()


def build_zip(out_dir: Path, song_name: str) -> Path:
    """Zip the four stems (built once, then cached next to them)."""
    zip_path = out_dir / "stems.zip"
    if zip_path.exists():
        return zip_path
    tmp = out_dir / "stems.zip.part"
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        for name in STEM_NAMES:
            zf.write(out_dir / f"{name}.wav", f"{song_name} - {STEM_LABELS[name]}.wav")
    tmp.replace(zip_path)
    return zip_path
