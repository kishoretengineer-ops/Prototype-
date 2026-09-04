import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile

from models.analyze import AnalysisResult

router = APIRouter()

MODEL_ID = os.environ.get("MODEL_ID", "MelodyMachine/Deepfake-audio-detection-V2")
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_SECONDS = 60
TARGET_SAMPLE_RATE = 16_000
ALLOWED_SUFFIXES = {".wav", ".mp3", ".m4a", ".webm"}

_model: Any = None
_feature_extractor: Any = None
_model_lock = asyncio.Lock()


class AudioDecodeError(Exception):
    pass


class ModelUnavailableError(Exception):
    pass


def _decode_audio(path: str) -> tuple[np.ndarray, bool]:
    """Decode, mix down, resample, and cap audio before it reaches the model."""
    try:
        import av
    except ImportError as exc:
        raise ModelUnavailableError("Audio decoding dependencies are not installed yet.") from exc

    samples: list[np.ndarray] = []
    total_samples = 0
    max_samples = MAX_SECONDS * TARGET_SAMPLE_RATE

    try:
        with av.open(path) as container:
            stream = next((item for item in container.streams if item.type == "audio"), None)
            if stream is None:
                raise AudioDecodeError("No audio track was found in this file.")

            resampler = av.AudioResampler(
                format="fltp",
                layout="mono",
                rate=TARGET_SAMPLE_RATE,
            )

            def collect(frames: Any) -> bool:
                nonlocal total_samples
                if not isinstance(frames, list):
                    frames = [frames]
                for output in frames:
                    if output is None or total_samples >= max_samples:
                        break
                    data = output.to_ndarray().astype(np.float32, copy=False).reshape(-1)
                    remaining = max_samples - total_samples
                    data = data[:remaining]
                    if data.size:
                        samples.append(data)
                        total_samples += data.size
                return total_samples >= max_samples

            for frame in container.decode(stream):
                if collect(resampler.resample(frame)):
                    break
            if total_samples < max_samples:
                collect(resampler.resample(None))
    except AudioDecodeError:
        raise
    except Exception as exc:
        raise AudioDecodeError("The audio could not be decoded. Try a different file.") from exc

    if not samples:
        raise AudioDecodeError("The file contains no decodable audio samples.")
    return np.concatenate(samples), total_samples >= max_samples


def _load_model() -> tuple[Any, Any]:
    try:
        import torch
        from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

        token = os.environ.get("HF_TOKEN") or None
        extractor = AutoFeatureExtractor.from_pretrained(MODEL_ID, token=token)
        model = AutoModelForAudioClassification.from_pretrained(
            MODEL_ID,
            token=token,
            trust_remote_code=False,
        )
        device = "cuda" if torch.cuda.is_available() else "cpu"
        return extractor, model.to(device).eval()
    except Exception as exc:
        raise ModelUnavailableError(
            "The analysis model is unavailable or still downloading. Please retry shortly."
        ) from exc


async def _get_model() -> tuple[Any, Any]:
    global _model, _feature_extractor
    if _model is not None and _feature_extractor is not None:
        return _feature_extractor, _model
    async with _model_lock:
        if _model is None or _feature_extractor is None:
            _feature_extractor, _model = await asyncio.to_thread(_load_model)
    return _feature_extractor, _model


def _classification_for(label: str) -> str:
    normalized = label.lower().replace("_", "-")
    if any(marker in normalized for marker in ("fake", "deepfake", "ai", "synthetic")):
        return "AI-generated"
    return "Likely human"


async def _save_upload(upload: UploadFile, path: str) -> int:
    size = 0
    with open(path, "wb") as destination:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Audio files must be 25 MB or smaller.")
            destination.write(chunk)
    return size


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_audio(file: UploadFile = File(...)) -> AnalysisResult:
    file_name = file.filename or "recording.webm"
    suffix = Path(file_name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported format. Upload WAV, MP3, M4A, or WebM audio.",
        )

    temporary_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="verity-voice-", suffix=suffix, delete=False) as temporary:
            temporary_path = temporary.name

        await _save_upload(file, temporary_path)
        audio, truncated = await asyncio.to_thread(_decode_audio, temporary_path)
        extractor, model = await _get_model()

        import torch

        device = next(model.parameters()).device
        inputs = extractor(audio, sampling_rate=TARGET_SAMPLE_RATE, return_tensors="pt")
        inputs = {key: value.to(device) for key, value in inputs.items()}
        with torch.inference_mode():
            probabilities = torch.softmax(model(**inputs).logits, dim=-1)[0].cpu().tolist()

        labels = [model.config.id2label.get(index, str(index)) for index in range(len(probabilities))]
        winning_index = int(np.argmax(probabilities))
        return AnalysisResult(
            classification=_classification_for(labels[winning_index]),
            confidence=float(probabilities[winning_index]),
            duration_seconds=round(len(audio) / TARGET_SAMPLE_RATE, 2),
            truncated=truncated,
            file_name=file_name,
            model_id=MODEL_ID,
            temporary_file_purged=True,
        )
    except HTTPException:
        raise
    except AudioDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
            headers={"Retry-After": "30"},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Analysis could not be completed right now. Please retry shortly.",
            headers={"Retry-After": "30"},
        ) from exc
    finally:
        await file.close()
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass