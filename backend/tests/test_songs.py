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
