# Verity Voice living spec

## What it does
Verity Voice accepts WAV, MP3, M4A, and browser-recorded WebM audio, decodes and normalizes it to mono 16 kHz, then classifies the first 60 seconds with `MelodyMachine/Deepfake-audio-detection-V2`.

## Data model
`AnalysisResult`: string id, `classification` (`AI-generated` or `Likely human`), 0–1 confidence, analyzed duration, truncation flag, original file name, model id, and temporary-file-purged status. Results are held only in the current browser view; no analysis history is stored.

## Key flows
- Upload: choose or drag a supported file up to 25 MB, preview it, then analyze.
- Record: grant microphone access, record/pause/resume up to 60 seconds, preview the resulting WebM, then analyze.
- Result: show classification, confidence meter, duration, purge status, and a probabilistic/non-forensic disclaimer.
- Failure: unsupported/oversized/decode errors are friendly inline errors; model download or availability errors are retryable 503 responses and never mocked.

## Auth and roles
No authentication or gated areas. This is a hackathon screening demo.

## Integration
The model and its Transformers/PyTorch runtime load lazily on the first analysis. Uploaded temp files are removed in a `finally` block after every analysis attempt.