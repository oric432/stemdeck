import pytest


def test_upload_then_list_returns_pending_job(client) -> None:
    response = client.post(
        "/songs",
        files={"file": ("practice-track.mp3", b"fake audio bytes", "audio/mpeg")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "practice-track.mp3"
    assert body["job_status"] == "pending"

    listed = client.get("/songs").json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_list_is_empty_with_no_songs(client) -> None:
    assert client.get("/songs").json() == []


def test_get_song_returns_it(client) -> None:
    created = client.post(
        "/songs",
        files={"file": ("practice-track.mp3", b"fake audio bytes", "audio/mpeg")},
    ).json()

    response = client.get(f"/songs/{created['id']}")
    assert response.status_code == 200
    assert response.json()["title"] == "practice-track.mp3"


def test_get_song_not_found(client) -> None:
    assert client.get("/songs/does-not-exist").status_code == 404


def test_delete_song_removes_it_from_list(client) -> None:
    song = client.post(
        "/songs",
        files={"file": ("practice-track.mp3", b"fake audio bytes", "audio/mpeg")},
    ).json()

    response = client.delete(f"/songs/{song['id']}")
    assert response.status_code == 204

    assert client.get("/songs").json() == []
    assert client.get(f"/songs/{song['id']}").status_code == 404


def test_delete_song_deletes_original_upload(client) -> None:
    import botocore.exceptions

    from app import storage

    song = client.post(
        "/songs",
        files={"file": ("practice-track.mp3", b"fake audio bytes", "audio/mpeg")},
    ).json()
    original_key = f"songs/{song['id']}/original/practice-track.mp3"
    storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)

    client.delete(f"/songs/{song['id']}")

    with pytest.raises(botocore.exceptions.ClientError):
        storage._client.head_object(Bucket=storage.settings.s3_bucket, Key=original_key)


def test_delete_song_not_found(client) -> None:
    assert client.delete("/songs/does-not-exist").status_code == 404


def test_list_respects_limit_and_offset(client) -> None:
    for i in range(5):
        client.post(
            "/songs",
            files={"file": (f"track-{i}.mp3", b"fake audio bytes", "audio/mpeg")},
        )

    first_page = client.get("/songs", params={"limit": 2, "offset": 0}).json()
    second_page = client.get("/songs", params={"limit": 2, "offset": 2}).json()

    assert len(first_page) == 2
    assert len(second_page) == 2
    assert {s["id"] for s in first_page}.isdisjoint({s["id"] for s in second_page})

    # Newest first (created_at desc, same ordering as the unpaginated list),
    # so paging through should walk every song exactly once with no gaps.
    all_ids = [s["id"] for s in client.get("/songs").json()]
    assert [s["id"] for s in first_page] + [s["id"] for s in second_page] == all_ids[:4]


def test_list_without_pagination_params_returns_everything(client) -> None:
    for i in range(3):
        client.post(
            "/songs",
            files={"file": (f"track-{i}.mp3", b"fake audio bytes", "audio/mpeg")},
        )

    assert len(client.get("/songs").json()) == 3
