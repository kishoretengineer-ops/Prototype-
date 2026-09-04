import io
import math
import struct
import wave


def wav_bytes(seconds=0.25, sample_rate=16000):
    frames = b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * 440 * i / sample_rate))) for i in range(int(seconds * sample_rate)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(frames)
    return buf.getvalue()


def test_analyze_real_wav_reaches_model(client):
    response = client.post("/analyze", files={"file": ("tscheck-analysis.wav", wav_bytes(), "audio/wav")})
    assert response.status_code in (200, 503), response.text
    body = response.json()
    if response.status_code == 200:
        assert body["classification"] in ("AI-generated", "Likely human")
        assert 0 <= body["confidence"] <= 1
        assert body["duration_seconds"] > 0
        assert body["temporary_file_purged"] is True
        assert body["model_id"] == "MelodyMachine/Deepfake-audio-detection-V2"
    else:
        assert "retry" in body["detail"].lower() or "unavailable" in body["detail"].lower()
