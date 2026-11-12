"""Thin wrapper around demucs.api.Separator with progress reporting and cancellation."""
from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Callable, Optional

import torch
import demucs
import demucs.api

from .storage import STEM_NAMES, write_meta

log = logging.getLogger("stems.separator")

# Quality presets map to Demucs models. htdemucs is the model DJ.Studio documents for its 4-stem mode.
QUALITY_MODELS = {
    "standard": "htdemucs",  # Hybrid Transformer Demucs, single model
    "high": "htdemucs_ft",  # bag of 4 fine-tuned models, about 4x slower, slightly better
}
DEMUCS_TO_APP = {"drums": "drums", "bass": "bass", "other": "melody", "vocals": "vocals"}
SHIFTS = 1  # Demucs default. More shifts multiply CPU time.

torch.set_num_threads(max(1, os.cpu_count() or 1))

ProgressFn = Callable[[float, str], None]


class JobCancelled(Exception):
    """Raised from inside the Demucs callback to abort a separation."""


class StemSeparator:
    """Holds one loaded Separator per model name. Separations run one at a time."""

    def __init__(self) -> None:
        self._separators: dict[str, demucs.api.Separator] = {}
        self._lock = threading.Lock()

    @property
    def loaded_models(self) -> list[str]:
        return sorted(self._separators)

    def get(self, model: str, on_loading: Optional[Callable[[], None]] = None) -> demucs.api.Separator:
        with self._lock:
            sep = self._separators.get(model)
            if sep is None:
                if on_loading:
                    on_loading()
                t0 = time.time()
                log.info("Loading Demucs model %r (the first time downloads the weights)", model)
                sep = demucs.api.Separator(
                    model=model, device="cpu", shifts=SHIFTS, overlap=0.25, jobs=0, progress=False
                )
                log.info("Model %r ready in %.1fs", model, time.time() - t0)
                self._separators[model] = sep
            return sep

    def separate(
        self,
        input_path: Path,
        model: str,
        out_dir: Path,
        source_name: str,
        quality: str,
        progress: ProgressFn,
        should_cancel: Callable[[], bool],
    ) -> dict:
        sep = self.get(model, on_loading=lambda: progress(0.0, "loading_model"))

        def callback(info: dict) -> None:
            if should_cancel():
                raise JobCancelled()
            models = max(1, int(info.get("models", 1)))
            audio_length = max(1, int(info.get("audio_length", 1)))
            offset = int(info.get("segment_offset", 0))
            if info.get("state") == "end":
                # The callback reports a chunk's start offset. Count the chunk as finished at "end".
                offset = min(audio_length, offset + int(sep.model.samplerate * _segment_seconds(sep)))
            frac = (
                int(info.get("model_idx_in_bag", 0)) * SHIFTS
                + int(info.get("shift_idx", 0))
                + offset / audio_length
            ) / (models * SHIFTS)
            progress(min(0.99, max(0.0, frac)), "running")

        sep.update_parameter(callback=callback, callback_arg={})
        progress(0.0, "running")
        if should_cancel():
            raise JobCancelled()
        t0 = time.time()
        try:
            origin, separated = sep.separate_audio_file(Path(input_path))
        finally:
            sep.update_parameter(callback=None, callback_arg={})

        sr = sep.samplerate
        out_dir.mkdir(parents=True, exist_ok=True)
        for demucs_name, wav in separated.items():
            app_name = DEMUCS_TO_APP.get(demucs_name, demucs_name)
            demucs.api.save_audio(wav, str(out_dir / f"{app_name}.wav"), samplerate=sr, bits_per_sample=16)

        # Instrumental is everything except vocals, like DJ.Studio's "Save as instrumental".
        instrumental = None
        for name in ("drums", "bass", "other"):
            if name in separated:
                instrumental = separated[name] if instrumental is None else instrumental + separated[name]
        if instrumental is not None:
            demucs.api.save_audio(
                instrumental, str(out_dir / "instrumental.wav"), samplerate=sr, bits_per_sample=16
            )

        duration = origin.shape[-1] / sr
        meta = {
            "source_name": source_name,
            "model": model,
            "quality": quality,
            "samplerate": int(sr),
            "channels": int(origin.shape[0]),
            "duration_sec": round(float(duration), 3),
            "stems": list(STEM_NAMES),
            "seconds_taken": round(time.time() - t0, 1),
            "created_at": time.time(),
            "demucs_version": getattr(demucs, "__version__", "unknown"),
            "torch_version": torch.__version__,
        }
        write_meta(out_dir, meta)
        log.info(
            "Separated %r with %s in %.1fs (%.1fs of audio)", source_name, model, meta["seconds_taken"], duration
        )
        progress(1.0, "done")
        return meta


def _segment_seconds(sep: "demucs.api.Separator") -> float:
    """Segment length the model splits audio into (htdemucs uses 7.8 s)."""
    model = sep.model
    seg = getattr(model, "segment", None)
    if seg is None and hasattr(model, "models") and model.models:
        seg = getattr(model.models[0], "segment", None)
    try:
        return float(seg) if seg is not None else 7.8
    except (TypeError, ValueError):
        return 7.8
