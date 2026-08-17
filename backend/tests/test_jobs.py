import dataclasses
from datetime import datetime, timedelta, timezone

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


def _set_song_timestamps(client, song_id: str, *, created_at=None, last_played_at=None) -> None:
    # Same "reach into the test DB session directly" approach as
    # _job_id_for_song — lets tests simulate age without sleeping.
    from app.db import get_db
    from app.main import app
    from app.models import Song

    db = next(app.dependency_overrides[get_db]())
    song = db.get(Song, song_id)
    if created_at is not None:
        song.created_at = created_at
    if last_played_at is not None:
        song.last_played_at = last_played_at
    db.commit()


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


def test_get_stems_returns_presigned_urls(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    client.post(
        f"/internal/jobs/{job_id}/complete",
        json={
            "stems": [
                {"kind": "vocals", "r2_key": f"songs/{song['id']}/stems/vocals.wav"},
                {"kind": "drums", "r2_key": f"songs/{song['id']}/stems/drums.wav"},
            ]
        },
        headers={"X-Internal-Secret": "test-secret"},
    )

    response = client.get(f"/songs/{song['id']}/stems")
    assert response.status_code == 200
    stems = response.json()
    assert {s["kind"] for s in stems} == {"vocals", "drums"}
    assert all(s["url"].startswith("http") for s in stems)


def test_get_stems_not_found(client) -> None:
    assert client.get("/songs/does-not-exist/stems").status_code == 404


def test_get_chords_returns_events_sorted_by_start_time(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    client.post(
        f"/internal/jobs/{job_id}/complete",
        json={
            "stems": [],
            "chords": [
                {"start_time": 4.0, "end_time": 8.0, "chord_label": "A:min", "confidence": 1.0},
                {"start_time": 0.0, "end_time": 4.0, "chord_label": "C:maj", "confidence": 1.0},
            ],
        },
        headers={"X-Internal-Secret": "test-secret"},
    )

    response = client.get(f"/songs/{song['id']}/chords")
    assert response.status_code == 200
    chords = response.json()
    assert [c["chord_label"] for c in chords] == ["C:maj", "A:min"]


def test_get_chords_defaults_to_empty_list(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    client.post(
        f"/internal/jobs/{job_id}/complete",
        json={"stems": []},
        headers={"X-Internal-Secret": "test-secret"},
    )

    assert client.get(f"/songs/{song['id']}/chords").json() == []


def test_get_chords_not_found(client) -> None:
    assert client.get("/songs/does-not-exist/chords").status_code == 404


def test_stale_processing_job_marked_failed_on_get(client, monkeypatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "settings", dataclasses.replace(main_module.settings, job_timeout_seconds=0))
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")

    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    response = client.get(f"/jobs/{job_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["error"] == "Timed out waiting for separation to complete."


def test_stale_processing_job_marked_failed_on_list(client, monkeypatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "settings", dataclasses.replace(main_module.settings, job_timeout_seconds=0))
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")

    song = _upload(client)

    updated = next(s for s in client.get("/songs").json() if s["id"] == song["id"])
    assert updated["job_status"] == "failed"


def test_fresh_processing_job_not_expired(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")

    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    response = client.get(f"/jobs/{job_id}")
    assert response.json()["status"] == "processing"


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


def test_fail_callback_deletes_original_upload(client, monkeypatch) -> None:
    import botocore.exceptions

    from app import storage

    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])
    original_key = f"songs/{song['id']}/original/track.mp3"

    storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)

    client.post(
        f"/internal/jobs/{job_id}/fail",
        json={"error": "demucs blew up"},
        headers={"X-Internal-Secret": "test-secret"},
    )

    with pytest.raises(botocore.exceptions.ClientError):
        storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)


def test_stale_pending_job_marked_failed_on_list(client, monkeypatch) -> None:
    # No trigger_separation stub here — the job stays "pending" (real Modal
    # creds aren't configured in tests) same as test_upload_without_modal_configured_stays_pending.
    import app.main as main_module

    monkeypatch.setattr(main_module, "settings", dataclasses.replace(main_module.settings, job_timeout_seconds=0))

    song = _upload(client)
    assert song["job_status"] == "pending"

    updated = next(s for s in client.get("/songs").json() if s["id"] == song["id"])
    assert updated["job_status"] == "failed"


def test_stale_processing_job_deletes_original_on_list(client, monkeypatch) -> None:
    import botocore.exceptions

    import app.main as main_module
    from app import storage

    monkeypatch.setattr(main_module, "settings", dataclasses.replace(main_module.settings, job_timeout_seconds=0))
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")

    song = _upload(client)
    original_key = f"songs/{song['id']}/original/track.mp3"
    storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)

    client.get("/songs")

    with pytest.raises(botocore.exceptions.ClientError):
        storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)


def test_freshly_completed_song_not_expired(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])

    client.post(
        f"/internal/jobs/{job_id}/complete",
        json={"stems": [{"kind": "vocals", "r2_key": f"songs/{song['id']}/stems/vocals.wav"}]},
        headers={"X-Internal-Secret": "test-secret"},
    )

    listed = client.get("/songs").json()
    assert any(s["id"] == song["id"] for s in listed)


def test_expired_completed_song_deletes_stems_and_drops_from_list(client, monkeypatch) -> None:
    import botocore.exceptions

    from app import storage

    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])
    stem_key = f"songs/{song['id']}/stems/vocals.wav"

    # The /complete callback only records the r2_key — the actual object is
    # written by the Modal function (modal_app.py), which nothing in this
    # test suite runs. Put it directly so there's something real to expire.
    storage._client.put_object(Bucket=storage.settings.s3_bucket, Key=stem_key, Body=b"fake stem audio")

    client.post(
        f"/internal/jobs/{job_id}/complete",
        json={"stems": [{"kind": "vocals", "r2_key": stem_key}]},
        headers={"X-Internal-Secret": "test-secret"},
    )
    storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=stem_key)

    # Never played (last_played_at stays null) — expiry must fall back to
    # created_at rather than never firing. Default retention is 1 day; back
    # created_at up by 2 to land clearly past the threshold.
    _set_song_timestamps(client, song["id"], created_at=datetime.now(timezone.utc) - timedelta(days=2))

    listed = client.get("/songs").json()
    assert not any(s["id"] == song["id"] for s in listed)
    with pytest.raises(botocore.exceptions.ClientError):
        storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=stem_key)


def test_playing_stems_resets_expiry_clock(client, monkeypatch) -> None:
    monkeypatch.setattr("app.main.separation.trigger_separation", lambda *a, **k: "call-123")
    song = _upload(client)
    job_id = _job_id_for_song(client, song["id"])
    stem_key = f"songs/{song['id']}/stems/vocals.wav"

    client.post(
        f"/internal/jobs/{job_id}/complete",
        json={"stems": [{"kind": "vocals", "r2_key": stem_key}]},
        headers={"X-Internal-Secret": "test-secret"},
    )

    # Without a play, this created_at alone would already be past the
    # default 1-day retention window on the /songs call below.
    _set_song_timestamps(client, song["id"], created_at=datetime.now(timezone.utc) - timedelta(days=2))

    # Playing bumps last_played_at to "now", which should override the old
    # created_at for the expiry check.
    client.get(f"/songs/{song['id']}/stems")

    listed = client.get("/songs").json()
    assert any(s["id"] == song["id"] for s in listed)
