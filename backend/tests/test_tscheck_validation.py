import io


def test_analyze_rejects_unsupported_extension(client):
    response = client.post("/analyze", files={"file": ("tscheck-invalid.txt", io.BytesIO(b"not audio"), "text/plain")})
    assert response.status_code == 415
    assert "Unsupported format" in response.json()["detail"]


def test_analyze_rejects_oversized_upload(client):
    response = client.post("/analyze", files={"file": ("tscheck-large.wav", io.BytesIO(b"x" * (25 * 1024 * 1024 + 1)), "audio/wav")})
    assert response.status_code == 413
    assert "25 MB" in response.json()["detail"]
