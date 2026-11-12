# Stem Separator

A local app that splits a song into four stems: **Drums, Bass, Melody and Vocals**.
It is modelled on DJ.Studio's stem system, which uses the same open-source
[Demucs](https://github.com/adefossez/demucs) htdemucs model (MIT licence).

Everything runs on your own computer. Songs are never uploaded anywhere.

## Features

- Drag and drop an MP3, WAV, FLAC, OGG or M4A file.
- Two quality modes:
  - **Standard** uses `htdemucs`. It is the recommended mode.
  - **High** uses `htdemucs_ft`, a bag of four fine-tuned models. It is about four times slower and slightly cleaner.
- Live progress bar, with cancel.
- Stem player with one coloured lane per stem, styled after DJ.Studio:
  drums green, bass yellow, melody red, vocals blue.
  - Each lane has mute (M), solo (S) and volume controls, plus its own waveform.
  - Play, pause and stop. Click a waveform to seek. The space bar toggles play.
- Exports: each stem as WAV, all stems as a zip, **Save as instrumental**
  (drums, bass and melody mixed) and **Save as acapella** (vocals).
- Results are cached. Uploading the same song again opens it instantly.

## Requirements

- Windows 10 or 11
- Python 3.10 (the `py` launcher must find it)
- Node.js 18 or newer
- About 3 GB of disk space for PyTorch, and 8 GB of RAM or more

No GPU and no ffmpeg are needed. MP3 and other formats are decoded by `sphn`, which ships with Demucs.

## Setup (once)

Double-click `setup.bat`, or run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

This creates `.venv`, installs the CPU build of PyTorch and Demucs, and builds the web UI.

## Run

Double-click `run.bat`. It starts the server on http://127.0.0.1:8000 and opens your browser.
Press Ctrl+C in the window to stop it.

The first separation downloads the model weights once from Hugging Face. Standard needs about 80 MB and
High about 320 MB.

## Speed

Measured on an Intel Core i5-1135G7 laptop CPU with 16 GB of RAM:

| Song | Mode | Separation time |
| --- | --- | --- |
| 15 s test clip | Standard | 11 s |
| 15 s test clip | High | 47 s |
| 3 min 45 s song (MP3) | Standard | 2 min 18 s |

High quality takes about four times as long as Standard, so a typical song takes around nine minutes.
Loading a model the first time adds a one-off download: about 20 s for Standard and 75 s for High.

## Where files live

| Path | Contents |
| --- | --- |
| `data/uploads/` | Uploaded songs, named by content hash |
| `data/stems/<hash>-<model>/` | `drums.wav`, `bass.wav`, `melody.wav`, `vocals.wav`, `instrumental.wav`, `meta.json` |
| `%USERPROFILE%\.cache\huggingface\` | Downloaded model weights |

To clear the cache, stop the app and delete the `data` folder.

## Development

Run the API with auto-reload and the Vite dev server with hot reload:

```powershell
.venv\Scripts\python -m uvicorn backend.app:app --reload --port 8000
cd frontend; npm run dev
```

Then open http://localhost:5173. Vite proxies `/api` to port 8000.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/jobs` | Multipart `file` plus `quality` (`standard` or `high`). Returns `job_id`. |
| GET | `/api/jobs/{id}` | Status, progress from 0 to 1, stage and error |
| DELETE | `/api/jobs/{id}` | Cancel a queued or running job |
| GET | `/api/jobs/{id}/stems/{drums,bass,melody,vocals}.wav` | One stem |
| GET | `/api/jobs/{id}/download/{all.zip,instrumental.wav,acapella.wav}` | Exports |
| GET | `/api/health` | Torch version, thread count and loaded models |

### Layout

```
backend/   FastAPI app, job queue and Demucs wrapper
frontend/  React and TypeScript UI with a Web Audio stem player
scripts/   setup.ps1 and run.ps1
```

## Credits

- Demucs by Alexandre Défossez and Meta AI Research, MIT licence.
- Stem naming, colours and workflow follow DJ.Studio's public documentation.
