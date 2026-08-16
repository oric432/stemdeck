import dataclasses

import pytest


@pytest.fixture(autouse=True)
def _internal_secret(monkeypatch):
    # Settings is a frozen dataclass, so patch the module-level binding
    # `app.main` actually reads from, not an attribute on the instance.
    from app.config import settings

    monkeypatch.setattr(
        "app.main.settings",
        dataclasses.replace(settings, internal_api_secret="test-secret"),
    )


def _upload(client) -> dict:
    return client.post(
        "/songs",
        files={"file": ("track.mp3", b"fake audio bytes", "audio/mpeg")},
    ).json()


def _job_id_for_song(client, song_id: str) -> str:
    # No endpoint exposes "the job for this song" directly (frontend polls
    # /songs, which already embeds job_status) — reach into the test DB
    # session directly instead.
    from app.db import get_db
    from app.main import app
    from app.models import Job

    db = next(app.dependency_overrides[get_db]())
    return db.query(Job).filter(Job.song_id == song_id).one().id


def test_upload_without_modal_configured_stays_pending(client) -> None:
    # No real Modal credentials in the test env, so the trigger fails and
    # the job is left pending rather than the upload request itself failing.
    song = _upload(client)
    assert song["job_status"] == "pending"


def test_successful_trigger_moves_job_to_processing(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    assert song["job_status"] == "processing"


def test_get_job_not_found(client) -> None:
    assert client.get("/jobs/does-not-exist").status_code == 404


def test_get_job_returns_status(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    response = client.get(f"/jobs/{job_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "processing"


def test_complete_callback_requires_secret(client) -> None:
    response = client.post("/internal/jobs/some-id/complete", json={"stems": []})
    assert response.status_code == 401


def test_complete_callback_rejects_wrong_secret(client) -> None:
    response = client.post(
        "/internal/jobs/some-id/complete",
        json={"stems": []},
        headers={"X-Internal-Secret": "wrong"},
    )
    assert response.status_code == 401


def test_complete_callback_creates_stems_and_updates_status(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    response = client.post(
        f"/internal/jobs/{job_id}/complete",
        json={"stems": [{"kind": "vocals", "r2_key": f"songs/{song['id']}/stems/vocals.wav"}]},
        headers={"X-Internal-Secret": "test-secret"},
    )
    assert response.status_code == 200

    updated = next(s for s in client.get("/songs").json() if s["id"] == song["id"])
    assert updated["job_status"] == "complete"


def test_complete_callback_deletes_original_upload(client, monkeypatch) -> None:
    import botocore.exceptions

    from app import storage

    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])
    original_key = f"songs/{song['id']}/original/track.mp3"

    # Confirm it's actually there before completing, not just assume it.
    storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)

    client.post(
        f"/internal/jobs/{job_id}/complete",
        json={"stems": []},
        headers={"X-Internal-Secret": "test-secret"},
    )

    with pytest.raises(botocore.exceptions.ClientError):
        storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)


def test_fail_callback_records_error(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    response = client.post(
        f"/internal/jobs/{job_id}/fail",
        json={"error": "demucs blew up"},
        headers={"X-Internal-Secret": "test-secret"},
    )
    assert response.status_code == 200

    updated = next(s for s in client.get("/songs").json() if s["id"] == song["id"])
    assert updated["job_status"] == "failed"
